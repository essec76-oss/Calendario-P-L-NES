// ========== PERSISTENZA (Neon tramite /api/data) ==========
// SOSTITUIRE in js/storage.js tutto il blocco dalla prima riga fino alla fine
// della funzione deletePosizioneRemota. NON toccare importaDaLocalStorage.
import { LS_KEY } from './config.js';
import { state } from './state.js';
import { getCapitale, getTargetPct } from './utils.js';

// Evento emesso dopo ogni salvataggio: main.js aggancia qui i re-render.
export const SAVED_EVENT = 'app:data-saved';

// Mantenuta con lo stesso nome perché main.js la importa.
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
  if (state.useLocalFallback || !state.supabaseClient) return;
  const { error } = await state.supabaseClient.from('posizioni').delete().eq('id', id);
  if (error) console.error('Errore eliminazione:', error);
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
  if (!confirm(`Importare ${daImportare.length} posizioni su Supabase?`)) return;

  if (parsed.capitale) document.getElementById('capitale').value = parsed.capitale;
  if (parsed.targetPct) document.getElementById('targetPct').value = parsed.targetPct;

  // unisce con i dati già presenti, evitando duplicati
  const idEsistenti = new Set(state.data.map(p => p.id));
  state.data = [...state.data, ...daImportare.filter(p => !idEsistenti.has(p.id))];

  await saveData();
  render();
  alert('Importazione completata. Controlla i dati, poi puoi eliminare il backup locale se vuoi.');
}
