// ========== STATISTICHE + PANNELLO TARGET ==========
import { state } from './state.js';
import { fmt, fmtMedia, getCapitale, getTargetPct } from './utils.js';
import { posAperteAll, plMese, plChiusureDelGiorno, chiusureDelGiorno, wilsonInterval, probWinRateSopra } from './calc.js';

export function updateStats(year, month) {
  const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
  const perimetroMese = state.wsScope === 'mese';

  // Chiusure nel perimetro scelto (mese corrente oppure tutte)
  let numChiusure = 0, wins = 0, losses = 0, be = 0;
  state.data.forEach(p => p.chiusure.forEach(c => {
    if (!perimetroMese || c.key.startsWith(prefix)) {
      numChiusure++;
      if (c.pl > 0) wins++;
      else if (c.pl < 0) losses++;
      else be++;
    }
  }));

  const aperte = posAperteAll().length;
  const profitto = plMese(year, month);
  const capitale = getCapitale();
  const perc = capitale > 0 ? (profitto / capitale) * 100 : 0;

  const elR = document.getElementById('rendimento');
  elR.textContent = (perc >= 0 ? '+' : '') + fmt(perc) + '%';
  elR.className = 'value ' + (perc > 0 ? 'positive' : perc < 0 ? 'negative' : '');

  document.getElementById('numOps').textContent = numChiusure;
  document.getElementById('posAperte').textContent = aperte;

  // Win rate con intervallo di confidenza di Wilson (95%)
  const elW = document.getElementById('winRate');
  const elWS = document.getElementById('winRateSub');
  const n = wins + losses;
  const etichetta = perimetroMese ? 'Nel mese:' : 'Totale:';
  const nessuna = perimetroMese ? 'nessuna chiusura nel mese' : 'nessuna chiusura registrata';
  if (n === 0) {
    elW.textContent = '—';
    elW.className = 'value';
    elWS.textContent = be ? `${be} chiusur${be === 1 ? 'a' : 'e'} break-even, nessuna vincente/perdente` : nessuna;
  } else {
    const z = 1.96;
    const w = wilsonInterval(wins, n, z);
    elW.innerHTML = `${fmtMedia(w.lo * 100)}% <span style="color:var(--muted);font-size:1.1rem">–</span> ${fmtMedia(w.hi * 100)}%`;
    elW.className = 'value ' + (w.p >= 0.5 ? 'positive' : 'negative');
    const prob50 = probWinRateSopra(wins, n, 0.5);
    elWS.innerHTML =
      `<div class="ws-row"><span class="ws-label">${etichetta}</span> <span class="ws-value">${wins} vittorie</span> <span class="ws-label">/</span> <span class="ws-value">${losses} perdite</span>${be ? ` <span class="ws-label">/ ${be} break-even</span>` : ''} <span class="ws-label">· win rate osservato</span> <span class="ws-value">${fmtMedia(w.p * 100)}%</span></div>` +
      `<div class="wilson-bar" title="Fascia blu = dove sta quasi certamente la tua abilità reale, linea = win rate osservato"><div class="wilson-range" style="left:${(w.lo * 100).toFixed(2)}%;width:${((w.hi - w.lo) * 100).toFixed(2)}%"></div><div class="wilson-point" style="left:${(w.p * 100).toFixed(2)}%"></div></div>` +
      `<div class="ws-row" style="margin-top:6px"><span class="ws-label">Probabilità che l'abilità reale sia &gt; 50%:</span> <span class="ws-value">${fmtMedia(prob50 * 100)}%</span></div>`;
  }
}

export function setWsScope(scope) {
  state.wsScope = scope;
  document.getElementById('wsMese').classList.toggle('active', scope === 'mese');
  document.getElementById('wsTotale').classList.toggle('active', scope === 'totale');
  updateStats(state.current.getFullYear(), state.current.getMonth());
}

