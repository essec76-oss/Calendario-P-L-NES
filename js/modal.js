// ========== MODALE: FORM, PREVIEW, AZIONI CRUD ==========
import { state } from './state.js';
import { fmt, fmtMedia, parseNum, uid, margineUnit, escapeHtml } from './utils.js';
import { COMMISSIONE_BASE, COMMISSIONE_STEP, MOLTIPLICATORE } from './config.js';
import { saveData, deletePosizioneRemota } from './storage.js';
import {
  residual, posAperteAll, apertureDelGiorno, chiusureDelGiorno,
  pmcRiferimento, puntiUscita, autoPlPos, autoPlMulti, calcRoi
} from './calc.js';
import { renderPmcHeader, render } from './calendar.js';
import { updateStats, updateTarget } from './dashboard.js';

// Nota: autoPlMulti è definita qui sotto (dipende dal fee del form); calc.js non la importa.

// ========== COMMISSIONI ==========
export function populateCommissioni() {
  ['chCommissioni', 'chCommissioniMulti'].forEach(id => {
    const sel = document.getElementById(id);
    sel.innerHTML = '';
    const opt0 = document.createElement('option');
    opt0.value = '0';
    opt0.textContent = '— Nessuna —';
    sel.appendChild(opt0);
    for (let k = 1; k <= COMMISSIONE_STEP; k++) {
      const v = Math.round(COMMISSIONE_BASE * k * 1000) / 1000;
      const opt = document.createElement('option');
      opt.value = String(v);
      opt.textContent = `${fmt(v)} € (0.605 × ${k})`;
      sel.appendChild(opt);
    }
    sel.value = '0';
  });
}

function commissioneSelez(id) {
  return parseFloat(document.getElementById(id).value) || 0;
}

// ========== APERTURA/CHIUSURA MODALE ==========
export function openModal(key) {
  state.selectedDate = key;
  const [y, m, d] = key.split('-');
  const dateObj = new Date(y, m - 1, d);
  const label = dateObj.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  document.getElementById('modalTitle').textContent = label.charAt(0).toUpperCase() + label.slice(1);

  setMode('apertura');
  setChMode('singola');
  resetForms();
  renderOpsList();
  document.getElementById('modal').classList.add('open');
}

export function closeModal() {
  document.getElementById('modal').classList.remove('open');
  state.selectedDate = null;
  render();
}

export function setMode(m) {
  state.mode = m;
  document.getElementById('formApertura').style.display = m === 'apertura' ? '' : 'none';
  document.getElementById('formChiusura').style.display = m === 'chiusura' ? '' : 'none';
  document.getElementById('toggleApertura').classList.toggle('active', m === 'apertura');
  document.getElementById('toggleChiusura').classList.toggle('active', m === 'chiusura');
}

export function setChMode(m) {
  state.chMode = m;
  document.getElementById('chSingola').style.display = m === 'singola' ? '' : 'none';
  document.getElementById('chMultipla').style.display = m === 'multipla' ? '' : 'none';
  document.getElementById('subSingola').classList.toggle('active', m === 'singola');
  document.getElementById('subMultipla').classList.toggle('active', m === 'multipla');
}

function resetForms() {
  document.getElementById('apTipologia').value = 'LONG';
  document.getElementById('apContratti').value = '1';
  document.getElementById('apStrike').value = '';
  document.getElementById('apNota').value = '';
  document.getElementById('chImporto').value = '';
  document.getElementById('chContratti').value = '1';
  document.getElementById('chStrike').value = '';
  document.getElementById('chStrikeMulti').value = '';
  document.getElementById('chImportoMulti').value = '';
  document.getElementById('previewApertura').classList.remove('visible');
  document.getElementById('previewChiusura').classList.remove('visible');
  document.getElementById('previewChiusuraMulti').classList.remove('visible');
  document.getElementById('chCommissioni').value = '0';
  document.getElementById('chCommissioniMulti').value = '0';
  state.singolaAuto = true;
  state.multiAuto = true;
  populatePosizioniChiusura();
}

