// ========== PERSISTENZA (Supabase + fallback localStorage) ==========
import { SUPABASE_URL, SUPABASE_KEY, LS_KEY, LS_KEY_V3 } from './config.js';
import { state } from './state.js';
import { getCapitale, getTargetPct } from './utils.js';

// Evento emesso dopo ogni salvataggio: main.js aggancia qui i re-render (evita dipendenze circolari storage → UI).
export const SAVED_EVENT = 'app:data-saved';

export async function initSupabase() {
  try {
    if (window.supabase && window.supabase.createClient) {
      state.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    }
  } catch (e) {
    console.error('Supabase non disponibile:', e);
  }
  if (!state.supabaseClient) state.useLocalFallback = true;
}

export async function loadData() {
  if (state.useLocalFallback || !state.supabaseClient) {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.capitale != null) document.getElementById('capitale').value = parsed.capitale;
        if (parsed.target_pct != null) document.getElementById('targetPct').value = parsed.target_pct;
        return parsed.posizioni || [];
      }
    } catch (e) {}
    return [];
  }
  const { data: pos, error: e1 } = await state.supabaseClient.from('posizioni').select('*');
  const { data: imp, error: e2 } = await state.supabaseClient.from('impostazioni').select('*').eq('id', 1).maybeSingle();
  if (e1 || e2) {
    console.error('Errore caricamento:', e1 || e2);
    return [];
  }
  if (imp) {
    document.getElementById('capitale').value = imp.capitale;
    document.getElementById('targetPct').value = imp.target_pct;
  }
  return (pos || []).map(p => ({
    id: Number(p.id),
    dir: p.dir,
    strike: p.strike || '',
    contratti: p.contratti,
    openKey: p.open_key,
    nota: p.nota || '',
    chiusure: p.chiusure || []
  }));
}

export async function saveData() {
  const capitale = getCapitale();
  const targetPct = parseFloat(document.getElementById('targetPct').value) || 4;

  if (state.useLocalFallback || !state.supabaseClient) {
    try { localStorage.setItem(LS_KEY, JSON.stringify({ capitale, target_pct: targetPct, posizioni: state.data })); } catch (e) {}
    document.dispatchEvent(new CustomEvent(SAVED_EVENT));
    return;
  }

  const { error: e1 } = await state.supabaseClient.from('impostazioni').upsert({ id: 1, capitale, target_pct: targetPct });
  if (e1) console.error('Errore salvataggio impostazioni:', e1);

  if (state.data.length) {
    const righe = state.data.map(p => ({
      id: p.id,
      dir: p.dir,
      strike: p.strike,
      contratti: p.contratti,
      open_key: p.openKey,
      nota: p.nota,
      chiusure: p.chiusure
    }));
    const { error: e2 } = await state.supabaseClient.from('posizioni').upsert(righe);
    if (e2) console.error('Errore salvataggio posizioni:', e2);
  }
  document.dispatchEvent(new CustomEvent(SAVED_EVENT));
}

export async function deletePosizioneRemota(id) {
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