// ========== TARGET PANNEL ==========
export function updateTarget(y, m) {
  const now = new Date();
  if (y == null) { y = now.getFullYear(); m = now.getMonth(); }

  const capitale = getCapitale();
  const pct = getTargetPct();
  const target = capitale * pct / 100;

  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const quota = target / daysInMonth;

  const isMeseCorrente = (y === now.getFullYear() && m === now.getMonth());
  const isMeseFuturo = (y > now.getFullYear()) || (y === now.getFullYear() && m > now.getMonth());

  const giorno = isMeseCorrente ? now.getDate() : (isMeseFuturo ? 0 : daysInMonth);
  const atteso = quota * giorno;
  const realizzato = plMese(y, m);
  const delta = realizzato - atteso;

  // P/L totale mensile da realizzare (in evidenza)
  document.getElementById('targetHero').textContent = '€ ' + fmt(target);

  // Percentuali rispetto al target
  const pctTarget = target !== 0 ? (realizzato / target) * 100 : null;
  const pctAtteso = target !== 0 ? (atteso / target) * 100 : null;
  const pctDelta = target !== 0 ? (delta / target) * 100 : null;

  document.getElementById('quotaGiornaliera').textContent = '€ ' + fmt(quota);
  document.getElementById('giornoCorrente').textContent = isMeseCorrente ? giorno : (isMeseFuturo ? 'futuro' : 'chiuso');
  document.getElementById('attesoOggi').textContent = '€ ' + fmt(atteso);
  document.getElementById('attesoPct').textContent = pctAtteso == null ? '' : `${fmt(pctAtteso)}% del target`;

  // Realizzato questo mese (hero grande, accanto al target)
  const elH = document.getElementById('realizzatoHero');
  elH.textContent = (realizzato >= 0 ? '+' : '−') + '€ ' + fmt(Math.abs(realizzato));
  elH.className = 'hero-value ' + (realizzato > 0 ? 'pos' : realizzato < 0 ? 'neg' : '');
  document.getElementById('realizzatoPct').textContent =
    pctTarget == null ? '' : `${pctTarget >= 0 ? '+' : '−'}${fmt(Math.abs(pctTarget))}% del target (${pctTarget >= 0 ? 'raggiunto' : 'in deficit'})`;

  const elD = document.getElementById('deltaRitmo');
  elD.textContent = (delta >= 0 ? '+' : '−') + '€ ' + fmt(Math.abs(delta));
  elD.className = 't-value ' + (delta >= 0 ? 'pos' : 'neg');
  document.getElementById('deltaPct').textContent =
    pctDelta == null ? '' : `${pctDelta >= 0 ? '+' : '−'}${fmt(Math.abs(pctDelta))}% vs target`;

  const fill = Math.min(100, target > 0 ? (realizzato / target) * 100 : 0);
  const fillEl = document.getElementById('targetProgress');
  fillEl.style.width = Math.max(0, fill) + '%';
  fillEl.className = 'progress-fill' + (realizzato < 0 ? ' neg' : '');
  const pacePct = isMeseFuturo ? 0 : (isMeseCorrente ? (now.getDate() / daysInMonth) * 100 : 100);
  document.getElementById('targetPace').style.left = Math.min(100, pacePct) + '%';

  let giornoMsg;
  const giorniRimanenti = daysInMonth - now.getDate() + 1; // oggi compreso
  const quotaRimanente = Math.max(0, target - realizzato) / giorniRimanenti;
  if (isMeseCorrente) {
    const todayKey = `${y}-${String(m + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const plOggi = plChiusureDelGiorno(todayKey);
    const deltaGiorno = plOggi - quotaRimanente;
    if (plOggi === 0 && !chiusureDelGiorno(todayKey).length) {
      giornoMsg = `Oggi ancora nessuna chiusura · obiettivo del giorno: <strong>€ ${fmt(quotaRimanente)}</strong>`;
    } else if (deltaGiorno >= 0) {
      giornoMsg = `Oggi: <span class="ok">✓ obiettivo del giorno centrato</span> (${plOggi >= 0 ? '+' : ''}€ ${fmt(plOggi)} vs € ${fmt(quotaRimanente)})`;
    } else {
      giornoMsg = `Oggi: <span class="ko">obiettivo non ancora centrato</span> (${plOggi >= 0 ? '+' : ''}€ ${fmt(plOggi)} — mancano € ${fmt(-deltaGiorno)})`;
    }
  } else {
    giornoMsg = `Giorni del mese: <strong>${daysInMonth}</strong>${isMeseFuturo ? ' · mese futuro' : ' · mese concluso'}`;
  }

  let ritmoMsg;
  if (isMeseFuturo) {
    ritmoMsg = `Mese futuro: obiettivo <strong>€ ${fmt(target)}</strong> (${pct}% mensile)`;
  } else if (delta >= 0) {
    ritmoMsg = isMeseCorrente
      ? `Sei <span class="ok">in anticipo di € ${fmt(delta)}</span> sul ritmo del target (${pct}% mensile)`
      : `Mese concluso: target <span class="ok">centrato</span> (+€ ${fmt(delta)} oltre il ${pct}%)`;
  } else {
    ritmoMsg = isMeseCorrente
      ? `Sei <span class="ko">in ritardo di € ${fmt(-delta)}</span> sul ritmo del target (${pct}% mensile)`
      : `Mese concluso: <span class="ko">target mancato</span> (−€ ${fmt(-delta)} vs ${pct}%)`;
  }

  document.getElementById('targetStatus').innerHTML = ritmoMsg + ' · ' + giornoMsg;
}
