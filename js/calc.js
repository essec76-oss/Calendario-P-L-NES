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
// Semantica da conto reale: il PMC aggregato per direzione è una proprietà
// della POSIZIONE AGGREGATA. Le chiusure NON lo modificano mai. Cambia
// solo con le aperture (blending sul quantitativo aperto) e si azzera
// quando la direzione torna piatta (tutti i contratti chiusi).
// pmcWalk ripercorre cronologicamente aperture e chiusure fino alla data
// voluta: le aperture dello stesso giorno contano, le chiusure no.
export function pmcWalk(dir, finoA) {
  const ev = [];
  state.data.forEach(p => {
    if (p.dir !== dir) return;
    const prezzo = parseNum(p.strike);
    ev.push({ key: p.openKey, ap: true, qta: p.contratti, prezzo, ok: !isNaN(prezzo) });
    p.chiusure.forEach(c => ev.push({ key: c.key, ap: false, qta: c.contratti }));
  });
  ev.sort((a, b) => a.key === b.key ? (a.ap === b.ap ? 0 : (a.ap ? -1 : 1)) : (a.key < b.key ? -1 : 1));
  let qta = 0, qtaPr = 0, val = 0;
  ev.forEach(e => {
    if (e.key > finoA) return;
    if (e.key === finoA && !e.ap) return;
    if (e.ap) {
      qta += e.qta;
      if (e.ok) { val += e.prezzo * e.qta; qtaPr += e.qta; }
    } else {
      qta -= e.qta;
      if (qta <= 0) { qta = 0; qtaPr = 0; val = 0; }
    }
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
// Media d'entrata della direzione "congelata" al giorno della PRIMA chiusura
// della posizione (o al giorno dell'operazione se non ha ancora chiusure):
// è il valore del walk cronologico a quella data. Chiusure successive e
// nuove aperture NON la modificano: ogni chiusura guarda alla media valida
// quando è iniziata l'uscita da quella posizione.
export function pmcRiferimento(pos, fallbackKey) {
  const keys = pos.chiusure.map(c => c.key).sort();
  const refKey = keys.length ? keys[0] : (fallbackKey || '9999-99-99');
  const w = pmcWalk(pos.dir, refKey);
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
