// ========== HELPER PURI ==========
import { MARGINE_LONG, MARGINE_SHORT } from './config.js';

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

// Valori dei due input principali
export function getCapitale() {
  return parseFloat(document.getElementById('capitale').value) || 5000;
}

export function getTargetPct() {
  return parseFloat(document.getElementById('targetPct').value) || 0;
}
