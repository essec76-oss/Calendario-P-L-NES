// Vercel Serverless Function: /api/data
// Legge e scrive posizioni e impostazioni su Neon.
// La variabile d'ambiente DATABASE_URL viene impostata su Vercel (mai nel codice).
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const imp = await sql`select capitale, target_pct from impostazioni where id = 1`;
      const pos = await sql`
        select id, dir, strike, contratti, open_key::text as open_key, nota, chiusure
        from posizioni`;
      return res.status(200).json({
        impostazioni: imp[0] || null,
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
      const { capitale, target_pct, posizioni = [] } = req.body || {};

      const queries = [
        sql`insert into impostazioni (id, capitale, target_pct)
            values (1, ${capitale}, ${target_pct})
            on conflict (id) do update
            set capitale = excluded.capitale, target_pct = excluded.target_pct`
      ];

      for (const p of posizioni) {
        queries.push(sql`
          insert into posizioni (id, dir, strike, contratti, open_key, nota, chiusure)
          values (${p.id}, ${p.dir}, ${p.strike}, ${p.contratti}, ${p.openKey},
                  ${p.nota}, ${JSON.stringify(p.chiusure || [])}::jsonb)
          on conflict (id) do update
          set dir = excluded.dir, strike = excluded.strike, contratti = excluded.contratti,
              open_key = excluded.open_key, nota = excluded.nota, chiusure = excluded.chiusure`);
      }

      await sql.transaction(queries);
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