// ========== ELENCO POSIZIONI CHIUDIBILI ==========
function populatePosizioniChiusura() {
  const sel = document.getElementById('chPosizione');
  const aperte = posAperteAll();
  sel.innerHTML = '';
  if (!aperte.length) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '— Nessuna posizione aperta —';
    sel.appendChild(opt);
    sel.disabled = true;
    renderPosCheckList();
    return;
  }
  sel.disabled = false;
  aperte.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    const dt = p.openKey.split('-').reverse().join('/');
    opt.textContent = `#${p.id} ${p.dir} · ${residual(p)}/${p.contratti} contr. residui · strike ${p.strike || '—'} · ap. ${dt}${p.nota ? ' · ' + p.nota : ''}`;
    sel.appendChild(opt);
  });
  const first = aperte[0];
  document.getElementById('chContratti').value = residual(first);
  document.getElementById('chStrike').value = first.strike || '';
  updatePreviewChiusura();
  renderPosCheckList();
}

function renderPosCheckList() {
  const box = document.getElementById('posCheckList');
  const aperte = posAperteAll();
  if (!aperte.length) {
    box.innerHTML = '<div class="empty">— Nessuna posizione aperta —</div>';
    return;
  }
  box.innerHTML = '';
  const header = document.createElement('div');
  header.className = 'pos-check-header';
  header.innerHTML = '<span></span><span></span><span class="h-info">Posizione</span><span class="h-ctr">Contratti</span>';
  box.appendChild(header);
  aperte.forEach(p => {
    const dt = p.openKey.split('-').reverse().join('/');
    const row = document.createElement('label');
    row.className = 'pos-check';
    row.innerHTML = `
      <input type="checkbox" data-id="${p.id}" checked />
      <span><span class="badge ${p.dir.toLowerCase()}">#${p.id} ${p.dir}</span></span>
      <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(p.strike || '')}${p.nota ? ' · ' + escapeHtml(p.nota) : ''} · ap. ${dt}</span>
      <input type="number" class="ctr-input" data-id="${p.id}" min="1" max="${residual(p)}" value="${residual(p)}" title="Contratti da chiudere (residuo ${residual(p)})" />
    `;
    const cb = row.querySelector('input[type="checkbox"]');
    const ctr = row.querySelector('.ctr-input');
    cb.addEventListener('change', () => {
      row.classList.toggle('selected', cb.checked);
      ctr.disabled = !cb.checked;
      updatePreviewMulti();
    });
    ctr.addEventListener('input', updatePreviewMulti);
    row.classList.add('selected');
    box.appendChild(row);
  });
  updatePreviewMulti();
}

function multiSelection() {
  const out = [];
  document.querySelectorAll('#posCheckList .pos-check').forEach(row => {
    const cb = row.querySelector('input[type="checkbox"]');
    if (!cb.checked) return;
    const pos = state.data.find(p => p.id == cb.dataset.id);
    if (!pos) return;
    let c = parseInt(row.querySelector('.ctr-input').value) || 1;
    c = Math.min(Math.max(1, c), residual(pos));
    out.push({ pos, contratti: c });
  });
  return out;
}

function getStrikeMulti() {
  return (document.getElementById('chStrikeMulti').value || '').trim();
}

// ========== P/L AUTOMATICO MULTIPLA ==========
// P/L automatico per ogni posizione selezionata (dal PMC della direzione, meno le commissioni)
function autoPlMulti(sel, uscita, fee) {
  return sel.map(x => {
    let pl = autoPlPos(x.pos, x.contratti, uscita);
    if (!isNaN(pl)) pl = Math.round((pl - fee) * 100) / 100;
    return { ...x, pl };
  });
}

// ========== PREVIEW ==========
export function updatePreviewApertura() {
  const dir = document.getElementById('apTipologia').value;
  const contratti = Math.max(1, parseInt(document.getElementById('apContratti').value) || 1);
  const el = document.getElementById('previewApertura');
  const marg = margineUnit(dir) * contratti;
  el.innerHTML = `${dir} · margine impegnato: <strong>${fmt(marg)} €</strong> · Nessun P/L all'apertura`;
  el.classList.add('visible');
}

