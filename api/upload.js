const supabase = require('../lib/supabase');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { rows } = req.body;
        if (!rows || !Array.isArray(rows) || rows.length === 0) {
            return res.status(400).json({ error: 'rows array is required' });
        }

        const toInsert = rows
            .map((r) => ({
                excel_row_id: r.id || r.ID || r.excel_row_id || null,
                english_text: r.english_text || r.english || r.English || r.ENGLISH || '',
                khasi_text: r.khasi_text || r.khasi || r.Khasi || r.KHASI || ''
            }))
            .filter((r) => r.khasi_text.trim() && r.english_text.trim());

        if (toInsert.length === 0) return res.status(400).json({ error: 'No valid rows found' });

        const BATCH = 500;
        let inserted = 0;
        for (let i = 0; i < toInsert.length; i += BATCH) {
            const chunk = toInsert.slice(i, i + BATCH);
            const { error } = await supabase.from('sentences').insert(chunk);
            if (error) throw error;
            inserted += chunk.length;
        }

        res.json({ ok: true, inserted });
    } catch (err) {
        console.error('Upload error:', err);
        res.status(500).json({ error: err.message });
    }
};
