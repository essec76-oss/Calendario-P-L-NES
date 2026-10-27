// ========== ENTRY POINT: WIRING EVENTI + INIT ==========
import { state } from './state.js';
import { initSupabase, loadData, saveData, importaDaLocalStorage, SAVED_EVENT } from './storage.js';
import { render, renderPmcHeader } from './calendar.js';
import { updateStats, updateTarget, setWsScope } from './dashboard.js';
import { residual } from './calc.js';
import {
  openModal, closeModal, setMode, setChMode,
  updatePreviewApertura, updatePreviewChiusura, updatePreviewMulti,
  addApertura, addChiusura, addChiusuraMulti,
  deletePosizione, deleteChiusura
} from './modal.js';

const $ = id => document.getElementById(id);

// Aggancia un evento solo se l'elemento esiste: un id mancante non blocca lo script
const on = (id, evento, fn) => {
  const el = $(id);
  if (el) el.addEventListener(evento, fn);
  else console.warn(`main.js: elemento #${id} non trovato`);
};

// ---------- NAVIGAZIONE MESE ----------
on('prevMonth', 'click', () => {
  state.current.setMonth(state.current.getMonth() - 1);
  render();
});
on('nextMonth', 'click', () => {
  state.current.setMonth(state.current.getMonth() + 1);
  render();
});

// ---------- INPUT CAPITALE / TARGET ----------
on('capitale', 'change', () => {
  saveData();
  render();
});
on('capitale', 'input', () => {
  updateStats(state.current.getFullYear(), state.current.getMonth());
  updateTarget(state.current.getFullYear(), state.current.getMonth());
});
on('targetPct', 'change', () => {
  saveData();
  updateTarget(state.current.getFullYear(), state.current.getMonth());
});
on('targetPct', 'input', () => {
  updateTarget(state.current.getFullYear(), state.current.getMonth());
});

// ---------- WILSON TOGGLE ----------
on('wsMese', 'click', () => setWsScope('mese'));
on('wsTotale', 'click', () => setWsScope('totale'));

// ---------- MODALE ----------
on('btnChiudi', 'click', closeModal);
on('btnImporta', 'click', () => importaDaLocalStorage(render));
on('btnAggiungi', 'click', () => {
  if (state.mode === 'apertura') addApertura();
  else if (state.chMode === 'multipla') addChiusuraMulti();
  else addChiusura();
});
on('subSingola', 'click', () => setChMode('singola'));
on('subMultipla', 'click', () => setChMode('multipla'));
on('modal', 'click', (e) => {
  if (e.target.id === 'modal') closeModal();
});
on('toggleApertura', 'click', () => setMode('apertura'));
on('toggleChiusura', 'click', () => setMode('chiusura'));

// ---------- FORM APERTURA ----------
on('apTipologia', 'change', updatePreviewApertura);
on('apContratti', 'input', updatePreviewApertura);
on('apContratti', 'keydown', (e) => { if (e.key === 'Enter') addApertura(); });
on('apStrike', 'keydown', (e) => { if (e.key === 'Enter') addApertura(); });
on('apNota', 'keydown', (e) => { if (e.key === 'Enter') addApertura(); });

// ---------- FORM CHIUSURA SINGOLA ----------
on('chPosizione', 'change', () => {
  const pos = state.data.find(p => p.id == $('chPosizione').value);
  if (pos) {
    $('chContratti').value = residual(pos);
    $('chStrike').value = pos.strike || '';
  }
  state.singolaAuto = true;
  updatePreviewChiusura();
});
on('chContratti', 'input', () => { state.singolaAuto = true; updatePreviewChiusura(); });
on('chStrike', 'input', () => { state.singolaAuto = true; updatePreviewChiusura(); });
on('chImporto', 'input', () => { state.singolaAuto = false; updatePreviewChiusura(); });
on('chImporto', 'keydown', (e) => { if (e.key === 'Enter') addChiusura(); });
on('chContratti', 'keydown', (e) => { if (e.key === 'Enter') addChiusura(); });

// ---------- FORM CHIUSURA MULTIPLA ----------
on('chImportoMulti', 'input', () => { state.multiAuto = false; updatePreviewMulti(); });
on('chStrikeMulti', 'input', () => { state.multiAuto = true; updatePreviewMulti(); });
on('chStrikeMulti', 'keydown', (e) => { if (e.key === 'Enter') addChiusuraMulti(); });
on('chImportoMulti', 'keydown', (e) => { if (e.key === 'Enter') addChiusuraMulti(); });

// ---------- HANDLER INLINE (onclick nel markup generato) ----------
window.deletePosizione = deletePosizione;
window.deleteChiusura = deleteChiusura;
window.openModal = openModal;

// ---------- RE-RENDER PMC DOPO OGNI SAVE ----------
document.addEventListener(SAVED_EVENT, renderPmcHeader);

// ---------- APERTURA MODALE DAL CALENDARIO ----------
document.addEventListener('app:day-click', (e) => openModal(e.detail));

// ---------- INIT ----------
render();
initSupabase().then(() => loadData().then(d => {
  state.data = d;
  render();
  on('btnImporta', 'click', () => {}); // placeholder, il listener reale è già sopra
  const btn = $('btnImporta');
  if (btn) btn.disabled = false;
}));