export function updatePreviewChiusura() {
  const sel = document.getElementById('chPosizione');
  const el = document.getElementById('previewChiusura');
  const pos = state.data.find(p => p.id == sel.value);
  if (!pos) {
    el.classList.remove('visible');
    return;
  }
  const residuo = residual(pos);
  let contratti = parseInt(document.getElementById('chContratti').value) || 1;
  contratti = Math.min(Math.max(1, contratti), residuo);
  const uscita = parseNum(document.getElementById('chStrike').value);
  const info = pmcRiferimento(pos, state.selectedDate);

  // --- P/L automatico: punti dal PMC di riferimento x contratti x moltiplicatore - commissioni ---
  if (state.singolaAuto && !isNaN(uscita) && info) {
    const punti = puntiUscita(pos.dir, info.media, uscita);
    const fee = commissioneSelez('chCommissioni');
    const auto = Math.round((punti * contratti * MOLTIPLICATORE - fee) * 100) / 100;
    document.getElementById('chImporto').value = auto;
    const marg = margineUnit(pos.dir) * contratti;
    const roi = calcRoi(auto, marg);
    const primaChiusura = pos.chiusure.length === 0;
    // FIX: stringa con apostrofo — prima era ' (congelato all'inizio...)' → SyntaxError nell'originale
    el.innerHTML = `PMC ${pos.dir}${primaChiusura ? '' : " (congelato all'inizio delle chiusure)"}: <strong>${fmtMedia(info.media)}</strong> · uscita <strong>${fmtMedia(uscita)}</strong> · ${punti >= 0 ? '+' : ''}${fmtMedia(punti)} punti<br/>` +
      `${fmtMedia(punti)} × ${contratti} contr. × ${MOLTIPLICATORE}${fee ? ` − ${fmt(fee)} comm.` : ''} = <strong style="color:${auto>=0?'#22c55e':'#ef4444'}">${auto>=0?'+':''}${fmt(auto)}</strong> · ROI ${roi>=0?'+':''}${fmt(roi)}%`;
    el.classList.add('visible');
    return;
  }

  // --- P/L manuale (già inserito o PMC non disponibile) ---
  const pl = parseFloat(document.getElementById('chImporto').value);
  if (isNaN(pl)) {
    el.classList.remove('visible');
    return;
  }
  const marg = margineUnit(pos.dir) * contratti;
  const roi = calcRoi(pl, marg);
  el.innerHTML = `Margine della tranche chiusa: <strong>${fmt(marg)} €</strong> · ROI: <strong style="color:${roi>=0?'#22c55e':'#ef4444'}">${roi>=0?'+':''}${fmt(roi)}%</strong>` +
    (info ? `<br/><span style="font-size:0.75rem;color:var(--muted)">PMC ${pos.dir}: ${fmtMedia(info.media)} — modifica lo strike di uscita per ricalcolare in automatico</span>` : '');
  el.classList.add('visible');
}

