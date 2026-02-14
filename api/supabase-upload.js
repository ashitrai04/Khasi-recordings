/*
Vercel serverless function: /api/supabase-upload

This endpoint expects a JSON POST with fields:
  - filename: original file name
  - data: base64-encoded file bytes (xlsx or csv)

It will decode and parse the file (XLSX or CSV) and insert rows into the
Supabase `sentences` table using the SUPABASE_SERVICE_ROLE environment variable.

Environment variables (set these in Vercel project settings):
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE

Notes:
- This function uses the service_role key and must NOT be exposed publicly
  without authentication. For a simple setup, protect this endpoint with
  Vercel Basic Auth or only use it from an admin area.
*/

const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // Basic header-based auth to protect this endpoint. Set ADMIN_UPLOAD_PASSWORD in Vercel env.
    const ADMIN_PASS = process.env.ADMIN_UPLOAD_PASSWORD || process.env.ADMIN_PASSWORD || null;
    if (ADMIN_PASS) {
      const provided = req.headers['x-admin-password'] || req.body.admin_password || null;
      if (!provided || provided !== ADMIN_PASS) return res.status(401).json({ error: 'Unauthorized - invalid admin password' });
    }

    const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
      console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE');
      return res.status(500).json({ error: 'Missing Supabase env vars' });
    }

    const { filename, data } = req.body;
    if (!filename || !data) return res.status(400).json({ error: 'filename and data(base64) required' });

    const buf = Buffer.from(data, 'base64');

    // parse workbook
    let workbook;
    try { workbook = XLSX.read(buf, { type: 'buffer' }); } catch (e) { console.error('XLSX parse error', e); return res.status(400).json({ error: 'Failed to parse workbook', details: e.message }); }
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    // prepare supabase client with service role
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });

    // map rows to objects for insertion. Use 'id' only if numeric.
    const toInsert = rows.map(r => {
      const english = r.english_text || r.english || r.English || '';
      const khasi = r.khasi_text || r.khasi || r.Khasi || '';
      const idVal = r.id || r.ID || r.Id || null;
      const obj = { english_text: english, khasi_text: khasi };
      if (idVal !== null && idVal !== undefined && String(idVal).trim() !== '') {
        const n = Number(idVal);
        if (!Number.isNaN(n)) obj.id = n;
      }
      return obj;
    }).filter(o => o.khasi_text && o.khasi_text.trim() !== '');

    if (toInsert.length === 0) return res.json({ ok: true, inserted: 0, message: 'No valid rows found' });

    // insert in chunks to avoid very large single inserts
    const chunkSize = 500;
    let inserted = 0;
    for (let i = 0; i < toInsert.length; i += chunkSize) {
      const chunk = toInsert.slice(i, i + chunkSize);
      // use upsert on id if present to avoid duplicate primary key errors
      const { error } = await supabase.from('sentences').upsert(chunk, { onConflict: ['id'] });
      if (error) {
        console.error('Supabase upsert error', error);
        return res.status(500).json({ error: 'Supabase upsert failed', details: error.message || error });
      }
      inserted += chunk.length;
    }

    return res.json({ ok: true, inserted });
  } catch (err) {
    console.error('Unhandled error in supabase-upload', err);
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
};
