const supabase = require('../lib/supabase');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method === 'PATCH') return handleUpdate(req, res);
    if (req.method === 'DELETE') return handleDelete(req, res);
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { page = '1', limit = '50', speaker, recorded, sort = 'recorded_first' } = req.query;
        const p = Math.max(1, parseInt(page));
        const lim = Math.min(100, Math.max(1, parseInt(limit)));
        const from = (p - 1) * lim;
        const to = from + lim - 1;

        // Base query
        let query = supabase.from('sentences').select('*', { count: 'exact' });

        // Sort: recorded_first puts has_recording=true first, then by id
        if (sort === 'recorded_first') {
            query = query.order('has_recording', { ascending: false }).order('id', { ascending: true });
        } else if (sort === 'id_asc') {
            query = query.order('id', { ascending: true });
        } else if (sort === 'id_desc') {
            query = query.order('id', { ascending: false });
        }

        // Filter: only recorded or only unrecorded
        if (recorded === 'yes') query = query.eq('has_recording', true);
        else if (recorded === 'no') query = query.eq('has_recording', false);

        query = query.range(from, to);
        const { data, error, count } = await query;
        if (error) throw error;

        // Fetch recordings for these sentence IDs
        const ids = (data || []).map(s => s.id);
        let recMap = {};
        if (ids.length > 0) {
            let recQuery = supabase
                .from('recordings')
                .select('id, sentence_id, speaker_id, audio_path, duration_seconds, created_at, contributor_id')
                .in('sentence_id', ids)
                .order('created_at', { ascending: false });

            // Filter by speaker name
            if (speaker && speaker.trim()) {
                recQuery = recQuery.ilike('speaker_id', '%' + speaker.trim() + '%');
            }

            const { data: recs } = await recQuery;

            // Try to get contributor info (may fail if table doesn't exist)
            let contribMap = {};
            try {
                const contribIds = [...new Set((recs || []).map(r => r.contributor_id).filter(Boolean))];
                if (contribIds.length > 0) {
                    const { data: contribs } = await supabase
                        .from('contributors')
                        .select('id, name, gender, age, location')
                        .in('id', contribIds);
                    (contribs || []).forEach(c => { contribMap[c.id] = c });
                }
            } catch (e) { /* contributors table may not exist */ }

            (recs || []).forEach(r => {
                if (!recMap[r.sentence_id]) recMap[r.sentence_id] = [];
                const c = contribMap[r.contributor_id] || {};
                recMap[r.sentence_id].push({
                    rec_id: r.id,
                    speaker_id: r.speaker_id,
                    audio_path: r.audio_path,
                    duration_seconds: r.duration_seconds,
                    recorded_at: r.created_at,
                    contributor_name: c.name || r.speaker_id,
                    contributor_gender: c.gender || '',
                    contributor_age: c.age || '',
                    contributor_location: c.location || ''
                });
            });
        }

        // If filtering by speaker, only return sentences that have matching recordings
        let rows = (data || []).map(s => ({
            ...s,
            recordings: recMap[s.id] || []
        }));

        if (speaker && speaker.trim()) {
            rows = rows.filter(r => r.recordings.length > 0);
        }

        // Get unique speakers for filter dropdown
        let speakers = [];
        try {
            const { data: sp } = await supabase.from('recordings').select('speaker_id');
            speakers = [...new Set((sp || []).map(s => s.speaker_id))].sort();
        } catch (e) { }

        res.json({ rows, total: count || 0, page: p, limit: lim, speakers });
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

async function handleDelete(req, res) {
    try {
        const { ids } = req.body;
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'ids array required' });
        }
        await supabase.from('recordings').delete().in('sentence_id', ids);
        const { error } = await supabase.from('sentences').delete().in('id', ids);
        if (error) throw error;
        res.json({ ok: true, deleted: ids.length });
    } catch (err) {
        console.error('Delete error:', err);
        res.status(500).json({ error: err.message });
    }
}
