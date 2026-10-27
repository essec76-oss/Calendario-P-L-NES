// ========== LOGICA PURA: PMC, P/L, ROI, WILSON, AGGREGAZIONI ==========
// Nessun riferimento al DOM: prende `state.data` e restituisce valori. Facile da testare.
import { state } from './state.js';
import { parseNum, margineUnit } from './utils.js';
import { MOLTIPLICATORE } from './config.js';

// ========== RESIDUI ==========
export function residual(p) {
  const chiusi = p.chiusure.reduce((s, c) => s + c.contratti, 0);
  return p.contratti - chiusi;
}

export function posAperteAll() {
  return state.data.filter(p => residual(p) > 0);
}

// ========== EVENTI PER GIORNO ==========
export function apertureDelGiorno(key) {
  return state.data.filter(p => p.openKey === key);
}

export function chiusureDelGiorno(key) {
  const out = [];
  state.data.forEach(p => p.chiusure.forEach((c, i) => {
    if (c.key === key) out.push({ pos: p, c, i });
  }));
  return out;
}

export function plChiusureDelGiorno(key) {
  return chiusureDelGiorno(key).reduce((s, x) => s + x.c.pl, 0);
}

export function plMese(y, m) {
  const prefix = `${y}-${String(m + 1).padStart(2, '0')}`;
  let tot = 0;
  state.data.forEach(p => p.chiusure.forEach(c => {
    if (c.key.startsWith(prefix)) tot += c.pl || 0;
  }));
  return tot;
}

// ========== PREZZO MEDIO CARICO (PMC) ==========
// Semantica FIFO (first in, first out): il PMC per direzione è la media dei
// lotti ancora aperti. Le aperture aggiungono lotti in coda (blending sul
// quantitativo aperto); le chiusure tolgono i contratti dai lotti più
// anziani, quindi dopo ogni chiusura la media si ricalcola sui lotti
// rimasti. pmcWalk ripercorre cronologicamente aperture e chiusure fino
// alla data voluta: le aperture dello stesso giorno contano, le chiusure no.
export function pmcWalk(dir, finoA) {
  const ev = [];
  state.data.forEach(p => {
    if (p.dir !== dir) return;
    const prezzo = parseNum(p.strike);
    ev.push({ key: p.openKey, ap: true, qta: p.contratti, prezzo, ok: !isNaN(prezzo) });
    p.chiusure.forEach(c => ev.push({ key: c.key, ap: false, qta: c.contratti }));
  });
  ev.sort((a, b) => a.key === b.key ? (a.ap === b.ap ? 0 : (a.ap ? -1 : 1)) : (a.key < b.key ? -1 : 1));
  // Coda FIFO dei lotti: le aperture aggiungono in fondo, le chiusure
  // consumano i contratti dai lotti più anziani.
  const lotti = [];
  ev.forEach(e => {
    if (e.key > finoA) return;
    if (e.key === finoA && !e.ap) return;
    if (e.ap) {
      lotti.push({ qta: e.qta, prezzo: e.prezzo, ok: e.ok });
    } else {
      let rim = e.qta;
      while (rim > 0 && lotti.length) {
        const lotto = lotti[0];
        const take = Math.min(lotto.qta, rim);
        lotto.qta -= take;
        rim -= take;
        if (lotto.qta === 0) lotti.shift();
      }
    }
  });
  let qta = 0, qtaPr = 0, val = 0;
  lotti.forEach(l => {
    qta += l.qta;
    if (l.ok) { val += l.prezzo * l.qta; qtaPr += l.qta; }
  });
  const posAperteDir = state.data.filter(p => p.dir === dir && residual(p) > 0).length;
  let residuoCtr = 0;
  state.data.filter(p => p.dir === dir).forEach(p => { residuoCtr += Math.max(0, residual(p)); });
  return {
    media: qtaPr > 0 ? val / qtaPr : null,
    qta,
    senzaPrezzo: Math.max(0, qta - qtaPr),
    posizioni: posAperteDir,
    residuoCtr
  };
}

export function pmcDir(dir) {
  return pmcWalk(dir, '9999-99-99');
}

// ========== PMC DI RIFERIMENTO PER LE CHIUSURE ==========
// Con la logica FIFO il PMC non è più "congelato": ogni chiusura guarda alla
// media valida all'inizio del giorno in cui avviene (le chiusure di quel
// giorno non contano ancora nel walk). Il P/L è strike di uscita meno
// questo PMC; dopo la chiusura i lotti più anziani escono dal calcolo e la
// media si ricalcola sui lotti rimasti.
export function pmcRiferimento(pos, fallbackKey) {
  const w = pmcWalk(pos.dir, fallbackKey || '9999-99-99');
  if (w.media == null) return null;
  return { media: w.media, contratti: w.qtaPr, posizioni: 1, senzaPrezzo: w.senzaPrezzo, residuoCtr: w.residuoCtr };
}

// ========== P/L ==========
export function puntiUscita(dir, pmc, uscita) {
  return dir === 'LONG' ? (uscita - pmc) : (pmc - uscita);
}

export function autoPlPos(pos, contratti, uscita) {
  const info = pmcRiferimento(pos, state.selectedDate);
  if (!info) return NaN;
  const punti = puntiUscita(pos.dir, info.media, uscita);
  const pl = punti * contratti * MOLTIPLICATORE;
  return Math.round(pl * 100) / 100;
}

export function calcRoi(pl, margine) {
  if (!margine || margine === 0) return 0;
  return (pl / margine) * 100;
}

// ========== STATISTICHE: WILSON ==========
// z = 1.96 per il 95%
export function wilsonInterval(wins, n, z) {
  if (n === 0) return null;
  const p = wins / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n))) / denom;
  return {
    p,
    lo: Math.max(0, center - half),
    hi: Math.min(1, center + half)
  };
}

// CDF normale approssimata (Abramowitz–Stegun)
export function normCdf(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804 * Math.exp(-x * x / 2);
  const p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x > 0 ? 1 - p : p;
}

// Probabilità che il vero win rate sia sopra una soglia (es. 50%)
export function probWinRateSopra(wins, n, soglia) {
  if (n === 0) return null;
  const p = wins / n;
  const se = Math.sqrt(p * (1 - p) / n);
  if (se === 0) return p > soglia ? 1 : (p < soglia ? 0 : 0.5);
  return normCdf((p - soglia) / se);
}
