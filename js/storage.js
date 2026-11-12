import { LS_KEY_V3 } from './config.js';
import { state } from './state.js';
import { meseKey } from './utils.js';

export const SAVED_EVENT = 'app:data-saved';

export async function initSupabase() {
  state.useLocalFallback = false;
}

export async function loadData() {
  const res = await fetch('/api/data');
  if (!res.ok) {
    console.error('Errore caricamento:', res.status);
    return [];
  }
  const { impostazioni, mesi = [], settimane = [], posizioni } = await res.json();

  state.impostazioniMese = {};
  mesi.forEach(r => {
    state.impostazioniMese[r.mese] = { capitale: r.capitale, target_pct: r.target_pct };
  });
  // migrazione: la vecchia riga globale diventa il mese corrente, se non ci sono ancora mesi
  if (!mesi.length && impostazioni) {
    state.impostazioniMese[meseKey()] = { capitale: impostazioni.capitale, target_pct: impostazioni.target_pct };
  }

  state.capitaleSettimana = {};
  settimane.forEach(r => { state.capitaleSettimana[r.settimana] = r.capitale; });

  return posizioni || [];
}

export async function saveData() {
  const mesi = Object.entries(state.impostazioniMese).map(([mese, v]) => ({
    mese, capitale: v.capitale, target_pct: v.target_pct
  }));
  const settimane = Object.entries(state.capitaleSettimana).map(([settimana, capitale]) => ({
    settimana, capitale
  }));

  try {
    const res = await fetch('/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mesi, settimane, posizioni: state.data })
    });
    if (!res.ok) console.error('Errore salvataggio:', res.status);
  } catch (e) {
    console.error('Errore salvataggio:', e);
  }
  document.dispatchEvent(new CustomEvent(SAVED_EVENT));
}

export async function deletePosizioneRemota(id) {
  const res = await fetch(`/api/data?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok) console.error('Errore eliminazione:', res.status);
}

// ========== IMPORTAZIONE UNA TANTUM (dal vecchio localStorage v3) ==========
export async function importaDaLocalStorage(render) {
  const raw = localStorage.getItem(LS_KEY_V3);
  if (!raw) {
    alert('Nessun dato trovato in questo browser.');
    return;
  }
  const parsed = JSON.parse(raw);
  const daImportare = parsed.posizioni || [];
  if (!daImportare.length) {
    alert('Nessuna posizione da importare.');
    return;
  }
  if (!confirm(`Importare ${daImportare.length} posizioni nel database?`)) return;

  if (parsed.capitale) {
    state.impostazioniMese[meseKey()] = {
      capitale: parsed.capitale,
      target_pct: parsed.targetPct || 4
    };
  }

  const idEsistenti = new Set(state.data.map(p => p.id));
  state.data = [...state.data, ...daImportare.filter(p => !idEsistenti.has(p.id))];

  await saveData();
  render();
  alert('Importazione completata. Controlla i dati, poi puoi eliminare il backup locale se vuoi.');
}
