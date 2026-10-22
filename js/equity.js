// ========== PAGINA EQUITY: GRAFICO REALE VS RITMO STANDARD ==========
import { state } from './state.js';
import { initSupabase, loadData } from './storage.js';
import { getCapitale, getTargetPct, fmt } from './utils.js';

const VALUTA = '$';
const MS_GIORNO = 86400000;
let chart = null;

const $ = id => document.getElementById(id);

function dateToKey(dt) {
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function keyToDate(k) {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

// Serie giornaliera: equity reale cumulativa e ritmo standard lineare
export function costruisciSerie() {
  const plPerGiorno = {};
  const date = [];

  state.data.forEach(p => {
    date.push(p.openKey);
    p.chiusure.forEach(c => {
      plPerGiorno[c.key] = (plPerGiorno[c.key] || 0) + (c.pl || 0);
      date.push(c.key);
    });
  });

  if (!date.length) return null;
  date.sort();

  const start = keyToDate(date[0]);
  const oggi = new Date();
  oggi.setHours(0, 0, 0, 0);
  let end = oggi;
  const ultima = keyToDate(date[date.length - 1]);
  if (ultima > end) end = ultima;

  // ritmo standard: target mensile / (365/12) giorni, per ogni giorno trascorso
  const capitale = getCapitale();
  const pct = getTargetPct();
  const rataGiorno = (capitale * pct / 100) / (365 / 12);

  const labels = [];
  const reale = [];
  const standard = [];
  let cum = 0;
  let i = 0;

  for (let dt = new Date(start); dt <= end; dt.setDate(dt.getDate() + 1)) {
    cum += plPerGiorno[dateToKey(dt)] || 0;
    i++;
    labels.push(dt.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit' }));
    reale.push(round2(cum));
    standard.push(round2(rataGiorno * i));
  }

  return { labels, reale, standard };
}

function disegna(serie) {
  const ctx = $('equityChart');
  if (chart) chart.destroy();

  chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: serie.labels,
      datasets: [
        {
          label: 'Equity reale',
          data: serie.reale,
          borderColor: '#22c55e',
          backgroundColor: 'rgba(34,197,94,0.15)',
          fill: true,
          tension: 0.25,
          pointRadius: 0,
          borderWidth: 2.5
        },
        {
          label: 'Ritmo standard',
          data: serie.standard,
          borderColor: '#3b82f6',
          borderDash: [6, 4],
          fill: false,
          tension: 0,
          pointRadius: 0,
          borderWidth: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: c => `${c.dataset.label}: ${VALUTA} ${fmt(c.parsed.y)}`
          }
        }
      },
      scales: {
        x: {
          ticks: { color: '#94a3b8', maxTicksLimit: 10 },
          grid: { color: '#1e293b' }
        },
        y: {
          ticks: { color: '#94a3b8', callback: v => `${VALUTA} ${fmt(v)}` },
          grid: { color: '#334155' }
        }
      }
    }
  });
}

function aggiornaRiepilogo(serie) {
  const last = serie.reale.length - 1;
  const reale = serie.reale[last];
  const standard = serie.standard[last];
  const diff = round2(reale - standard);

  const elR = $('eqReale');
  elR.textContent = `${VALUTA} ${fmt(reale)}`;
  elR.className = 't-value ' + (reale >= 0 ? 'pos' : 'neg');

  $('eqStandard').textContent = `${VALUTA} ${fmt(standard)}`;

  const elD = $('eqDiff');
  elD.textContent = `${diff >= 0 ? '+' : '−'}${VALUTA} ${fmt(Math.abs(diff))}`;
  elD.className = 't-value ' + (diff >= 0 ? 'pos' : 'neg');
}

function toggleDataset(indice, btn) {
  const visibile = !chart.isDatasetVisible(indice);
  chart.setDatasetVisibility(indice, visibile);
  btn.classList.toggle('active', visibile);
  chart.update();
}

async function init() {
  await initSupabase();
  state.data = await loadData();

  if (typeof Chart === 'undefined') {
    $('emptyMsg').textContent = 'Libreria grafico non caricata. Controlla la connessione e ricarica la pagina.';
    $('emptyMsg').style.display = '';
    $('chartBox').style.display = 'none';
    return;
  }

  const serie = costruisciSerie();
  if (!serie) {
    $('emptyMsg').style.display = '';
    $('chartBox').style.display = 'none';
    return;
  }

  disegna(serie);
  aggiornaRiepilogo(serie);

  $('btnReale').addEventListener('click', () => toggleDataset(0, $('btnReale')));
  $('btnStandard').addEventListener('click', () => toggleDataset(1, $('btnStandard')));
}

init();
