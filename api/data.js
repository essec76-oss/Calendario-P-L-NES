import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const imp = await sql`select capitale, target_pct from impostazioni where id = 1`;
      const mesi = await sql`select mese, capitale, target_pct from impostazioni_mese`;
      const sett = await sql`select settimana, capitale from capitale_settimana`;
      const pos = await sql`
        select id, dir, strike, contratti, open_key::text as open_key, nota, chiusure
        from posizioni`;
      return res.status(200).json({
        impostazioni: imp[0] ? { capitale: Number(imp[0].capitale), target_pct: Number(imp[0].target_pct) } : null,
        mesi: mesi.map(r => ({ mese: r.mese, capitale: Number(r.capitale), target_pct: Number(r.target_pct) })),
        settimane: sett.map(r => ({ settimana: r.settimana, capitale: Number(r.capitale) })),
        posizioni: pos.map(p => ({
          id: Number(p.id),
          dir: p.dir,
          strike: p.strike || '',
          contratti: p.contratti,
          openKey: p.open_key,
          nota: p.nota || '',
          chiusure: p.chiusure || []
        }))
      });
    }

    if (req.method === 'POST') {
      const { posizioni = [], mesi = [], settimane = [] } = req.body || {};
      const queries = [];

      for (const m of mesi) {
        queries.push(sql`
          insert into impostazioni_mese (mese, capitale, target_pct)
          values (${m.mese}, ${m.capitale}, ${m.target_pct})
          on conflict (mese) do update
          set capitale = excluded.capitale, target_pct = excluded.target_pct`);
      }

      // capitale null = settimana svuotata: si cancella la riga
      for (const s of settimane) {
        if (s.capitale == null) {
          queries.push(sql`delete from capitale_settimana where settimana = ${s.settimana}`);
        } else {
          queries.push(sql`
            insert into capitale_settimana (settimana, capitale)
            values (${s.settimana}, ${s.capitale})
            on conflict (settimana) do update
            set capitale = excluded.capitale`);
        }
      }

      for (const p of posizioni) {
        queries.push(sql`
          insert into posizioni (id, dir, strike, contratti, open_key, nota, chiusure)
          values (${p.id}, ${p.dir}, ${p.strike}, ${p.contratti}, ${p.openKey},
                  ${p.nota}, ${JSON.stringify(p.chiusure || [])}::jsonb)
          on conflict (id) do update
          set dir = excluded.dir, strike = excluded.strike, contratti = excluded.contratti,
              open_key = excluded.open_key, nota = excluded.nota, chiusure = excluded.chiusure`);
      }

      if (queries.length) await sql.transaction(queries);
      return res.status(200).json({ ok: true });
    }

    if (req.method === 'DELETE') {
      const id = Number(req.query.id);
      if (!Number.isFinite(id)) return res.status(400).json({ error: 'id non valido' });
      await sql`delete from posizioni where id = ${id}`;
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ error: 'Metodo non consentito' });
  } catch (err) {
    console.error('api/data:', err);
    return res.status(500).json({ error: 'Errore database' });
  }
}
