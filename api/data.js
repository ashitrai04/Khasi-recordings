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
        const { page = '1', limit = '50', speaker, recorded, sort = 'id_asc' } = req.query;
        const p = Math.max(1, parseInt(page));
        const lim = Math.min(100, Math.max(1, parseInt(limit)));
        const from = (p - 1) * lim;
        const to = from + lim - 1;

        let data = [], count = 0, recMap = {};

        if (speaker && speaker.trim()) {
            // ── SPEAKER FILTER: Start from recordings table ──
            // 1. Get ALL sentence_ids for this speaker (paginate past 1000 limit)
            const speakerSentenceIds = new Set();
            let rOffset = 0;
            const rPage = 1000;
            let rMore = true;
            while (rMore) {
                const { data: recs } = await supabase
                    .from('recordings')
                    .select('sentence_id')
                    .ilike('speaker_id', '%' + speaker.trim() + '%')
                    .range(rOffset, rOffset + rPage - 1);
                if (recs && recs.length > 0) {
                    recs.forEach(r => speakerSentenceIds.add(r.sentence_id));
                    rMore = recs.length === rPage;
                    rOffset += rPage;
                } else {
                    rMore = false;
                }
            }

            const allIds = [...speakerSentenceIds];
            count = allIds.length;

            if (allIds.length > 0) {
                // 2. Fetch the paginated subset of those sentences
                let sQuery = supabase.from('sentences').select('*').in('id', allIds);
                if (sort === 'id_desc') sQuery = sQuery.order('id', { ascending: false });
                else sQuery = sQuery.order('id', { ascending: true });
                if (recorded === 'yes') sQuery = sQuery.eq('has_recording', true);
                else if (recorded === 'no') sQuery = sQuery.or('has_recording.eq.false,has_recording.is.null');
                const { data: sData, error: sErr } = await sQuery.range(from, to);
                if (sErr) throw sErr;
                data = sData || [];

                // 3. Fetch recordings for displayed sentences
                if (data.length > 0) {
                    const displayIds = data.map(s => s.id);
                    const { data: recs } = await supabase
                        .from('recordings')
                        .select('id, sentence_id, speaker_id, audio_path, duration_seconds, created_at, speaker_gender, speaker_age, speaker_location')
                        .in('sentence_id', displayIds)
                        .ilike('speaker_id', '%' + speaker.trim() + '%')
                        .order('created_at', { ascending: false });
                    if (recs) {
                        recs.forEach(r => {
                            if (!recMap[r.sentence_id]) recMap[r.sentence_id] = [];
                            recMap[r.sentence_id].push({
                                rec_id: r.id, speaker_id: r.speaker_id,
                                audio_path: r.audio_path, duration_seconds: r.duration_seconds,
                                recorded_at: r.created_at, contributor_name: r.speaker_id,
                                contributor_gender: r.speaker_gender || '',
                                contributor_age: r.speaker_age || '',
                                contributor_location: r.speaker_location || ''
                            });
                        });
                    }
                }
            }
        } else {
            // ── NO SPEAKER FILTER: Normal query ──
            let query = supabase.from('sentences').select('*', { count: 'exact' });
            if (sort === 'recorded_first') {
                query = query.order('has_recording', { ascending: false }).order('id', { ascending: true });
            } else if (sort === 'id_desc') {
                query = query.order('id', { ascending: false });
            } else {
                query = query.order('id', { ascending: true });
            }
            if (recorded === 'yes') query = query.eq('has_recording', true);
            else if (recorded === 'no') query = query.or('has_recording.eq.false,has_recording.is.null');

            query = query.range(from, to);
            const { data: sData, error, count: sCount } = await query;
            if (error) throw error;
            data = sData || [];
            count = sCount || 0;

            // Fetch recordings for these sentences
            const ids = data.map(s => s.id);
            if (ids.length > 0) {
                try {
                    const { data: recs, error: recErr } = await supabase
                        .from('recordings')
                        .select('id, sentence_id, speaker_id, audio_path, duration_seconds, created_at, speaker_gender, speaker_age, speaker_location')
                        .in('sentence_id', ids)
                        .order('created_at', { ascending: false });
                    if (!recErr && recs) {
                        recs.forEach(r => {
                            if (!recMap[r.sentence_id]) recMap[r.sentence_id] = [];
                            recMap[r.sentence_id].push({
                                rec_id: r.id, speaker_id: r.speaker_id,
                                audio_path: r.audio_path, duration_seconds: r.duration_seconds,
                                recorded_at: r.created_at, contributor_name: r.speaker_id,
                                contributor_gender: r.speaker_gender || '',
                                contributor_age: r.speaker_age || '',
                                contributor_location: r.speaker_location || ''
                            });
                        });
                    }
                } catch (e) { console.error('Recordings fetch error:', e.message); }
            }
        }

        // Build rows
        const rows = data.map(s => ({ ...s, recordings: recMap[s.id] || [] }));

        // Get ALL unique speakers for filter dropdown
        let speakers = [];
        try {
            const allSpeakers = new Set();
            let spOffset = 0;
            const spPage = 1000;
            let hasMore = true;
            while (hasMore) {
                const { data: sp } = await supabase
                    .from('recordings')
                    .select('speaker_id')
                    .range(spOffset, spOffset + spPage - 1);
                if (sp && sp.length > 0) {
                    sp.forEach(s => { if (s.speaker_id) allSpeakers.add(s.speaker_id); });
                    hasMore = sp.length === spPage;
                    spOffset += spPage;
                } else {
                    hasMore = false;
                }
            }
            speakers = [...allSpeakers].sort();
        } catch (e) { console.error('Speaker list error:', e.message); }

        res.json({ rows, total: count, page: p, limit: lim, speakers });
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
