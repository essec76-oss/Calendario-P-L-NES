// ========== RENDER CALENDARIO + HEADER PMC ==========
import { state } from './state.js';
import { fmt, fmtMedia, isoWeek, margineUnit, escapeHtml } from './utils.js';
import { apertureDelGiorno, chiusureDelGiorno, pmcDir, calcRoi } from './calc.js';
import { updateStats, updateTarget } from './dashboard.js';

export function render() {
  const year = state.current.getFullYear();
  const month = state.current.getMonth();
  const label = state.current.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
  document.getElementById('monthLabel').textContent = label.charAt(0).toUpperCase() + label.slice(1);

  const firstDay = new Date(year, month, 1);
  const startWeekday = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev = new Date(year, month, 0).getDate();

  const cal = document.getElementById('calendar');
  cal.innerHTML = '';

  // intestazione: cella vuota per la colonna settimana + giorni
  const corner = document.createElement('div');
  corner.className = 'weekday';
  corner.title = 'N° settimana';
  corner.textContent = 'W';
  cal.appendChild(corner);
  ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'].forEach(d => {
    const el = document.createElement('div');
    el.className = 'weekday';
    el.textContent = d;
    cal.appendChild(el);
  });

  // costruisce la lista di celle giorno (con data reale per il numero settimana)
  const cells = [];
  for (let i = startWeekday - 1; i >= 0; i--) {
    const d = daysInPrev - i;
    cells.push({ y: year, m: month - 1, d, other: true });
  }
  const today = new Date();
  for (let d = 1; d <= daysInMonth; d++) {
    const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === d;
    cells.push({ y: year, m: month, d, other: false, isToday });
  }
  const remaining = (7 - (cells.length % 7)) % 7;
  for (let d = 1; d <= remaining; d++) {
    cells.push({ y: year, m: month + 1, d, other: true });
  }

  // render per righe di 7 con numero settimana ISO a sinistra
  for (let r = 0; r < cells.length; r += 7) {
    const settimana = cells.slice(r, r + 7);
    const monday = new Date(settimana[0].y, settimana[0].m, settimana[0].d);
    const wEl = document.createElement('div');
    wEl.className = 'week-num';
    wEl.textContent = isoWeek(monday);
    wEl.title = `Settimana ${isoWeek(monday)}`;
    cal.appendChild(wEl);
    settimana.forEach(c => {
      cal.appendChild(createDayCell(c.y, c.m, c.d, c.other, !!c.isToday));
    });
  }

  updateStats(year, month);
  updateTarget(year, month);
  renderPmcHeader();
}

function createDayCell(y, m, d, other, isToday = false) {
  const dt = new Date(y, m, d);
  const y2 = dt.getFullYear(), m2 = dt.getMonth(), d2 = dt.getDate();
  const key = `${y2}-${String(m2 + 1).padStart(2, '0')}-${String(d2).padStart(2, '0')}`;

  const aps = apertureDelGiorno(key);
  const chs = chiusureDelGiorno(key);
  const hasEvents = aps.length > 0 || chs.length > 0;

  const cell = document.createElement('div');
  cell.className = 'day' + (other ? ' other-month' : '') + (isToday ? ' today' : '') + (hasEvents ? ' has-events' : '');
  cell.dataset.key = key;

  const num = document.createElement('div');
  num.className = 'num';
  // badge aperture colorati per direzione: LONG verde, SHORT rosso
  const apPerDir = {};
  aps.forEach(p => { apPerDir[p.dir] = (apPerDir[p.dir] || 0) + 1; });
  const apBadges = Object.entries(apPerDir).map(([dir, cnt]) =>
    ` <span class="ap-badge ${dir.toLowerCase()}">${dir === 'LONG' ? '▲' : '▼'}${cnt}</span>`
  ).join('');
  num.innerHTML = dt.getDate() + apBadges;
  cell.appendChild(num);

  if (chs.length) {
    let totCtr = 0, totMarg = 0;
    chs.forEach(x => {
      totCtr += x.c.contratti;
      totMarg += margineUnit(x.pos.dir) * x.c.contratti;
    });

    const det = document.createElement('div');
    det.className = 'details';
    det.textContent = `${totCtr} ctr chiusi · ${fmt(totMarg)}€ marg.`;
    cell.appendChild(det);

    // P/L per direzione: LONG verde, SHORT rosso
    const plPerDir = {};
    chs.forEach(x => { plPerDir[x.pos.dir] = (plPerDir[x.pos.dir] || 0) + x.c.pl; });
    Object.entries(plPerDir).forEach(([dir, pl]) => {
      const pnl = document.createElement('div');
      pnl.className = 'pnl ' + dir.toLowerCase();
      pnl.textContent = `${dir === 'LONG' ? '▲' : '▼'} ${pl >= 0 ? '+' : ''}${fmt(pl)} €`;
      cell.appendChild(pnl);
    });
  }

  if (aps.length && !chs.length) {
    const det = document.createElement('div');
    det.className = 'details';
    const desc = aps.map(p => `${p.dir} ${p.contratti}${p.strike ? ' @' + escapeHtml(p.strike) : ''}`).join(' · ');
    det.textContent = desc;
    cell.appendChild(det);
  }

  // Il click sul giorno è gestito da main.js via evento (evita import circolare calendar ↔ modal)
  cell.addEventListener('click', () => document.dispatchEvent(new CustomEvent('app:day-click', { detail: key })));
  return cell;
}

// ========== HEADER PMC ==========
export function renderPmcHeader() {
  [['LONG', 'pmcLong', 'pmcLongSub'], ['SHORT', 'pmcShort', 'pmcShortSub']].forEach(([dir, idV, idS]) => {
    const info = pmcDir(dir);
    const elV = document.getElementById(idV);
    const elS = document.getElementById(idS);
    // Se non c'è media oppure residuale = 0 → nessuna posizione aperta
    if (!info || info.media == null || info.residuoCtr === 0) {
      elV.textContent = '—';
      elS.textContent = 'nessuna posizione';
    } else {
      elV.textContent = fmtMedia(info.media);
      elS.textContent = `${info.residuoCtr} contr. apert${info.residuoCtr === 1 ? 'o' : 'i'}` + (info.senzaPrezzo ? ` · ${info.senzaPrezzo} senza prezzo` : '');
    }
  });
}
