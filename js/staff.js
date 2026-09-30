// Classic script. Staff dashboard. Two modes, chosen by whether Supabase is
// configured on this deployment (js/sync.js):
//  * Remote (production): Supabase Auth email+password login -> reads EVERY
//    device's registrations from Supabase (polled every ~10s while visible),
//    duplicate resolution via the resolve_duplicate() RPC. The PIN is gone.
//  * Local (no config: file://, tests, missing env): the original behaviour —
//    reads this device's localStorage records; app.js keeps the casual PIN gate.
// Reached only through app.js's long-press-the-logo gate.
(function () {
  'use strict';
  window.PED = window.PED || {};
  const { escapeHtml } = window.PED.chips;

  function fmtDate(iso) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString(); } catch (e) { return iso; }
  }

  function streamLabel(datasets, curriculum, streamId) {
    if (!streamId) return 'Not applicable / no stream';
    const opts = window.PED.questions.getStreamOptions(datasets.curriculumSubjects, curriculum);
    const match = opts.find(o => o.id === streamId);
    return match ? match.label : streamId;
  }

  function gradeLabel(curriculum, value) {
    const options = window.PED.registration.gradeOptionsFor(curriculum);
    const match = options.find(o => o.value === value);
    return match ? match.label : (value || '—');
  }

  /** One record's full detail card — every field the standing decisions call
   * out as "must not be invisible to staff": DOB, both phone numbers,
   * T&Cs/consent/marketing-opt-in timestamps, school + curriculum and
   * destinations, alongside the fields the review screen already showed the
   * visitor so staff see the same picture without cross-referencing two
   * screens. registration.marketingOptIn (round D item 1) replaced the old
   * orphaned `followUp.marketing` field from round C — it now lives on
   * Registration like T&Cs/consent, not a separate step. */
  function renderRecordCard(record, datasets, onAction) {
    const r = record.registration;
    const p = record.preferences;
    const m = record.meta;

    // Pick order (1st choice first) when recorded; older records fall back to grid-then-overlay order.
    const destinationList = (p.destinationOrder && p.destinationOrder.length)
      ? p.destinationOrder.map((d, i) => `${i + 1}. ${d}`)
      : [...(p.destinations || []).filter(d => d !== 'Other'), ...(p.destinationsOther || [])];
    const answeredCount = (record.quiz.answers || []).filter(a => a.selected != null).length;
    const totalQuestions = (record.quiz.selectedQuestionIds || []).length;

    // Information only: staff see that a record is a possible duplicate and of which
    // ids, but the dashboard offers no review/merge actions (client decision).
    const duplicateBadge = m.duplicateFlag ? '<span class="badge badge--duplicate">Possible duplicate</span>' : '';
    const duplicateActions = m.duplicateFlag
      ? `<p class="field-hint">Possible duplicate of: ${(m.duplicateOfIds || []).map(escapeHtml).join(', ')}</p>`
      : '';

    return `
      <section class="review-section staff-record${m.duplicateFlag ? ' staff-record--flagged' : ''}">
        <div class="review-section-head">
          <h3>${escapeHtml(r.name || 'Unnamed')} <span class="field-hint" style="display:inline;margin:0 0 0 8px;">${escapeHtml(m.id)}</span></h3>
          ${duplicateBadge}
        </div>
        <dl class="review-fields">
          <div><dt>Date of birth</dt><dd>${escapeHtml(r.dob)}</dd></div>
          <div><dt>Parent / guardian mobile</dt><dd>${escapeHtml(r.parentMobile)}</dd></div>
          <div><dt>Student mobile</dt><dd>${escapeHtml(r.studentMobile || '— (not given)')}</dd></div>
          <div><dt>School</dt><dd>${escapeHtml(r.school || '—')}</dd></div>
          <div><dt>Curriculum</dt><dd>${escapeHtml(r.curriculum || '—')}</dd></div>
          <div><dt>Grade</dt><dd>${escapeHtml(r.curriculum ? gradeLabel(r.curriculum, r.grade) : (r.grade || '—'))}</dd></div>
          <div><dt>Stream</dt><dd>${escapeHtml(streamLabel(datasets, r.curriculum, r.stream))}</dd></div>
          <div><dt>T&amp;Cs accepted</dt><dd>${r.tcsAccepted ? escapeHtml(fmtDate(r.tcsAcceptedAt)) : 'Not accepted'}</dd></div>
          <div><dt>Consent to contact</dt><dd>${r.consentToContact ? escapeHtml(fmtDate(r.consentToContactAt)) : 'Not given'}</dd></div>
          <div><dt>Marketing opt-in</dt><dd>${r.marketingOptIn ? escapeHtml(fmtDate(r.marketingOptInAt)) : 'No'}</dd></div>
          <div><dt>Destinations</dt><dd>${escapeHtml(destinationList.length ? destinationList.join(', ') : 'None selected')}</dd></div>
          <div><dt>Quiz completion</dt><dd>${answeredCount} / ${totalQuestions} answered (${escapeHtml(record.mode)} path)</dd></div>
          <div><dt>Submitted</dt><dd>${escapeHtml(fmtDate(m.createdAt))}</dd></div>
          <div><dt>Device</dt><dd>${escapeHtml(m.deviceId || '—')}</dd></div>
        </dl>
        ${duplicateActions}
      </section>
    `;
  }

  /** A genuinely destructive, staff-only reset — added per PLAN.md Phase 6's
   * "a way to reset devices between test runs" plus a repeated live request
   * to clear leftover test/demo data. Confirms via the same native confirm()
   * pattern app.js's "New visitor" reset already uses for a comparable
   * destructive action, then wipes every finalized record and the
   * in-progress draft on this device (js/state.js's clearAllData()) and
   * re-renders the (now empty) dashboard in place.
   *
   * codexreview.md finding, fixed here: clearAllData() only ever wiped
   * localStorage — it never touched app.js's own in-memory `draft` variable,
   * so if a visitor had an in-progress registration open in memory when staff
   * cleared data, the existing autosave handlers (visibilitychange/pagehide)
   * would write that stale in-memory draft straight back to localStorage the
   * next time the tab backgrounded or closed, silently undoing the clear.
   * `onDataCleared` (passed in from app.js, which is the only closure that
   * actually holds the `draft` reference) replaces that in-memory draft with
   * a genuinely fresh one immediately after the storage wipe, so there's
   * nothing stale left for autosave to resurrect. */
  function renderClearAllButton() {
    return `<button type="button" class="quiet staff-clear-all" id="staffClearAllBtn">Clear all local data</button>`;
  }

  function wireClearAllButton(container, datasets, onDataCleared, onExit) {
    container.querySelector('#staffClearAllBtn').addEventListener('click', () => {
      const count = window.PED.state.loadRecords().length;
      // Only ever wipes THIS device's copy — never anything already on the server.
      // Records still waiting to sync would be lost for good, so say so loudly.
      const unsynced = window.PED.state.loadRecords().filter(r => r.meta && r.meta.synced === false).length;
      const warning = (count
        ? `Permanently delete all ${count} registration record${count === 1 ? '' : 's'} and the in-progress draft on this device? This cannot be undone.`
        : 'Clear the in-progress draft on this device? This cannot be undone.')
        + (unsynced ? `\n\nWARNING: ${unsynced} of these have NOT been synced to the server yet and will be lost.` : '');
      if (!confirm(warning)) return;
      window.PED.state.clearAllData();
      if (onDataCleared) onDataCleared();
      renderStaffDashboard(container, datasets, onDataCleared, onExit);
    });
  }

  /** Client feedback (2026-09-29): "an actual dashboard" — a visible stats
   * bar (total registered, submitted today, pending duplicate reviews) above
   * the per-record card list, instead of the count only ever showing up
   * buried inside the step heading. "Today" compares each record's
   * meta.createdAt against the device's local calendar day, same basis staff
   * are already reading fmtDate() timestamps in. */
  function renderStatsBar(records) {
    const todayKey = new Date().toDateString();
    const todayCount = records.filter(r => {
      const d = r.meta && r.meta.createdAt ? new Date(r.meta.createdAt) : null;
      return d && d.toDateString() === todayKey;
    }).length;
    const pendingCount = records.filter(r => r.meta.duplicateFlag).length;
    return `
      <div class="staff-stats">
        <div class="staff-stat"><strong>${records.length}</strong><span>Total registered</span></div>
        <div class="staff-stat"><strong>${todayCount}</strong><span>Registered today</span></div>
        <div class="staff-stat${pendingCount ? ' staff-stat--attention' : ''}"><strong>${pendingCount}</strong><span>Possible duplicates</span></div>
      </div>
    `;
  }

  function renderLocalDashboard(container, datasets, onDataCleared, onExit) {
    const records = window.PED.state.loadRecords();

    // Root cause of the refresh bug (round C item 9b): this empty-state
    // branch never rendered a Refresh control at all. A dashboard opened
    // before any registrations existed had no way to pick up new
    // submissions — the populated branch's own Refresh button (below) always
    // re-reads localStorage correctly, but staff had no way to reach it
    // without fully closing the dashboard and re-entering the PIN. Every
    // branch now renders the same Refresh button so it's always reachable
    // regardless of record count.
    if (!records.length) {
      container.innerHTML = `
        <p class="eyebrow-small">STAFF DASHBOARD</p>
        ${renderStatsBar(records)}
        <h2 class="step-heading">No registrations yet.</h2>
        <p class="field-hint">Finalized entries will appear here as visitors submit the review screen.</p>
        <div class="step-actions">
          <button type="button" class="quiet" id="staffRefreshBtn">Refresh</button>
          ${renderClearAllButton()}
        </div>
      `;
      container.querySelector('#staffRefreshBtn').addEventListener('click', () => renderStaffDashboard(container, datasets, onDataCleared, onExit));
      wireClearAllButton(container, datasets, onDataCleared, onExit);
      return;
    }

    // Pending-duplicate reviews surface first — the standing decision is that
    // a likely duplicate must never sit unnoticed, so it shouldn't be
    // buried at the bottom of a long, newest-first list either.
    const sorted = records.slice().sort((a, b) => {
      const aPending = a.meta.duplicateFlag && a.meta.duplicateReviewStatus === 'pending';
      const bPending = b.meta.duplicateFlag && b.meta.duplicateReviewStatus === 'pending';
      if (aPending !== bPending) return aPending ? -1 : 1;
      return (b.meta.createdAt || '').localeCompare(a.meta.createdAt || '');
    });

    container.innerHTML = `
      <p class="eyebrow-small">STAFF DASHBOARD</p>
      ${renderStatsBar(records)}
      <p class="field-hint">Reads directly from this device's saved records. Refresh after new submissions on this device.</p>
      <div class="step-actions">
        <button type="button" class="quiet" id="staffRefreshBtn">Refresh</button>
        ${renderClearAllButton()}
      </div>
      <div id="staffRecordList">${sorted.map(r => renderRecordCard(r, datasets)).join('')}</div>
    `;

    container.querySelector('#staffRefreshBtn').addEventListener('click', () => renderStaffDashboard(container, datasets, onDataCleared, onExit));
    wireClearAllButton(container, datasets, onDataCleared, onExit);
  }

  // ------------------------------------------------------------- remote mode ---

  const POLL_MS = 10000;
  const RENDER_LIMIT = 150;
  let pollTimer = null;
  let lastRecords = null;      // last successful fetch, kept for "server unreachable" banners
  let lastSignature = '';
  let lastFetchedAt = null;
  let showAll = false;

  function stopPolling() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }

  function renderLogin(container, datasets, onDataCleared, onExit, message) {
    stopPolling();
    container.innerHTML = `
      <div class="staff-login-wrap">
        <form id="staffLoginForm" class="staff-login-card" autocomplete="off" novalidate>
          <p class="eyebrow-small">STAFF DASHBOARD</p>
          <h2 class="step-heading">Staff sign-in</h2>
          <p class="field-hint">Sign in with your Pedagogy staff account to see registrations from every device.</p>

          <div class="staff-field">
            <label for="staffEmail">Email</label>
            <input type="email" id="staffEmail" required autocomplete="username" autocapitalize="off" spellcheck="false" inputmode="email" placeholder="name@example.com">
          </div>
          <div class="staff-field">
            <label for="staffPassword">Password</label>
            <div class="password-field">
              <input type="password" id="staffPassword" required autocomplete="current-password" placeholder="Your password">
              <button type="button" class="password-toggle" id="staffPwToggle" aria-pressed="false" aria-controls="staffPassword">Show</button>
            </div>
          </div>

          <p class="field-error" id="staffLoginError" role="alert" ${message ? '' : 'hidden'}>${escapeHtml(message || '')}</p>
          <button type="submit" class="primary staff-login-submit" id="staffLoginBtn">Sign in</button>
          <button type="button" class="quiet staff-login-back" id="staffExitBtn">Back to visitor screen</button>
        </form>
      </div>
    `;
    const errEl = container.querySelector('#staffLoginError');
    const pwInput = container.querySelector('#staffPassword');
    const pwToggle = container.querySelector('#staffPwToggle');
    pwToggle.addEventListener('click', () => {
      const show = pwInput.type === 'password';
      pwInput.type = show ? 'text' : 'password';
      pwToggle.textContent = show ? 'Hide' : 'Show';
      pwToggle.setAttribute('aria-pressed', String(show));
      pwInput.focus();
    });
    container.querySelector('#staffExitBtn').addEventListener('click', () => { if (onExit) onExit(); });
    const emailInput = container.querySelector('#staffEmail');
    // A stale error (e.g. "Enter your email and password.") disappears as soon as they type.
    [emailInput, pwInput].forEach(el => el.addEventListener('input', () => { errEl.hidden = true; }));
    emailInput.focus();
    container.querySelector('#staffLoginForm').addEventListener('submit', async e => {
      e.preventDefault();
      const btn = container.querySelector('#staffLoginBtn');
      const email = emailInput.value.trim();
      if (!email || !pwInput.value) {
        errEl.textContent = 'Enter your email and password.';
        errEl.hidden = false;
        (email ? pwInput : emailInput).focus();
        return;
      }
      btn.disabled = true; btn.textContent = 'Signing in…'; errEl.hidden = true;
      try {
        await window.PED.sync.staffSignIn(email, pwInput.value);
        showAll = false; lastRecords = null; lastSignature = '';
        renderStaffDashboard(container, datasets, onDataCleared, onExit);
      } catch (err) {
        errEl.textContent = err.message; errEl.hidden = false;
        btn.disabled = false; btn.textContent = 'Sign in';
      }
    });
  }

  function recordsSignature(records) {
    return records.map(r => `${r.meta.id}:${r.meta.duplicateFlag ? 1 : 0}:${r.meta.duplicateReviewStatus || ''}`).join('|');
  }

  function renderRemoteBody(container, datasets, onDataCleared, onExit, records, banner) {
    const status = window.PED.sync.getStatus();
    const sorted = records.slice().sort((a, b) => {
      const aPending = a.meta.duplicateFlag && a.meta.duplicateReviewStatus === 'pending';
      const bPending = b.meta.duplicateFlag && b.meta.duplicateReviewStatus === 'pending';
      if (aPending !== bPending) return aPending ? -1 : 1;
      return (b.meta.createdAt || '').localeCompare(a.meta.createdAt || '');
    });
    const shown = showAll ? sorted : sorted.slice(0, RENDER_LIMIT);
    const session = window.PED.sync.staffSession();
    const localLine = status.unsynced || status.rejected
      ? `This device: <strong>${status.unsynced}</strong> waiting to sync${status.rejected ? `, <strong>${status.rejected}</strong> rejected by the server` : ''}.
         <button type="button" class="quiet" id="staffSyncNowBtn">Sync now</button>
         ${status.rejected ? '<button type="button" class="quiet" id="staffRetryRejectedBtn">Retry rejected</button>' : ''}`
      : 'This device: everything is synced.';

    container.innerHTML = `
      <p class="eyebrow-small">STAFF DASHBOARD</p>
      ${banner ? `<p class="field-error" id="staffBanner">${escapeHtml(banner)}</p>` : ''}
      ${renderStatsBar(records)}
      <p class="field-hint" id="staffStatusLine">Live from Supabase (all devices) &middot; updated <span id="staffUpdatedAt">${escapeHtml(lastFetchedAt ? lastFetchedAt.toLocaleTimeString() : '—')}</span> &middot; signed in as ${escapeHtml(session ? session.email : '')}</p>
      <p class="field-hint" id="staffLocalLine">${localLine}</p>
      <div class="step-actions">
        <button type="button" class="quiet" id="staffRefreshBtn">Refresh</button>
        <button type="button" class="quiet" id="staffExitBtn">Back to visitor screen</button>
        <button type="button" class="quiet" id="staffSignOutBtn">Sign out</button>
        <button type="button" class="quiet staff-clear-all" id="staffClearAllBtn">Clear this device's local copy</button>
      </div>
      ${records.length ? '' : `<h2 class="step-heading">No registrations yet.</h2><p class="field-hint">Submitted entries from every device will appear here.</p>`}
      <div id="staffRecordList">${shown.map(r => renderRecordCard(r, datasets)).join('')}</div>
      ${sorted.length > shown.length ? `<div class="step-actions"><button type="button" class="quiet" id="staffShowAllBtn">Show all ${sorted.length} records</button></div>` : ''}
    `;

    const reload = () => renderStaffDashboard(container, datasets, onDataCleared, onExit);
    container.querySelector('#staffRefreshBtn').addEventListener('click', reload);
    container.querySelector('#staffExitBtn').addEventListener('click', () => { stopPolling(); if (onExit) onExit(); });
    container.querySelector('#staffSignOutBtn').addEventListener('click', async () => {
      stopPolling();
      await window.PED.sync.staffSignOut();
      lastRecords = null; lastSignature = '';
      renderStaffDashboard(container, datasets, onDataCleared, onExit);
    });
    const syncNow = container.querySelector('#staffSyncNowBtn');
    if (syncNow) syncNow.addEventListener('click', async () => { syncNow.disabled = true; await window.PED.sync.flushOutbox(); reload(); });
    const retry = container.querySelector('#staffRetryRejectedBtn');
    if (retry) retry.addEventListener('click', async () => { window.PED.state.clearSyncErrors(); await window.PED.sync.flushOutbox(); reload(); });
    const more = container.querySelector('#staffShowAllBtn');
    if (more) more.addEventListener('click', () => { showAll = true; renderRemoteBody(container, datasets, onDataCleared, onExit, records, banner); });
    wireClearAllButton(container, datasets, onDataCleared, onExit);
  }

  async function renderRemoteDashboard(container, datasets, onDataCleared, onExit, opts) {
    const silent = !!(opts && opts.silent);
    if (!silent) container.innerHTML = '<p class="eyebrow-small">STAFF DASHBOARD</p><p class="field-hint">Loading registrations…</p>';
    let records = null, banner = null;
    try {
      records = await window.PED.sync.fetchRegistrations();
      lastRecords = records;
      lastFetchedAt = new Date();
    } catch (err) {
      if (err.status === 401) {
        renderLogin(container, datasets, onDataCleared, onExit, err.message === 'Not signed in' ? '' : 'Session expired — please sign in again.');
        return;
      }
      if (!lastRecords) {
        stopPolling();
        container.innerHTML = `
          <p class="eyebrow-small">STAFF DASHBOARD</p>
          <h2 class="step-heading">Can't load registrations.</h2>
          <p class="field-error">${escapeHtml(err.message)}</p>
          <div class="step-actions">
            <button type="button" class="quiet" id="staffExitBtn">Back</button>
            <button type="button" class="primary" id="staffRetryBtn">Try again</button>
          </div>`;
        container.querySelector('#staffExitBtn').addEventListener('click', () => { if (onExit) onExit(); });
        container.querySelector('#staffRetryBtn').addEventListener('click', () => renderStaffDashboard(container, datasets, onDataCleared, onExit));
        return;
      }
      records = lastRecords;
      banner = `Can't reach the server (${err.message}) — showing the last data loaded${lastFetchedAt ? ' at ' + lastFetchedAt.toLocaleTimeString() : ''}.`;
    }

    // Polling: re-render only when something actually changed, so staff aren't
    // bounced back to the top of the list (or out of a half-read card) every 10s.
    const sig = recordsSignature(records);
    if (silent && !banner && sig === lastSignature) {
      const at = container.querySelector('#staffUpdatedAt');
      if (at) at.textContent = lastFetchedAt.toLocaleTimeString();
    } else {
      lastSignature = sig;
      renderRemoteBody(container, datasets, onDataCleared, onExit, records, banner);
    }

    stopPolling();
    pollTimer = setInterval(() => {
      if (container.hidden || !container.isConnected || !container.querySelector('#staffRecordList')) { stopPolling(); return; }
      if (document.visibilityState !== 'visible') return;
      renderRemoteDashboard(container, datasets, onDataCleared, onExit, { silent: true });
    }, POLL_MS);
  }

  /** Entry point (app.js). Remote mode when Supabase is configured, else local. */
  function renderStaffDashboard(container, datasets, onDataCleared, onExit) {
    if (!window.PED.sync || !window.PED.sync.isEnabled()) {
      stopPolling();
      return renderLocalDashboard(container, datasets, onDataCleared, onExit);
    }
    if (!window.PED.sync.staffSession()) return renderLogin(container, datasets, onDataCleared, onExit);
    return renderRemoteDashboard(container, datasets, onDataCleared, onExit);
  }

  window.PED.staff = { renderStaffDashboard };
})();
