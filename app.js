// ============================================================================
// Vaya — Suivi Traitement (PWA)
// Synchronisé avec Google Sheets via Google Apps Script + lecture CSV fallback
// ============================================================================

const SHEET_ID = '1VKHF8v74lzlDWnaVbuJROEJ1-RdQtYCQUq1g6ifH5iE';
const CSV_EXPORT_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=0`;

// Optionnel : tu peux coller ton URL Google Apps Script ici en dur
// pour qu'elle soit déjà prête sur tous tes appareils sans rien configurer !
const DEFAULT_SCRIPT_URL = '';

const STORAGE_KEYS = {
  scriptUrl: 'vaya_script_url_v1',
  cachedDays: 'vaya_cached_days_v1',
};

// Mapping exact des colonnes du Google Sheet (lignes 14 à 41 = J1 à J28)
// Indices 0-based dans le CSV : A=0, B=1 (Jour), C=2 (Date), D=3 (Phase), ...
const DOSE_DEFINITIONS = [
  { key: 'omep',  colLetter: 'F', colIndex: 5,  descIndex: 4,  time: '07h30', label: 'Oméprazole 10 mg',      category: 'omep', tag: '💊 Oméprazole' },
  { key: 'r1',    colLetter: 'H', colIndex: 7,  descIndex: 6,  time: '08h00', label: 'Repas 1 — Matin',       category: 'meal', tag: '🍽️ Repas 1' },
  { key: 'keal1', colLetter: 'J', colIndex: 9,  descIndex: 8,  time: '11h30', label: 'Kéal 1 — Midi',         category: 'keal', tag: '🛡️ Kéal' },
  { key: 'r2',    colLetter: 'L', colIndex: 11, descIndex: 10, time: '12h30', label: 'Repas 2 — Midi',        category: 'meal', tag: '🍽️ Repas 2' },
  { key: 'keal2', colLetter: 'N', colIndex: 13, descIndex: 12, time: '17h00', label: 'Kéal 2 — Après-midi',   category: 'keal', tag: '🛡️ Kéal' },
  { key: 'r3',    colLetter: 'P', colIndex: 15, descIndex: 14, time: '18h00', label: 'Repas 3 — Soir',        category: 'meal', tag: '🍽️ Repas 3' },
  { key: 'keal3', colLetter: 'R', colIndex: 17, descIndex: 16, time: '21h00', label: 'Kéal 3 — Soir',         category: 'keal', tag: '🛡️ Kéal' },
  { key: 'r4',    colLetter: 'T', colIndex: 19, descIndex: 18, time: '22h00', label: 'Repas 4 — Coucher',     category: 'meal', tag: '🍽️ Repas 4' },
];

// Progressive enhancement polyfill for Popover API (only when missing)
if (!Object.hasOwn(HTMLElement.prototype, 'popover')) {
  import('https://unpkg.com/@oddbird/popover-polyfill@latest/dist/popover.min.js').catch(() => {});
}

// State
const state = {
  days: [],
  selectedDayIndex: 0,
  todayIndex: -1,
  activeView: 'today',
  scriptUrl: localStorage.getItem(STORAGE_KEYS.scriptUrl) || DEFAULT_SCRIPT_URL,
  savingCells: new Set(),
};

// DOM refs
const els = {
  syncBadge: document.getElementById('sync-badge'),
  syncLabel: document.querySelector('#sync-badge .sync-label'),
  setupBanner: document.getElementById('setup-banner'),
  btnOpenSetup: document.getElementById('btn-open-setup'),
  btnRefresh: document.getElementById('btn-refresh'),
  btnSettings: document.getElementById('btn-settings'),
  btnPrevDay: document.getElementById('btn-prev-day'),
  btnNextDay: document.getElementById('btn-next-day'),
  btnJumpToday: document.getElementById('btn-jump-today'),
  jumpTodayWrap: document.getElementById('jump-today-wrap'),
  currentDayLabel: document.getElementById('current-day-label'),
  todayPill: document.getElementById('today-pill'),
  currentPhaseLabel: document.getElementById('current-phase-label'),
  dayProgressCard: document.getElementById('day-progress-card'),
  dayProgressTitle: document.getElementById('day-progress-title'),
  nextDoseHint: document.getElementById('next-dose-hint'),
  dayProgressFraction: document.getElementById('day-progress-fraction'),
  dayProgressBar: document.getElementById('day-progress-bar'),
  dayProgressFill: document.getElementById('day-progress-fill'),
  checklistContainer: document.getElementById('checklist-container'),
  dayContextCard: document.getElementById('day-context-card'),
  ctxRation: document.getElementById('ctx-ration'),
  ctxTransit: document.getElementById('ctx-transit'),
  ctxConsignes: document.getElementById('ctx-consignes'),
  kpiGlobal: document.getElementById('kpi-global'),
  kpiGlobalSub: document.getElementById('kpi-global-sub'),
  kpiOmep: document.getElementById('kpi-omep'),
  kpiOmepSub: document.getElementById('kpi-omep-sub'),
  kpiKeal: document.getElementById('kpi-keal'),
  kpiKealSub: document.getElementById('kpi-keal-sub'),
  kpiMeals: document.getElementById('kpi-meals'),
  kpiMealsSub: document.getElementById('kpi-meals-sub'),
  calendarList: document.getElementById('calendar-list'),
  settingsDialog: document.getElementById('settings-dialog'),
  btnCloseSettings: document.getElementById('btn-close-settings'),
  settingsForm: document.getElementById('settings-form'),
  scriptUrlInput: document.getElementById('script-url-input'),
  btnTestScript: document.getElementById('btn-test-script'),
  settingsTestResult: document.getElementById('settings-test-result'),
  toastRegion: document.getElementById('toast-region'),
  srLiveRegion: document.getElementById('sr-live-region'),
  navButtons: Array.from(document.querySelectorAll('.bottom-nav-btn')),
  views: {
    today: document.getElementById('view-today'),
    calendar: document.getElementById('view-calendar'),
    rules: document.getElementById('view-rules'),
  },
};

// ---------------------------------------------------------------------------
// Dialog light-dismiss fallback for browsers without native `closedby="any"`
// ---------------------------------------------------------------------------
if (!('closedBy' in HTMLDialogElement.prototype)) {
  const outside = (e, dialog) => {
    const r = dialog.getBoundingClientRect();
    return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
  };
  for (const dialog of document.querySelectorAll('dialog[closedby="any"]')) {
    let pressedOutside = false;
    dialog.addEventListener('pointerdown', (e) => {
      pressedOutside = outside(e, dialog);
    });
    dialog.addEventListener('pointerup', (e) => {
      if (pressedOutside && outside(e, dialog)) dialog.close();
    });
  }
}

// ---------------------------------------------------------------------------
// Toast Notifications (popover="manual" + ariaNotify / live region fallback)
// ---------------------------------------------------------------------------
let toastCounter = 0;

function announceScreenReader(message) {
  if (typeof document.ariaNotify === 'function') {
    document.ariaNotify(message);
  } else if (els.srLiveRegion) {
    els.srLiveRegion.textContent = '';
    requestAnimationFrame(() => {
      els.srLiveRegion.textContent = message;
    });
  }
}

function showToast(message, { autoDismissMs = 3500 } = {}) {
  // Suppress background toasts while modal dialog is open
  if (els.settingsDialog.open) return;

  // Close previous toasts cleanly
  for (const existing of els.toastRegion.querySelectorAll('.toast')) {
    try { existing.hidePopover(); } catch {}
    existing.remove();
  }

  const id = `toast-${++toastCounter}`;
  const toast = document.createElement('div');
  toast.id = id;
  toast.className = 'toast';
  toast.setAttribute('popover', 'manual');

  const text = document.createElement('span');
  text.className = 'toast-text';
  text.textContent = message;

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'toast-close';
  closeBtn.setAttribute('popovertarget', id);
  closeBtn.setAttribute('popovertargetaction', 'hide');
  closeBtn.setAttribute('aria-label', 'Fermer la notification');
  closeBtn.textContent = 'OK';

  toast.append(text, closeBtn);
  els.toastRegion.append(toast);

  const prevFocus = document.activeElement;
  try {
    toast.showPopover();
  } catch {
    toast.classList.add(':popover-open');
  }

  announceScreenReader(message);

  let timerId = null;
  const scheduleDismiss = () => {
    if (!autoDismissMs) return;
    clearTimeout(timerId);
    timerId = setTimeout(() => {
      if (toast.contains(document.activeElement)) return;
      try { toast.hidePopover(); } catch {}
      toast.remove();
    }, autoDismissMs);
  };

  toast.addEventListener('focusin', () => clearTimeout(timerId));
  toast.addEventListener('focusout', scheduleDismiss);
  toast.addEventListener('toggle', (e) => {
    if (e.newState === 'closed') {
      clearTimeout(timerId);
      toast.remove();
      if (prevFocus && typeof prevFocus.focus === 'function' && document.contains(prevFocus)) {
        prevFocus.focus();
      }
    }
  });

  scheduleDismiss();
}

// ---------------------------------------------------------------------------
// CSV Parser (handles quoted fields & commas cleanly)
// ---------------------------------------------------------------------------
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(field);
        field = '';
      } else if (ch === '\r' && next === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
        i++;
      } else if (ch === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else {
        field += ch;
      }
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function parseDaysFromCSV(csvText) {
  const rows = parseCSV(csvText);
  const days = [];

  for (let r = 0; r < rows.length; r++) {
    const cols = rows[r];
    const jour = (cols[1] || '').trim();
    if (!/^J\d+$/i.test(jour)) continue;

    const sheetRow = r + 1; // 1-based row in Google Sheets
    const doses = DOSE_DEFINITIONS.map((def) => {
      const rawVal = (cols[def.colIndex] || '').trim().toUpperCase();
      const desc = (cols[def.descIndex] || '').trim();
      const active = rawVal === 'TRUE' || rawVal === 'FALSE';
      return {
        ...def,
        sheetRow,
        active,
        checked: rawVal === 'TRUE',
        detail: desc,
      };
    });

    days.push({
      jour,
      sheetRow,
      date: (cols[2] || '').trim(),
      phase: (cols[3] || '').trim(),
      doses,
      ration: (cols[21] || '').trim(),
      transit: (cols[22] || '').trim(),
      consignes: (cols[23] || '').trim(),
    });
  }

  return days;
}

function normalizeDaysFromScript(apiDays) {
  return apiDays.map((d) => ({
    jour: d.jour,
    sheetRow: d.sheetRow,
    date: d.date,
    phase: d.phase,
    ration: d.ration || '',
    transit: d.transit || '',
    consignes: d.consignes || '',
    doses: DOSE_DEFINITIONS.map((def) => {
      const item = d.doses[def.key] || {};
      return {
        ...def,
        sheetRow: d.sheetRow,
        active: Boolean(item.active),
        checked: Boolean(item.checked),
        detail: item.detail || '',
      };
    }),
  }));
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------
function getTodayFormattedFR() {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function getCurrentMinutesOfDay() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function timeStrToMinutes(t) {
  const m = /^(\d{2})h(\d{2})$/.exec(t);
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
}

function findTodayIndex(days) {
  const todayStr = getTodayFormattedFR();
  const idx = days.findIndex((d) => d.date === todayStr);
  return idx;
}

// ---------------------------------------------------------------------------
// Sync status UI
// ---------------------------------------------------------------------------
function setSyncStatus(mode, text) {
  els.syncBadge.className = `sync-badge sync-badge--${mode}`;
  els.syncLabel.textContent = text;
}

function updateSetupBanner() {
  els.setupBanner.hidden = Boolean(state.scriptUrl);
}

// ---------------------------------------------------------------------------
// Data Loading (Apps Script if configured, else public CSV export)
// ---------------------------------------------------------------------------
async function loadData({ silent = false } = {}) {
  if (!silent) setSyncStatus('loading', 'Synchro…');

  try {
    let days = [];

    if (state.scriptUrl) {
      const url = `${state.scriptUrl}${state.scriptUrl.includes('?') ? '&' : '?'}action=get&_=${Date.now()}`;
      const res = await fetch(url, { redirect: 'follow' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.ok || !Array.isArray(json.days)) {
        throw new Error(json.error || 'Réponse invalide du script');
      }
      days = normalizeDaysFromScript(json.days);
      setSyncStatus('ok', 'Synchronisé');
    } else {
      const res = await fetch(`${CSV_EXPORT_URL}&_=${Date.now()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const csv = await res.text();
      days = parseDaysFromCSV(csv);
      setSyncStatus('readonly', 'Lecture seule');
    }

    if (days.length === 0) throw new Error('Aucune donnée trouvée dans le tableau');

    state.days = days;
    localStorage.setItem(STORAGE_KEYS.cachedDays, JSON.stringify(days));

    const todayIdx = findTodayIndex(days);
    state.todayIndex = todayIdx;

    if (!silent) {
      if (todayIdx >= 0) {
        state.selectedDayIndex = todayIdx;
      } else {
        // Fallback: first day with an unchecked dose, or J1
        const firstIncomplete = days.findIndex((d) => d.doses.some((x) => x.active && !x.checked));
        state.selectedDayIndex = firstIncomplete >= 0 ? firstIncomplete : 0;
      }
    }

    renderAll();
  } catch (err) {
    console.error('Erreur chargement:', err);
    const cached = localStorage.getItem(STORAGE_KEYS.cachedDays);
    if (cached && state.days.length === 0) {
      state.days = JSON.parse(cached);
      state.todayIndex = findTodayIndex(state.days);
      if (state.todayIndex >= 0) state.selectedDayIndex = state.todayIndex;
      renderAll();
      setSyncStatus('error', 'Hors ligne');
      showToast('Mode hors-ligne : données en cache affichées.');
    } else {
      setSyncStatus('error', 'Erreur synchro');
      showToast('Impossible de charger le Google Sheet. Vérifie ta connexion.');
    }
  }
}

