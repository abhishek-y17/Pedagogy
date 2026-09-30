// Classic script. Supabase sync layer — plain fetch, no SDK (keeps the zero-
// dependency static setup, works from file://, nothing extra to load over venue
// wifi). Two responsibilities:
//
//  1. Visitor devices: an outbox. finalizeDraft() (js/state.js) has already saved
//     the record to localStorage instantly with meta.synced === false; this file
//     pushes it to Supabase in the background via the submit_registration() RPC
//     (the anon key can call nothing else — see supabase/migrations/0001_init.sql),
//     retrying on a timer, on the browser `online` event and when the tab becomes
//     visible again. Visitor UI never waits on any of this.
//  2. Staff: Supabase Auth email+password (session in sessionStorage only, so it
//     dies with the tab), reading registrations and resolving duplicates.
//
// With no config (js/generated/config.js empty — file://, tests, missing env) every
// network path is a no-op and the app is exactly the old local-only build.
(function () {
  'use strict';
  window.PED = window.PED || {};

  const RETRY_INTERVAL_MS = 30000;
  const REQUEST_TIMEOUT_MS = 15000;
  const PAGE_SIZE = 1000;                 // PostgREST's default max rows per request
  const SESSION_KEY = 'pedagogy-staff-session';

  const cfg = () => window.PED_CONFIG || {};
  const isEnabled = () => !!(cfg().supabaseUrl && cfg().supabaseAnonKey);

  const status = { lastSyncAt: null, lastError: null, flushing: false };
  const listeners = new Set();
  function notify() { listeners.forEach(fn => { try { fn(getStatus()); } catch (e) { /* ignore */ } }); }
  function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

  function getStatus() {
    const records = window.PED.state.loadRecords();
    const pending = records.filter(r => r.meta && r.meta.synced === false);
    return {
      enabled: isEnabled(),
      online: typeof navigator === 'undefined' ? true : navigator.onLine !== false,
      unsynced: pending.filter(r => !r.meta.syncError).length,
      rejected: pending.filter(r => r.meta.syncError).length,
      lastSyncAt: status.lastSyncAt,
      lastError: status.lastError,
      flushing: status.flushing,
    };
  }

  /** fetch wrapper: timeout + JSON + a uniform error shape. err.status is the
   * HTTP status (0 = network failure/timeout), err.message the server's text. */
  async function request(path, { method = 'GET', body, token, headers = {} } = {}) {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS) : null;
    let res;
    try {
      res = await fetch(cfg().supabaseUrl + path, {
        method,
        headers: {
          apikey: cfg().supabaseAnonKey,
          Authorization: `Bearer ${token || cfg().supabaseAnonKey}`,
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...headers,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: ctrl ? ctrl.signal : undefined,
      });
    } catch (e) {
      const err = new Error('Network unavailable');
      err.status = 0;
      throw err;
    } finally {
      if (timer) clearTimeout(timer);
    }
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch (e) { /* non-JSON body */ }
    if (!res.ok) {
      const err = new Error((json && (json.message || json.error_description || json.msg || json.error)) || `HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return { json, headers: res.headers };
  }

  // ---------------------------------------------------------------- outbox ---

  /** The stored record minus device-local bookkeeping the server doesn't need. */
  function payloadFor(record) {
    const meta = { ...record.meta };
    delete meta.synced; delete meta.syncedAt; delete meta.syncError;
    return { ...record, meta };
  }

  /** Permanent failure = the server understood and rejected it (validation). Anything
   * else — network, 5xx, 408/429, auth-ish gateway hiccups — is worth retrying. */
  function isPermanent(err) {
    return err.status >= 400 && err.status < 500 && err.status !== 408 && err.status !== 429;
  }

  /** Push every waiting record, oldest first, one at a time. Single-flight; safe
   * to call from anywhere, any number of times. Resolves to getStatus(). */
  async function flushOutbox() {
    if (!isEnabled() || status.flushing) return getStatus();
    status.flushing = true;
    notify();
    try {
      for (const rec of window.PED.state.loadUnsynced()) {
        try {
          const { json } = await request('/rest/v1/rpc/submit_registration', { method: 'POST', body: { payload: payloadFor(rec) } });
          window.PED.state.markSynced(rec.meta.id, json);
          status.lastSyncAt = new Date().toISOString();
          status.lastError = null;
        } catch (err) {
          if (isPermanent(err)) {
            window.PED.state.markSyncError(rec.meta.id, `${err.status}: ${err.message}`);
            status.lastError = err.message;
            continue;               // don't let one bad record block the rest
          }
          status.lastError = err.message;
          break;                    // offline / server trouble: stop, retry later
        }
      }
    } finally {
      status.flushing = false;
      notify();
    }
    return getStatus();
  }

  let started = false;
  function start() {
    if (started || !isEnabled()) return;
    started = true;
    const kick = () => { flushOutbox(); };
    window.addEventListener('online', kick);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') kick(); });
    setInterval(() => { if (window.PED.state.loadUnsynced().length) kick(); }, RETRY_INTERVAL_MS);
    kick();
  }

  // ----------------------------------------------------------- staff (Auth) ---

  function readSession() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch (e) { return null; }
  }
  function writeSession(s) {
    try {
      if (s) sessionStorage.setItem(SESSION_KEY, JSON.stringify(s)); else sessionStorage.removeItem(SESSION_KEY);
    } catch (e) { /* ignore */ }
  }
  function toSession(json, fallbackEmail) {
    return {
      access_token: json.access_token,
      refresh_token: json.refresh_token,
      expires_at: Date.now() + (json.expires_in || 3600) * 1000,
      email: (json.user && json.user.email) || fallbackEmail,
    };
  }

  const staffSession = () => { const s = readSession(); return s ? { email: s.email } : null; };

  /** Password login, then confirms the account is on the staff allowlist
   * (RLS would otherwise just return zero rows and look like "no data"). */
  async function staffSignIn(email, password) {
    if (!isEnabled()) throw new Error('Backend not configured on this device.');
    let json;
    try {
      ({ json } = await request('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } }));
    } catch (err) {
      if (err.status === 0) throw new Error('Can’t reach the server — check the connection and try again.');
      throw new Error('Incorrect email or password.');
    }
    const session = toSession(json, email);
    const { json: allowed } = await request('/rest/v1/rpc/is_staff', { method: 'POST', body: {}, token: session.access_token });
    if (allowed !== true) {
      request('/auth/v1/logout', { method: 'POST', token: session.access_token }).catch(() => {});
      throw new Error('This account isn’t authorized for the staff dashboard.');
    }
    writeSession(session);
    return { email: session.email };
  }

  async function staffSignOut() {
    const s = readSession();
    writeSession(null);
    if (s && isEnabled()) request('/auth/v1/logout', { method: 'POST', token: s.access_token }).catch(() => {});
  }

  /** Valid access token, refreshing shortly before expiry. Throws err.status 401 if the session is gone. */
  async function accessToken() {
    const s = readSession();
    if (!s) { const e = new Error('Not signed in'); e.status = 401; throw e; }
    if (s.expires_at - Date.now() > 60000) return s.access_token;
    try {
      const { json } = await request('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: s.refresh_token } });
      const next = toSession(json, s.email);
      writeSession(next);
      return next.access_token;
    } catch (err) {
      if (err.status === 0) throw err;          // offline: keep the session, try again later
      writeSession(null);
      const e = new Error('Session expired — please sign in again.');
      e.status = 401;
      throw e;
    }
  }

  const SELECT = 'id,raw,created_at,submitted_at,device_id,duplicate_flag,duplicate_of_ids,duplicate_review_status,reviewed_by,reviewed_at';

  /** Server row -> the record shape js/staff.js already renders. The raw record
   * is what the device sent; the duplicate fields are server-authoritative. */
  function rowToRecord(row) {
    const rec = row.raw || {};
    rec.meta = {
      ...(rec.meta || {}),
      id: row.id,
      createdAt: row.submitted_at || row.created_at,
      deviceId: row.device_id,
      duplicateFlag: row.duplicate_flag,
      duplicateOfIds: row.duplicate_of_ids || [],
      duplicateReviewStatus: row.duplicate_review_status,
      reviewedBy: row.reviewed_by,
      reviewedAt: row.reviewed_at,
    };
    return rec;
  }

  /** Every registration (staff only), newest first, paging past PostgREST's row cap. */
  async function fetchRegistrations() {
    const token = await accessToken();
    const rows = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      let json;
      try {
        ({ json } = await request(`/rest/v1/registrations?select=${SELECT}&order=created_at.desc,id.desc&limit=${PAGE_SIZE}&offset=${from}`, { token }));
      } catch (err) {
        if (err.status === 401 || err.status === 403) { writeSession(null); err.status = 401; }
        throw err;
      }
      rows.push(...(json || []));
      if (!json || json.length < PAGE_SIZE) break;
    }
    return rows.map(rowToRecord);
  }

  async function resolveDuplicate(id, statusValue) {
    const token = await accessToken();
    const { json } = await request('/rest/v1/rpc/resolve_duplicate', { method: 'POST', token, body: { p_id: id, p_status: statusValue } });
    return json;
  }

  window.PED.sync = {
    isEnabled, getStatus, onChange, start, flushOutbox,
    staffSignIn, staffSignOut, staffSession, fetchRegistrations, resolveDuplicate,
  };
})();