export function updatePreviewMulti() {
  const el = document.getElementById('previewChiusuraMulti');
  const sel = multiSelection();
  if (!sel.length) {
    el.classList.remove('visible');
    return;
  }
  const uscita = parseNum(getStrikeMulti());

  // --- P/L automatico: ricalcolo per ogni posizione rispetto al PMC ---
  if (state.multiAuto && !isNaN(uscita)) {
    const fee = commissioneSelez('chCommissioniMulti');
    const conPl = autoPlMulti(sel, uscita, fee);
    if (conPl.every(x => !isNaN(x.pl))) {
      const tot = conPl.reduce((s, x) => s + x.pl, 0);
      const totCtr = conPl.reduce((s, x) => s + x.contratti, 0);
      const totMarg = conPl.reduce((s, x) => s + margineUnit(x.pos.dir) * x.contratti, 0);
      const roi = calcRoi(tot, totMarg);
      document.getElementById('chImportoMulti').value = Math.round(tot * 100) / 100;
      const dettaglio = conPl.map(x => {
        const info = pmcRiferimento(x.pos, state.selectedDate);
        const punti = puntiUscita(x.pos.dir, info.media, uscita);
        return `#${x.pos.id}: ${punti >= 0 ? '+' : ''}${fmtMedia(punti)} pt × ${x.contratti} × ${MOLTIPLICATORE}${fee ? ` − ${fmt(fee)} comm.` : ''} → <strong>${x.pl >= 0 ? '+' : ''}${fmt(x.pl)}</strong>`;
      }).join('<br/>');
      el.innerHTML = `Uscita <strong>${fmtMedia(uscita)}</strong> · <strong>${totCtr} contr.</strong> · margine ${fmt(totMarg)} € · P/L tot <strong style="color:${tot>=0?'#22c55e':'#ef4444'}">${tot>=0?'+':''}${fmt(tot)}</strong> · ROI ${roi>=0?'+':''}${fmt(roi)}%<br/><span style="font-size:0.75rem;color:var(--muted)">${dettaglio}</span>`;
      el.classList.add('visible');
      return;
    }
  }

  // --- Ripartizione manuale proporzionale ai contratti ---
  const pl = parseFloat(document.getElementById('chImportoMulti').value);
  if (isNaN(pl)) {
    el.classList.remove('visible');
    return;
  }
  const totCtr = sel.reduce((s, x) => s + x.contratti, 0);
  const totMarg = sel.reduce((s, x) => s + margineUnit(x.pos.dir) * x.contratti, 0);
  const roi = calcRoi(pl, totMarg);
  const dettaglio = sel.map(x => {
    const quota = totCtr > 0 ? pl * (x.contratti / totCtr) : 0;
    return `#${x.pos.id}: ${x.contratti} ctr → ${quota >= 0 ? '+' : ''}${fmt(quota)} €`;
  }).join(' · ');
  const stk = getStrikeMulti();
  el.innerHTML = `${stk ? `Strike: <strong>${escapeHtml(stk)}</strong> · ` : ''}<strong>${totCtr} contr.</strong> · margine ${fmt(totMarg)} € · ROI <strong style="color:${roi>=0?'#22c55e':'#ef4444'}">${roi>=0?'+':''}${fmt(roi)}%</strong><br/><span style="font-size:0.75rem;color:var(--muted)">${dettaglio}</span>`;
  el.classList.add('visible');
}

// ========== ELENCO OPERAZIONI DEL GIORNO ==========
export function renderOpsList() {
  const list = document.getElementById('opsList');
  const aps = apertureDelGiorno(state.selectedDate);
  const chs = chiusureDelGiorno(state.selectedDate);

  if (!aps.length && !chs.length) {
    list.innerHTML = '<div class="empty">Nessuna operazione ancora</div>';
    return;
  }

  let html = '';
  if (aps.length) {
    html += '<div class="section-title">Aperture di questo giorno</div>';
    html += aps.map(p => {
      const marg = margineUnit(p.dir) * p.contratti;
      const res = residual(p);
      const chiuseTxt = p.contratti - res > 0 ? ` · già chiuse ${p.contratti - res}/${p.contratti}` : '';
      return `
        <div class="op-item">
          <div class="info">
            <div class="amount ${p.dir.toLowerCase()}">▲ Apertura <span class="badge ${p.dir.toLowerCase()}">${p.dir}</span></div>
            <div class="meta">
              <span>${p.contratti} contr.</span>
              ${p.strike ? `<span>Strike: ${escapeHtml(p.strike)}</span>` : ''}
              <span>Margine: ${fmt(marg)} €</span>
              <span>Residuo: ${res} contr.${chiuseTxt}</span>
            </div>
            ${p.nota ? `<div class="note">${escapeHtml(p.nota)}</div>` : ''}
          </div>
          <button class="btn-sm danger" onclick="deletePosizione(${p.id})">Elimina</button>
        </div>`;
    }).join('');
  }

  if (chs.length) {
    html += '<div class="section-title">Chiusure di questo giorno</div>';
    html += chs.map(x => {
      const marg = margineUnit(x.pos.dir) * x.c.contratti;
      const roi = calcRoi(x.c.pl, marg);
      return `
        <div class="op-item">
          <div class="info">
            <div class="amount ${x.pos.dir.toLowerCase()}">${x.c.pl >= 0 ? '+' : ''}${fmt(x.c.pl)} € <span class="badge ${x.pos.dir.toLowerCase()}">#${x.pos.id} ${x.pos.dir}</span></div>
            <div class="meta">
              <span>▼ Chiusura</span>
              <span>${x.c.contratti} contr. (su ${x.pos.contratti})</span>
              <span>Margine: ${fmt(marg)} €</span>
              ${(x.c.strike || x.pos.strike) ? `<span>Strike ch.: ${escapeHtml(x.c.strike || x.pos.strike)}</span>` : ''}
            </div>
            <div class="roi ${roi >= 0 ? 'pos' : 'neg'}">% sul margine: ${roi >= 0 ? '+' : ''}${fmt(roi)}%</div>
          </div>
          <button class="btn-sm danger" onclick="deleteChiusura(${x.pos.id}, ${x.i})">Elimina</button>
        </div>`;
    }).join('');
  }
  list.innerHTML = html;
}

