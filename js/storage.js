// ========== PERSISTENZA (Neon tramite /api/data) ==========
import { LS_KEY_V3 } from './config.js';
import { state } from './state.js';
import { getCapitale } from './utils.js';

// Evento emesso dopo ogni salvataggio: main.js aggancia qui i re-render.
export const SAVED_EVENT = 'app:data-saved';

// Nome mantenuto perché main.js lo importa. Non usa più Supabase.
export async function initSupabase() {
  state.useLocalFallback = false;
}

export async function loadData() {
  const res = await fetch('/api/data');
  if (!res.ok) {
    console.error('Errore caricamento:', res.status);
    return [];
  }
  const { impostazioni, posizioni } = await res.json();
  if (impostazioni) {
    document.getElementById('capitale').value = impostazioni.capitale;
    document.getElementById('targetPct').value = impostazioni.target_pct;
  }
  return posizioni || [];
}

export async function saveData() {
  const capitale = getCapitale();
  const targetPct = parseFloat(document.getElementById('targetPct').value) || 4;

  try {
    const res = await fetch('/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        capitale,
        target_pct: targetPct,
        posizioni: state.data
      })
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

  if (parsed.capitale) document.getElementById('capitale').value = parsed.capitale;
  if (parsed.targetPct) document.getElementById('targetPct').value = parsed.targetPct;

  // unisce con i dati già presenti, evitando duplicati
  const idEsistenti = new Set(state.data.map(p => p.id));
  state.data = [...state.data, ...daImportare.filter(p => !idEsistenti.has(p.id))];

  await saveData();
  render();
  alert('Importazione completata. Controlla i dati, poi puoi eliminare il backup locale se vuoi.');
}
