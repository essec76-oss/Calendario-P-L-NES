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

// Posizioni ancora aperte, dalla più vecchia (in alto) alla più recente (in basso).
// A parità di data vale l'ordine di inserimento.
export function posAperteAll() {
  return state.data
    .map((p, i) => ({ p, i }))
    .filter(x => residual(x.p) > 0)
    .sort((a, b) => {
      if (a.p.openKey !== b.p.openKey) return a.p.openKey < b.p.openKey ? -1 : 1;
      return a.i - b.i;
    })
    .map(x => x.p);
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
// Ogni posizione è un lotto con un prezzo (lo strike di apertura).
// Le chiusure riducono il lotto della posizione su cui sono state registrate.
// Il PMC per direzione è la media pesata sul quantitativo dei lotti ancora in piedi:
// con lotti da 1 contratto equivale a somma dei prezzi / n.
// Default FIFO: in chiusura i lotti più vecchi sono preselezionati;
// l'utente può scegliere altri lotti, e il PMC si ricalcola sui rimasti.
// pmcWalk ripercorre cronologicamente aperture e chiusure fino alla data voluta:
// le aperture dello stesso giorno contano, le chiusure dello stesso giorno no.
export function pmcWalk(dir, finoA) {
  const ev = [];
  state.data.forEach(p => {
    if (p.dir !== dir) return;
    const prezzo = parseNum(p.strike);
    ev.push({ key: p.openKey, ap: true, pos: p, qta: p.contratti, prezzo, ok: !isNaN(prezzo) });
    p.chiusure.forEach(c => ev.push({ key: c.key, ap: false, pos: p, qta: c.contratti }));
  });
  ev.sort((a, b) => a.key === b.key ? (a.ap === b.ap ? 0 : (a.ap ? -1 : 1)) : (a.key < b.key ? -1 : 1));

  // Stato dei lotti: una voce per posizione, con quantitativo residuo.
  const lotti = new Map();
  ev.forEach(e => {
    if (e.key > finoA) return;
    if (e.key === finoA && !e.ap) return;
    if (e.ap) {
      lotti.set(e.pos.id, { qta: e.qta, prezzo: e.prezzo, ok: e.ok });
    } else {
      const l = lotti.get(e.pos.id);
      if (l) l.qta = Math.max(0, l.qta - e.qta);
    }
  });

  let qta = 0, qtaPr = 0, val = 0;
  lotti.forEach(l => {
    if (l.qta <= 0) return;
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
// Il PMC usato per una chiusura è quello valido all'inizio del giorno in cui avviene
// (le chiusure di quel giorno non contano ancora). Il P/L è strike di uscita meno questo PMC.
export function pmcRiferimento(pos, fallbackKey) {
  const w = pmcWalk(pos.dir, fallbackKey || '9999-99-99');
  if (w.media == null) return null;
  return { media: w.media, contratti: w.qta, posizioni: 1, senzaPrezzo: w.senzaPrezzo, residuoCtr: w.residuoCtr };
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