// ========== AZIONI CRUD ==========
export function addApertura() {
  const dir = document.getElementById('apTipologia').value;
  const contratti = Math.max(1, parseInt(document.getElementById('apContratti').value) || 1);
  const strike = document.getElementById('apStrike').value.trim();
  const nota = document.getElementById('apNota').value.trim();
  state.data.push({
    id: uid(),
    dir,
    strike,
    contratti,
    openKey: state.selectedDate,
    nota,
    chiusure: []
  });
  saveData();
  document.getElementById('apContratti').value = '1';
  document.getElementById('apStrike').value = '';
  document.getElementById('apNota').value = '';
  renderOpsList();
  populatePosizioniChiusura();
}

export function addChiusura() {
  const sel = document.getElementById('chPosizione');
  const pos = state.data.find(p => p.id == sel.value);
  if (!pos) return;
  const pl = parseFloat(document.getElementById('chImporto').value);
  if (isNaN(pl)) {
    document.getElementById('chImporto').focus();
    return;
  }
  const residuo = residual(pos);
  let contratti = parseInt(document.getElementById('chContratti').value) || 1;
  if (contratti < 1) contratti = 1;
  if (contratti > residuo) contratti = residuo;
  const strike = (document.getElementById('chStrike').value || '').trim();
  pos.chiusure.push({ key: state.selectedDate, contratti, pl, strike });
  saveData();
  document.getElementById('chImporto').value = '';
  document.getElementById('chContratti').value = '1';
  renderOpsList();
  populatePosizioniChiusura();
}

export function addChiusuraMulti() {
  const sel = multiSelection();
  if (!sel.length) return;
  const uscita = parseNum(getStrikeMulti());
  const stk = getStrikeMulti();

  // --- P/L automatico per posizione (se disponibile) ---
  if (state.multiAuto && !isNaN(uscita)) {
    const fee = commissioneSelez('chCommissioniMulti');
    const conPl = autoPlMulti(sel, uscita, fee);
    if (conPl.every(x => !isNaN(x.pl))) {
      conPl.forEach(x => {
        x.pos.chiusure.push({ key: state.selectedDate, contratti: x.contratti, pl: x.pl, strike: stk });
      });
      saveData();
      document.getElementById('chImportoMulti').value = '';
      renderOpsList();
      renderPosCheckList();
      populatePosizioniChiusura();
      return;
    }
  }

  const pl = parseFloat(document.getElementById('chImportoMulti').value);
  if (isNaN(pl)) {
    document.getElementById('chImportoMulti').focus();
    return;
  }
  const totCtr = sel.reduce((s, x) => s + x.contratti, 0);
  sel.forEach(x => {
    const quota = pl * (x.contratti / totCtr);
    x.pos.chiusure.push({ key: state.selectedDate, contratti: x.contratti, pl: quota, strike: stk });
  });
  saveData();
  document.getElementById('chImportoMulti').value = '';
  renderOpsList();
  renderPosCheckList();
  populatePosizioniChiusura();
}

export function deletePosizione(id) {
  const pos = state.data.find(p => p.id === id);
  if (!pos) return;
  const msg = pos.chiusure.length
    ? 'Questa posizione ha già delle chiusure registrate: eliminandola spariranno anche i P/L correlati. Continuare?'
    : 'Eliminare questa apertura?';
  if (!confirm(msg)) return;
  state.data = state.data.filter(p => p.id !== id);
  deletePosizioneRemota(id);
  renderPmcHeader();
  renderOpsList();
  populatePosizioniChiusura();
}

export function deleteChiusura(posId, index) {
  const pos = state.data.find(p => p.id === posId);
  if (!pos) return;
  pos.chiusure.splice(index, 1);
  saveData();
  renderOpsList();
  populatePosizioniChiusura();
}
