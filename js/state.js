// ========== STATO CONDIVISO ==========
// Unico oggetto mutabile condiviso tra i moduli (al posto delle variabili globali).

export const state = {
  data: [],            // [{id, dir, strike, contratti, openKey, nota, chiusure:[{key, contratti, pl, strike}]}]
  current: (() => { const d = new Date(); d.setDate(1); return d; })(),
  selectedDate: null,
  mode: 'apertura',    // 'apertura' | 'chiusura'
  chMode: 'singola',   // 'singola' | 'multipla'
  singolaAuto: true,   // P/L singola calcolato automaticamente
  multiAuto: true,     // P/L multipla calcolato automaticamente
  wsScope: 'mese',     // 'mese' | 'totale' (scope statistiche Wilson)
  impostazioniMese: {},   // { 'YYYY-MM': { capitale, target_pct } }
  capitaleSettimana: {},  // { 'YYYY-Www': number | null }  supabaseClient: null,
  useLocalFallback: false,
};
