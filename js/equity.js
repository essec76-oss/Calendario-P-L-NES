// ========== PAGINA EQUITY: GRAFICO REALE VS RITMO STANDARD ==========
import { state } from './state.js';
import { initSupabase, loadData } from './storage.js';
import { getCapitale, getTargetPct, fmt } from './utils.js';

const VALUTA = '$';
let chart = null;
let scope = 'totale';   // 'totale' | 'mese'
let mostraReale = true;
let mostraStandard = true;
let meseVisualizzato = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let indiceOggi = -1;    // posizione di oggi nella serie corrente (-1 = fuori intervallo)

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

// Plugin Chart.js: disegna un pallino su ogni serie visibile nel giorno di oggi
const pallinoOggi = {
  id: 'pallinoOggi',
  afterDatasetsDraw(chart) {
    if (indiceOggi < 0) return;
    const { ctx } = chart;
    chart.data.datasets.forEach((ds, dsIdx) => {
      if (!chart.isDatasetVisible(dsIdx)) return;
      const pt = chart.getDatasetMeta(dsIdx).data[indiceOggi];
      const val = ds.data[indiceOggi];
      if (!pt || val == null) return;

      ctx.save();
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = ds.borderColor;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    });
  }
};
Chart.register(pallinoOggi);

// Serie giornaliera tra due date: equity reale cumulata nel periodo e ritmo standard lineare
export function costruisciSerie(da, a, rataGiorno) {
  const plPerGiorno = {};
  state.data.forEach(p => p.chiusure.forEach(c => {
    plPerGiorno[c.key] = (plPerGiorno[c.key] || 0) + (c.pl || 0);
  }));

  const labels = [];
  const keys = [];
  const reale = [];
  const standard = [];
  let cum = 0;
  let i = 0;

  for (let dt = new Date(da); dt <= a; dt.setDate(dt.getDate() + 1)) {
    const key = dateToKey(dt);
    cum += plPerGiorno[key] || 0;
    i++;
    labels.push(dt.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit' }));
    keys.push(key);
    reale.push(round2(cum));
    standard.push(round2(rataGiorno * i));
  }

  const idxOggi = keys.indexOf(dateToKey(new Date()));

  return { labels, reale, standard, idxOggi };
}

// Intervallo "Totale": dalla prima data registrata fino a oggi (o all'ultima chiusura se successiva)
function intervalloTotale() {
  const date = [];
  state.data.forEach(p => {
    date.push(p.openKey);
    p.chiusure.forEach(c => date.push(c.key));
  });
  if (!date.length) return null;
  date.sort();

  const oggi = new Date();
  oggi.setHours(0, 0, 0, 0);
  let a = oggi;
  const ultima = keyToDate(date[date.length - 1]);
  if (ultima > a) a = ultima;

  const rataGiorno = (getCapitale() * getTargetPct() / 100) / (365 / 12);
  return { da: keyToDate(date[0]), a, rataGiorno };
}

// Intervallo "Mese": dal 1° all'ultimo giorno del mese selezionato, ritmo = target / giorni del mese
function intervalloMese() {
  const y = meseVisualizzato.getFullYear();
  const m = meseVisualizzato.getMonth();
  const da = new Date(y, m, 1);
  const a = new Date(y, m + 1, 0);
  const giorniMese = a.getDate();
  const rataGiorno = (getCapitale() * getTargetPct() / 100) / giorniMese;
  return { da, a, rataGiorno };
}

function meseTitolo() {
  const s = meseVisualizzato.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function disegna(serie) {
  const ctx = $('equityChart');
  if (chart) chart.destroy();

  indiceOggi = serie.idxOggi;

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
  if (indice === 0) mostraReale = !mostraReale;
  else mostraStandard = !mostraStandard;

  const visibile = indice === 0 ? mostraReale : mostraStandard;
  btn.classList.toggle('active', visibile);
  if (chart) {
    chart.setDatasetVisibility(indice, visibile);
    chart.update();
  }
}

function aggiorna() {
  const isMese = scope === 'mese';
  $('meseNav').style.display = isMese ? '' : 'none';
  $('btnTotale').classList.toggle('active', !isMese);
  $('btnMese').classList.toggle('active', isMese);

  const intervallo = isMese ? intervalloMese() : intervalloTotale();

  if (!intervallo) {
    if (chart) { chart.destroy(); chart = null; }
    indiceOggi = -1;
    $('chartBox').style.display = 'none';
    $('emptyMsg').textContent = 'Nessun dato ancora: registra qualche apertura nel calendario.';
    $('emptyMsg').style.display = '';
    return;
  }

  $('emptyMsg').style.display = 'none';
  $('chartBox').style.display = '';
  $('meseLabel').textContent = meseTitolo();

  const serie = costruisciSerie(intervallo.da, intervallo.a, intervallo.rataGiorno);
  disegna(serie);
  aggiornaRiepilogo(serie);

  chart.setDatasetVisibility(0, mostraReale);
  chart.setDatasetVisibility(1, mostraStandard);
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

  $('btnTotale').addEventListener('click', () => { scope = 'totale'; aggiorna(); });
  $('btnMese').addEventListener('click', () => { scope = 'mese'; aggiorna(); });
  $('btnMesePrec').addEventListener('click', () => {
    meseVisualizzato.setMonth(meseVisualizzato.getMonth() - 1);
    aggiorna();
  });
  $('btnMeseSucc').addEventListener('click', () => {
    meseVisualizzato.setMonth(meseVisualizzato.getMonth() + 1);
    aggiorna();
  });
  $('btnReale').addEventListener('click', () => toggleDataset(0, $('btnReale')));
  $('btnStandard').addEventListener('click', () => toggleDataset(1, $('btnStandard')));

  aggiorna();
}

init();
