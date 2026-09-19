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
   * T&Cs/consent timestamps, school + curriculum, and follow-up prefs from
   * the request step, alongside the fields the review screen already showed
   * the visitor (destinations/courses/activities/quiz completion) so staff
   * see the same picture without cross-referencing two screens. */
  function renderRecordCard(record, datasets, onAction) {
    const r = record.registration;
    const p = record.preferences;
    const f = record.followUp;
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
          <div><dt>Destinations</dt><dd>${escapeHtml(destinationList.length ? destinationList.join(', ') : 'None selected')}</dd></div>
          <div><dt>Courses of interest</dt><dd>${escapeHtml((p.courses || []).length ? p.courses.join(', ') : '—')}</dd></div>
          <div><dt>Activities</dt><dd>${escapeHtml((p.activities || []).length ? p.activities.join(', ') : '—')}</dd></div>
          <div><dt>Follow-up channel</dt><dd>${escapeHtml(f.channel || 'Not answered')}</dd></div>
          <div><dt>Event/offer updates</dt><dd>${f.marketing ? 'Yes' : 'No'}</dd></div>
          <div><dt>Note for counsellor</dt><dd>${escapeHtml(f.preferredFollowup || '— (none)')}</dd></div>
          <div><dt>Quiz completion</dt><dd>${answeredCount} / ${totalQuestions} answered (${escapeHtml(record.mode)} path)</dd></div>
          <div><dt>Submitted</dt><dd>${escapeHtml(fmtDate(m.createdAt))}</dd></div>
        </dl>
        ${duplicateActions}
      </section>
    `;
  }

  function renderStaffDashboard(container, datasets) {
    const records = window.PED.state.loadRecords();

    if (!records.length) {
      container.innerHTML = `
        <p class="eyebrow-small">STAFF DASHBOARD</p>
        <h2 class="step-heading">No registrations yet.</h2>
        <p class="field-hint">Finalized entries will appear here as visitors submit the review screen.</p>
      `;
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

    const pendingCount = records.filter(r => r.meta.duplicateFlag && r.meta.duplicateReviewStatus === 'pending').length;

    container.innerHTML = `
      <p class="eyebrow-small">STAFF DASHBOARD</p>
      <h2 class="step-heading">${records.length} registration${records.length === 1 ? '' : 's'}${pendingCount ? ` &middot; ${pendingCount} need${pendingCount === 1 ? 's' : ''} a duplicate review` : ''}</h2>
      <p class="field-hint">Reads directly from this device's saved records. Refresh after new submissions on this device.</p>
      <div class="step-actions">
        <button type="button" class="quiet" id="staffRefreshBtn">Refresh</button>
      </div>
      <div id="staffRecordList">${sorted.map(r => renderRecordCard(r, datasets)).join('')}</div>
    `;

    container.querySelector('#staffRefreshBtn').addEventListener('click', () => renderStaffDashboard(container, datasets));

    container.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        window.PED.state.updateRecord(btn.dataset.id, record => {
          record.meta.duplicateReviewStatus = btn.dataset.action;
        });
        renderStaffDashboard(container, datasets);
      });
    });
  }

  window.PED.staff = { renderStaffDashboard };
})();