// ---------------------------------------------------------------------------
// Toggle Dose & Push to Google Sheets
// ---------------------------------------------------------------------------
async function toggleDose(dayIndex, doseKey, newValue) {
  const day = state.days[dayIndex];
  if (!day) return;
  const dose = day.doses.find((d) => d.key === doseKey);
  if (!dose || !dose.active) return;

  const cellKey = `${day.sheetRow}:${dose.colLetter}`;
  const previousValue = dose.checked;

  // Optimistic UI update
  dose.checked = newValue;
  localStorage.setItem(STORAGE_KEYS.cachedDays, JSON.stringify(state.days));
  renderAll();

  if (!state.scriptUrl) {
    showToast('Coché en local uniquement. Ajoute le script dans ⚙️ pour mettre à jour Google Sheets.');
    return;
  }

  state.savingCells.add(cellKey);
  setSyncStatus('saving', 'Enregistrement…');
  renderTodayView();

  try {
    // Use text/plain to avoid CORS preflight with Google Apps Script
    const res = await fetch(state.scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      redirect: 'follow',
      body: JSON.stringify({
        action: 'toggle',
        row: day.sheetRow,
        col: dose.colLetter,
        value: newValue,
      }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || 'Échec de mise à jour');

    setSyncStatus('ok', 'Synchronisé');
    const actionTxt = newValue ? 'validé' : 'décoché';
    showToast(`${dose.label} (${day.jour}) ${actionTxt} dans Google Sheets ✓`, { autoDismissMs: 2600 });
  } catch (err) {
    console.error('Erreur sauvegarde:', err);
    // Revert optimistic update on failure
    dose.checked = previousValue;
    localStorage.setItem(STORAGE_KEYS.cachedDays, JSON.stringify(state.days));
    setSyncStatus('error', 'Erreur envoi');
    showToast('Erreur de synchronisation Google Sheets. Réessaie dans un instant.');
  } finally {
    state.savingCells.delete(cellKey);
    renderAll();
  }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
function renderAll() {
  updateSetupBanner();
  renderTodayView();
  renderCalendarView();
}

function renderTodayView() {
  const day = state.days[state.selectedDayIndex];
  if (!day) return;

  const isToday = state.selectedDayIndex === state.todayIndex;
  els.currentDayLabel.textContent = `${day.jour} — ${day.date}`;
  els.todayPill.hidden = !isToday;
  els.currentPhaseLabel.textContent = day.phase || 'Protocole 28 jours';

  els.btnPrevDay.disabled = state.selectedDayIndex <= 0;
  els.btnNextDay.disabled = state.selectedDayIndex >= state.days.length - 1;
  els.jumpTodayWrap.hidden = state.todayIndex < 0 || isToday;

  const activeDoses = day.doses.filter((d) => d.active);
  const doneCount = activeDoses.filter((d) => d.checked).length;
  const totalCount = activeDoses.length;
  const pct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  els.dayProgressFraction.textContent = `${doneCount} / ${totalCount}`;
  els.dayProgressFill.style.inlineSize = `${pct}%`;
  els.dayProgressBar.setAttribute('aria-valuenow', String(pct));
  els.dayProgressCard.classList.toggle('progress-card--complete', doneCount === totalCount && totalCount > 0);

  // Determine next upcoming unchecked dose (especially useful for today)
  let nextDoseKey = null;
  if (doneCount < totalCount) {
    if (isToday) {
      const nowMins = getCurrentMinutesOfDay();
      const upcoming = activeDoses.find((d) => !d.checked && timeStrToMinutes(d.time) >= nowMins - 45);
      nextDoseKey = (upcoming || activeDoses.find((d) => !d.checked))?.key || null;
    } else {
      nextDoseKey = activeDoses.find((d) => !d.checked)?.key || null;
    }
  }

  if (doneCount === totalCount && totalCount > 0) {
    els.dayProgressTitle.textContent = 'Journée complète ! 🎉';
    els.nextDoseHint.textContent = 'Toutes les prises et tous les repas sont validés.';
  } else {
    els.dayProgressTitle.textContent = 'Progression du jour';
    const nextDose = activeDoses.find((d) => d.key === nextDoseKey);
    els.nextDoseHint.textContent = nextDose
      ? `Prochaine étape : ${nextDose.time} — ${nextDose.label}`
      : '';
  }

  // Render checklist
  const frag = document.createDocumentFragment();

  for (const dose of activeDoses) {
    const cellKey = `${day.sheetRow}:${dose.colLetter}`;
    const isSaving = state.savingCells.has(cellKey);
    const isNext = isToday && dose.key === nextDoseKey;

    const label = document.createElement('label');
    label.className = 'dose-card';
    if (dose.checked) label.classList.add('is-done');
    if (isNext) label.classList.add('is-next');
    if (isSaving) label.classList.add('is-saving');

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'dose-checkbox';
    input.checked = dose.checked;
    input.disabled = isSaving;
    input.addEventListener('change', () => {
      toggleDose(state.selectedDayIndex, dose.key, input.checked);
    });

    const body = document.createElement('span');
    body.className = 'dose-body';

    const top = document.createElement('span');
    top.className = 'dose-top';

    const time = document.createElement('span');
    time.className = 'dose-time';
    time.textContent = dose.time;

    const tag = document.createElement('span');
    tag.className = `dose-tag dose-tag--${dose.category}`;
    tag.textContent = dose.tag;

    top.append(time, tag);

    if (isNext) {
      const nextBadge = document.createElement('span');
      nextBadge.className = 'dose-next-badge';
      nextBadge.textContent = 'À faire';
      top.append(nextBadge);
    }

    const title = document.createElement('span');
    title.className = 'dose-title';
    title.textContent = dose.label;

    const detail = document.createElement('span');
    detail.className = 'dose-detail';
    detail.textContent = dose.detail || '—';

    body.append(top, title, detail);
    label.append(input, body);
    frag.append(label);
  }

  // If Kéal is finished (Phase 2), show a subtle informative note
  const hasKeal = activeDoses.some((d) => d.category === 'keal');
  if (!hasKeal) {
    const note = document.createElement('p');
    note.className = 'keal-ended-note';
    note.textContent = '🛡️ Cure de Kéal terminée à J10 — Oméprazole le matin + 4 repas fractionnés.';
    frag.append(note);
  }

  els.checklistContainer.replaceChildren(frag);

  // Day context
  els.dayContextCard.hidden = false;
  els.ctxRation.textContent = day.ration || '—';
  els.ctxTransit.textContent = day.transit || '—';
  els.ctxConsignes.textContent = day.consignes || '—';
}

function renderCalendarView() {
  if (state.days.length === 0) return;

  let omepDone = 0, omepTotal = 0;
  let kealDone = 0, kealTotal = 0;
  let mealsDone = 0, mealsTotal = 0;
  let fullDays = 0;

  for (const day of state.days) {
    const active = day.doses.filter((d) => d.active);
    if (active.length > 0 && active.every((d) => d.checked)) fullDays++;

    for (const d of active) {
      if (d.category === 'omep') { omepTotal++; if (d.checked) omepDone++; }
      else if (d.category === 'keal') { kealTotal++; if (d.checked) kealDone++; }
      else if (d.category === 'meal') { mealsTotal++; if (d.checked) mealsDone++; }
    }
  }

  const globalPct = state.days.length > 0 ? Math.round((omepDone / state.days.length) * 1000) / 10 : 0;
  els.kpiGlobal.textContent = `${globalPct.toString().replace('.', ',')} %`;
  els.kpiGlobalSub.textContent = `${fullDays} / ${state.days.length} jours complets`;
  els.kpiOmep.textContent = `${omepDone} / ${omepTotal}`;
  els.kpiOmepSub.textContent = `Reste ${omepTotal - omepDone} prises`;
  els.kpiKeal.textContent = `${kealDone} / ${kealTotal}`;
  els.kpiKealSub.textContent = kealDone === kealTotal ? 'Cure terminée 🎉' : `Reste ${kealTotal - kealDone} prises`;
  els.kpiMeals.textContent = `${mealsDone} / ${mealsTotal}`;
  els.kpiMealsSub.textContent = '4 repas / jour';

  const frag = document.createDocumentFragment();
  let lastPhase = '';

  state.days.forEach((day, idx) => {
    if (day.phase && day.phase !== lastPhase) {
      lastPhase = day.phase;
      const header = document.createElement('div');
      header.className = 'cal-phase-header';
      header.textContent = day.phase;
      frag.append(header);
    }

    const active = day.doses.filter((d) => d.active);
    const done = active.filter((d) => d.checked).length;
    const total = active.length;
    const isComplete = total > 0 && done === total;
    const isToday = idx === state.todayIndex;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cal-day-btn';
    if (isComplete) btn.classList.add('is-complete');
    if (isToday) btn.classList.add('is-today');

    const top = document.createElement('span');
    top.className = 'cal-day-top';

    const num = document.createElement('span');
    num.className = 'cal-day-num';
    num.textContent = isToday ? `${day.jour} • Auj.` : day.jour;

    const score = document.createElement('span');
    score.className = 'cal-day-score';
    score.textContent = isComplete ? `${done}/${total} ✓` : `${done}/${total}`;

    top.append(num, score);

    const date = document.createElement('span');
    date.className = 'cal-day-date';
    date.textContent = day.date;

    const bar = document.createElement('span');
    bar.className = 'cal-mini-bar';
    const fill = document.createElement('span');
    fill.className = 'cal-mini-fill';
    fill.style.inlineSize = `${total > 0 ? Math.round((done / total) * 100) : 0}%`;
    bar.append(fill);

    btn.append(top, date, bar);
    btn.addEventListener('click', () => {
      state.selectedDayIndex = idx;
      switchView('today');
      renderTodayView();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    frag.append(btn);
  });

  els.calendarList.replaceChildren(frag);
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------
function switchView(viewName) {
  state.activeView = viewName;
  for (const [name, section] of Object.entries(els.views)) {
    section.hidden = name !== viewName;
  }
  for (const btn of els.navButtons) {
    const active = btn.dataset.view === viewName;
    btn.classList.toggle('is-active', active);
    if (active) btn.setAttribute('aria-current', 'page');
    else btn.removeAttribute('aria-current');
  }
}

// ---------------------------------------------------------------------------
// Settings Dialog
// ---------------------------------------------------------------------------
function openSettings() {
  els.scriptUrlInput.value = state.scriptUrl;
  els.settingsTestResult.hidden = true;
  els.settingsDialog.showModal();
}

els.btnSettings.addEventListener('click', openSettings);
els.btnOpenSetup.addEventListener('click', openSettings);
els.btnCloseSettings.addEventListener('click', () => els.settingsDialog.close('cancel'));

function isWrongSheetUrl(url) {
  return /docs\.google\.com\/spreadsheets/i.test(url);
}

els.settingsDialog.addEventListener('close', () => {
  const rv = els.settingsDialog.returnValue;
  els.settingsDialog.returnValue = ''; // Reset stale returnValue per dialog best practices
  if (rv === 'save') {
    const nextUrl = els.scriptUrlInput.value.trim();
    if (isWrongSheetUrl(nextUrl)) {
      showToast('Attention : c’est le lien du Google Sheet. Il faut coller l’URL Apps Script (https://script.google.com/macros/s/.../exec).');
      return;
    }
    state.scriptUrl = nextUrl;
    if (nextUrl) {
      localStorage.setItem(STORAGE_KEYS.scriptUrl, nextUrl);
    } else {
      localStorage.removeItem(STORAGE_KEYS.scriptUrl);
    }
    updateSetupBanner();
    loadData();
    showToast(nextUrl ? 'URL enregistrée — synchronisation activée ✓' : 'Mode lecture seule activé.');
  }
});

els.btnTestScript.addEventListener('click', async () => {
  const url = els.scriptUrlInput.value.trim();
  els.settingsTestResult.hidden = false;
  if (!url) {
    els.settingsTestResult.className = 'test-result test-result--err';
    els.settingsTestResult.textContent = 'Colle d’abord l’URL de déploiement Google Apps Script.';
    return;
  }
  if (isWrongSheetUrl(url)) {
    els.settingsTestResult.className = 'test-result test-result--err';
    els.settingsTestResult.textContent = 'Ce lien est celui du Google Sheet. Il faut coller l’URL "Application Web" obtenue dans Extensions → Apps Script → Déployer (elle commence par https://script.google.com/macros/s/... et finit par /exec).';
    return;
  }

  els.settingsTestResult.className = 'test-result';
  els.settingsTestResult.textContent = 'Test de connexion en cours…';

  try {
    const res = await fetch(`${url}${url.includes('?') ? '&' : '?'}action=get&_=${Date.now()}`, {
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (!json.ok || !Array.isArray(json.days)) throw new Error('Réponse inattendue');
    els.settingsTestResult.className = 'test-result test-result--ok';
    els.settingsTestResult.textContent = `Connexion réussie ✓ (${json.days.length} jours trouvés dans Google Sheets)`;
  } catch (err) {
    els.settingsTestResult.className = 'test-result test-result--err';
    els.settingsTestResult.textContent = `Échec du test : ${err.message}. Vérifie que le déploiement est bien accessible à "Tout le monde".`;
  }
});

// ---------------------------------------------------------------------------
// Event Listeners
// ---------------------------------------------------------------------------
els.navButtons.forEach((btn) => {
  btn.addEventListener('click', () => switchView(btn.dataset.view));
});

els.btnPrevDay.addEventListener('click', () => {
  if (state.selectedDayIndex > 0) {
    state.selectedDayIndex--;
    renderTodayView();
  }
});

els.btnNextDay.addEventListener('click', () => {
  if (state.selectedDayIndex < state.days.length - 1) {
    state.selectedDayIndex++;
    renderTodayView();
  }
});

els.btnJumpToday.addEventListener('click', () => {
  if (state.todayIndex >= 0) {
    state.selectedDayIndex = state.todayIndex;
    renderTodayView();
  }
});

els.btnRefresh.addEventListener('click', () => loadData());

// Register Service Worker for Android PWA installation
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('SW registration failed:', err);
    });
  });
}

// Initial boot
loadData();
