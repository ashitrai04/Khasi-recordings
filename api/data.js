const supabase = require('../lib/supabase');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method === 'PATCH') return handleUpdate(req, res);
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { page = '1', limit = '50' } = req.query;
        const p = Math.max(1, parseInt(page));
        const lim = Math.min(100, Math.max(1, parseInt(limit)));
        const from = (p - 1) * lim;
        const to = from + lim - 1;

        // Unified: sentences with their latest recording info
        const { data, error, count } = await supabase
            .from('sentences')
            .select('*', { count: 'exact' })
            .order('id', { ascending: true })
            .range(from, to);
        if (error) throw error;

        // Fetch recordings for these sentence IDs
        const ids = (data || []).map(s => s.id);
        let recMap = {};
        if (ids.length > 0) {
            const { data: recs } = await supabase
                .from('recordings')
                .select('sentence_id, speaker_id, audio_path, duration_seconds, created_at, contributor_id, contributors(name, gender, age, location)')
                .in('sentence_id', ids)
                .order('created_at', { ascending: false });

            // Group by sentence_id (latest first)
            (recs || []).forEach(r => {
                if (!recMap[r.sentence_id]) recMap[r.sentence_id] = [];
                recMap[r.sentence_id].push({
                    speaker_id: r.speaker_id,
                    audio_path: r.audio_path,
                    duration_seconds: r.duration_seconds,
                    recorded_at: r.created_at,
                    contributor_name: r.contributors?.name || r.speaker_id,
                    contributor_gender: r.contributors?.gender || '',
                    contributor_age: r.contributors?.age || '',
                    contributor_location: r.contributors?.location || ''
                });
            });
        }

        const rows = (data || []).map(s => ({
            ...s,
            recordings: recMap[s.id] || []
        }));

        res.json({ rows, total: count || 0, page: p, limit: lim });
    } catch (err) {
        console.error('Data error:', err);
        res.status(500).json({ error: err.message });
    }
};

async function handleUpdate(req, res) {
    try {
        const { table, id, updates } = req.body;
        if (!table || !id || !updates) return res.status(400).json({ error: 'table, id, updates required' });
        const allowed = ['sentences', 'recordings', 'contributors'];
        if (!allowed.includes(table)) return res.status(400).json({ error: 'Invalid table' });
        const { error } = await supabase.from(table).update(updates).eq('id', id);
        if (error) throw error;
        res.json({ ok: true });
    } catch (err) {
        console.error('Update error:', err);
        res.status(500).json({ error: err.message });
    }
}
