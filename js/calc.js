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
// Regola del gruppo di contratti aperti per una direzione:
// 1. Ogni apertura imposta il PMC alla media di tutti i contratti aperti in quel momento.
//    Con 1 contratto vale il suo prezzo; aggiungendone un altro si mescola: (somma) / n.
// 2. Alla prima giornata di chiusura che segue un'apertura, il PMC passa alla media dei
//    contratti residui e resta fisso: le chiusure successive non lo ricalcolano.
// 3. Quando il gruppo si azzera, il PMC non esiste più finché non viene aperta una nuova posizione.
// Le chiusure di una giornata usano il PMC di inizio giornata (le aperture di quel giorno contano,
// le chiusure dello stesso giorno no).
export function pmcWalk(dir, finoA) {
  const posDir = state.data.filter(p => p.dir === dir);

  // Giornate con eventi, in ordine cronologico (le date ISO si ordinano come stringhe)
  const giorni = new Set();
  posDir.forEach(p => {
    giorni.add(p.openKey);
    p.chiusure.forEach(c => giorni.add(c.key));
  });
  const ordine = [...giorni].sort();

  // Stato dei lotti: una voce per posizione, con quantitativo residuo
  const lotti = new Map();
  const mediaAperti = () => {
    let val = 0, qtaPr = 0;
    lotti.forEach(l => {
      if (l.qta <= 0 || !l.ok) return;
      val += l.prezzo * l.qta;
      qtaPr += l.qta;
    });
    return qtaPr > 0 ? val / qtaPr : null;
  };

  let ref = null;            // PMC di riferimento corrente
  let ricalcolato = true;    // true = il PMC è già stato fissato sui residui dopo l'ultima apertura

  for (const k of ordine) {
    if (k > finoA) break;

    // 1. Aperture della giornata: il PMC diventa la media di tutti i contratti aperti
    let apertoOggi = false;
    posDir.forEach(p => {
      if (p.openKey !== k) return;
      const prezzo = parseNum(p.strike);
      lotti.set(p.id, { qta: p.contratti, prezzo, ok: !isNaN(prezzo) });
      apertoOggi = true;
    });
    if (apertoOggi) {
      ref = mediaAperti();
      ricalcolato = false;
    }

    // Giornata di riferimento: le chiusure non contano ancora
    if (k === finoA) break;

    // 2. Chiusure della giornata: usano il PMC di inizio giornata già impostato
    let chiusoOggi = false;
    posDir.forEach(p => p.chiusure.forEach(c => {
      if (c.key !== k) return;
      const l = lotti.get(p.id);
      if (l) l.qta = Math.max(0, l.qta - c.contratti);
      chiusoOggi = true;
    }));

    // 3. Fine giornata: solo la prima chiusura dopo un'apertura fissa il PMC sui residui
    if (chiusoOggi && !ricalcolato) {
      ref = mediaAperti();
      ricalcolato = true;
    }
  }

  let qta = 0, qtaPr = 0;
  lotti.forEach(l => {
    if (l.qta <= 0) return;
    qta += l.qta;
    if (l.ok) qtaPr += l.qta;
  });

  const posizioni = posDir.filter(p => residual(p) > 0).length;
  let residuoCtr = 0;
  posDir.forEach(p => { residuoCtr += Math.max(0, residual(p)); });

  return {
    media: ref,
    qta,
    qtaPr,
    senzaPrezzo: Math.max(0, qta - qtaPr),
    posizioni,
    residuoCtr
  };
}

export function pmcDir(dir) {
  return pmcWalk(dir, '9999-99-99');
}

// ========== PMC DI RIFERIMENTO PER LE CHIUSURE ==========
// PMC valido all'inizio della giornata della chiusura. Il P/L è strike di uscita meno questo PMC.
export function pmcRiferimento(pos, fallbackKey) {
  const w = pmcWalk(pos.dir, fallbackKey || '9999-99-99');
  if (w.media == null) return null;
  return {
    media: w.media,
    contratti: w.qtaPr,
    posizioni: 1,
    senzaPrezzo: w.senzaPrezzo,
    residuoCtr: w.residuoCtr
  };
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
// P/L chiuso nel mese fino a una data (inclusa), chiave 'YYYY-MM-DD'
export function plMeseFinoA(y, m, fineKey) {
  const prefix = `${y}-${String(m + 1).padStart(2, '0')}`;
  let tot = 0;
  state.data.forEach(p => p.chiusure.forEach(c => {
    if (c.key.startsWith(prefix) && c.key <= fineKey) tot += c.pl || 0;
  }));
  return tot;
}
