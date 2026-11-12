// ========== HELPER PURI ==========
import { MARGINE_LONG, MARGINE_SHORT } from './config.js';
import { state } from './state.js';
export function fmt(n) {
  return n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtMedia(n) {
  return n.toLocaleString('it-IT', { maximumFractionDigits: 2 });
}

// parse numero (accetta virgola o punto)
export function parseNum(v) {
  if (v == null || v === '') return NaN;
  const n = parseFloat(String(v).replace(',', '.'));
  return isNaN(n) ? NaN : n;
}

export function uid() {
  return Date.now() + Math.floor(Math.random() * 1000);
}

export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function margineUnit(dir) {
  return dir === 'SHORT' ? MARGINE_SHORT : MARGINE_LONG;
}

// ========== NUMERO SETTIMANA ISO ==========
export function isoWeek(dt) {
  const d = new Date(Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7; // lun = 0
  d.setUTCDate(d.getUTCDate() - dayNum + 3); // giovedì della settimana
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const fDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - fDayNum + 3);
  return 1 + Math.round((d - firstThursday) / (7 * 86400000));
}

// ========== CHIAVI MESE / SETTIMANA ==========
export function meseKey(d = state.current) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function dayKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Chiave settimana ISO 'YYYY-Www' (l'anno è quello del giovedì della settimana)
export function isoWeekKey(dt) {
  const d = new Date(Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  return `${d.getUTCFullYear()}-W${String(isoWeek(dt)).padStart(2, '0')}`;
}

// Impostazioni del mese; se il mese non è configurato eredita la configurazione precedente più vicina
export function impostazioneMese(k = meseKey()) {
  if (state.impostazioniMese[k]) return state.impostazioniMese[k];
  const chiavi = Object.keys(state.impostazioniMese).sort();
  const vicina = chiavi.filter(x => x < k).pop() ?? chiavi[0];
  return vicina ? state.impostazioniMese[vicina] : { capitale: 5000, target_pct: 4 };
}

export function getCapitale() {
  return impostazioneMese().capitale;
}

export function getTargetPct() {
  return impostazioneMese().target_pct;
}

export function setImpostazioneMese(patch) {
  const k = meseKey();
  state.impostazioniMese[k] = { ...impostazioneMese(k), ...patch };
}
