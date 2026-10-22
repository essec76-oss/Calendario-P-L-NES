// ========== ENTRY POINT: WIRING EVENTI + INIT ==========
import { state } from './state.js';
import { initSupabase, loadData, saveData, importaDaLocalStorage, SAVED_EVENT } from './storage.js';
import { render, renderPmcHeader } from './calendar.js';
import { updateStats, updateTarget, setWsScope } from './dashboard.js';
import {
  populateCommissioni, openModal, closeModal, setMode, setChMode,
  updatePreviewApertura, updatePreviewChiusura, updatePreviewMulti,
  addApertura, addChiusura, addChiusuraMulti,
  deletePosizione, deleteChiusura
} from './modal.js';

const $ = id => document.getElementById(id);

// ---------- NAVIGAZIONE MESE ----------
$('prevMonth').addEventListener('click', () => {
  state.current.setMonth(state.current.getMonth() - 1);
  render();
});
$('nextMonth').addEventListener('click', () => {
  state.current.setMonth(state.current.getMonth() + 1);
  render();
});

// ---------- INPUT CAPITALI / TARGET ----------
$('capitale').addEventListener('change', () => {
  saveData();
  render();
});
$('capitale').addEventListener('input', () => {
  updateStats(state.current.getFullYear(), state.current.getMonth());
  updateTarget(state.current.getFullYear(), state.current.getMonth());
});
$('targetPct').addEventListener('change', () => {
  saveData();
  updateTarget(state.current.getFullYear(), state.current.getMonth());
});
$('targetPct').addEventListener('input', () => updateTarget(state.current.getFullYear(), state.current.getMonth()));

// ---------- WILSON TOGGLE ----------
$('wsMese').addEventListener('click', () => setWsScope('mese'));
$('wsTotale').addEventListener('click', () => setWsScope('totale'));

// ---------- MODALE ----------
$('btnChiudi').addEventListener('click', closeModal);
$('btnImporta').addEventListener('click', () => importaDaLocalStorage(render));
$('btnAggiungi').addEventListener('click', () => {
  if (state.mode === 'apertura') addApertura();
  else if (state.chMode === 'multipla') addChiusuraMulti();
  else addChiusura();
});
$('subSingola').addEventListener('click', () => setChMode('singola'));
$('subMultipla').addEventListener('click', () => setChMode('multipla'));
$('modal').addEventListener('click', (e) => {
  if (e.target.id === 'modal') closeModal();
});
$('toggleApertura').addEventListener('click', () => setMode('apertura'));
$('toggleChiusura').addEventListener('click', () => setMode('chiusura'));

// ---------- FORM APERTURA ----------
$('apTipologia').addEventListener('change', updatePreviewApertura);
$('apContratti').addEventListener('input', updatePreviewApertura);
$('apContratti').addEventListener('keydown', (e) => { if (e.key === 'Enter') addApertura(); });
$('apStrike').addEventListener('keydown', (e) => { if (e.key === 'Enter') addApertura(); });
$('apNota').addEventListener('keydown', (e) => { if (e.key === 'Enter') addApertura(); });

// ---------- FORM CHIUSURA SINGOLA ----------
$('chPosizione').addEventListener('change', () => {
  const pos = state.data.find(p => p.id == $('chPosizione').value);
  if (pos) {
    $('chContratti').value = residual(pos);
    $('chStrike').value = pos.strike || '';
  }
  updatePreviewChiusura();
});
$('chContratti').addEventListener('input', updatePreviewChiusura);
$('chStrike').addEventListener('input', () => { state.singolaAuto = true; updatePreviewChiusura(); });
$('chImporto').addEventListener('input', updatePreviewChiusura);
$('chImporto').addEventListener('input', () => { state.singolaAuto = false; });
$('chCommissioni').addEventListener('change', () => { state.singolaAuto = true; updatePreviewChiusura(); });
$('chImporto').addEventListener('keydown', (e) => { if (e.key === 'Enter') addChiusura(); });
$('chContratti').addEventListener('keydown', (e) => { if (e.key === 'Enter') addChiusura(); });

// ---------- FORM CHIUSURA MULTIPLA ----------
$('chImportoMulti').addEventListener('input', updatePreviewMulti);
$('chImportoMulti').addEventListener('input', () => { state.multiAuto = false; });
$('chStrikeMulti').addEventListener('input', () => { state.multiAuto = true; updatePreviewMulti(); });
$('chCommissioniMulti').addEventListener('change', () => { state.multiAuto = true; updatePreviewMulti(); });
$('chStrikeMulti').addEventListener('keydown', (e) => { if (e.key === 'Enter') addChiusuraMulti(); });
$('chImportoMulti').addEventListener('keydown', (e) => { if (e.key === 'Enter') addChiusuraMulti(); });

// ---------- HANDLER INLINE (onclick nel markup generato) ----------
window.deletePosizione = deletePosizione;
window.deleteChiusura = deleteChiusura;
window.openModal = openModal; // usato dalle celle del calendario

// ---------- RE-RENDER PMC DOPO OGNI SAVE (al posto della chiamata diretta in saveData) ----------
document.addEventListener(SAVED_EVENT, renderPmcHeader);

// ---------- APERTURA MODALE DAL CALENDARIO ----------
document.addEventListener('app:day-click', (e) => openModal(e.detail));

// ---------- INIT ----------
import { residual } from './calc.js'; // hoisted: disponibile anche se dichiarato in fondo (ES modules)

populateCommissioni();
render();
initSupabase().then(() => loadData().then(d => {
  state.data = d;
  render();
  $('btnImporta').disabled = false;
}));
