// Classic script. Staff dashboard (Phase 4) — reads directly from
// PED.state.loadRecords() (localStorage's RECORDS_KEY, the system of record
// per CLAUDE.md's standing local-first decision through this build phase; no
// backend wiring here). Gated behind app.js's long-press-logo + PIN prompt,
// same casual-deterrent standing decision as everywhere else in this app —
// this file doesn't add or change that gate, it only renders once it fires.
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

  const REVIEW_STATUS_LABEL = {
    pending: 'Pending review',
    reviewed: 'Reviewed — kept both',
    merged: 'Reviewed — merged',
    dismissed: 'Reviewed — not a duplicate',
  };

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

    const destinationList = [...(p.destinations || []).filter(d => d !== 'Other'), ...(p.destinationsOther || [])];
    const answeredCount = (record.quiz.answers || []).filter(a => a.selected != null).length;
    const totalQuestions = (record.quiz.selectedQuestionIds || []).length;

    const duplicateBadge = m.duplicateFlag
      ? `<span class="badge badge--duplicate">${escapeHtml(REVIEW_STATUS_LABEL[m.duplicateReviewStatus] || 'Pending review')}</span>`
      : '';

    const duplicateActions = m.duplicateFlag && m.duplicateReviewStatus === 'pending'
      ? `
        <div class="staff-duplicate-actions">
          <p class="field-hint">Possible duplicate of: ${m.duplicateOfIds.map(escapeHtml).join(', ')}</p>
          <button type="button" class="quiet" data-action="dismissed" data-id="${escapeHtml(m.id)}">Not a duplicate</button>
          <button type="button" class="quiet" data-action="merged" data-id="${escapeHtml(m.id)}">Mark merged</button>
          <button type="button" class="primary" data-action="reviewed" data-id="${escapeHtml(m.id)}">Mark reviewed</button>
        </div>
      `
      : (m.duplicateFlag ? `<p class="field-hint">Possible duplicate of: ${m.duplicateOfIds.map(escapeHtml).join(', ')}</p>` : '');

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

  function wireClearAllButton(container, datasets, onDataCleared) {
    container.querySelector('#staffClearAllBtn').addEventListener('click', () => {
      const count = window.PED.state.loadRecords().length;
      const warning = count
        ? `Permanently delete all ${count} registration record${count === 1 ? '' : 's'} and the in-progress draft on this device? This cannot be undone.`
        : 'Clear the in-progress draft on this device? This cannot be undone.';
      if (!confirm(warning)) return;
      window.PED.state.clearAllData();
      if (onDataCleared) onDataCleared();
      renderStaffDashboard(container, datasets, onDataCleared);
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
    const pendingCount = records.filter(r => r.meta.duplicateFlag && r.meta.duplicateReviewStatus === 'pending').length;
    return `
      <div class="staff-stats">
        <div class="staff-stat"><strong>${records.length}</strong><span>Total registered</span></div>
        <div class="staff-stat"><strong>${todayCount}</strong><span>Registered today</span></div>
        <div class="staff-stat${pendingCount ? ' staff-stat--attention' : ''}"><strong>${pendingCount}</strong><span>Need duplicate review</span></div>
      </div>
    `;
  }

  function renderStaffDashboard(container, datasets, onDataCleared) {
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
      container.querySelector('#staffRefreshBtn').addEventListener('click', () => renderStaffDashboard(container, datasets, onDataCleared));
      wireClearAllButton(container, datasets, onDataCleared);
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

    container.querySelector('#staffRefreshBtn').addEventListener('click', () => renderStaffDashboard(container, datasets, onDataCleared));
    wireClearAllButton(container, datasets, onDataCleared);

    container.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        // codexreview.md finding, fixed here: resolving a duplicate used to
        // update only the clicked record, leaving its linked match(es) still
        // pending — resolveDuplicatePair() resolves the whole linked group
        // together (see js/state.js).
        window.PED.state.resolveDuplicatePair(btn.dataset.id, btn.dataset.action);
        renderStaffDashboard(container, datasets, onDataCleared);
      });
    });
  }

  window.PED.staff = { renderStaffDashboard };
})();
