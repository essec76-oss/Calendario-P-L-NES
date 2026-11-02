// ========== CONFIGURAZIONE ==========


// localStorage fallback
export const LS_KEY = 'calendario-profitti-remote-fallback';
export const LS_KEY_V3 = 'calendario-profitti-v3'; // per l'importazione una tantum

// Margini (€ per contratto)
export const MARGINE_LONG = 350;
export const MARGINE_SHORT = 270;

// Moltiplicatore fisso (usato nei calcoli P/L, non visibile all'utente)
export const MOLTIPLICATORE = 0.5;

// Commissioni
export const COMMISSIONE_BASE = 0.605;
export const COMMISSIONE_STEP = 20;
