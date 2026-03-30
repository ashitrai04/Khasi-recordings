const supabase = require('../lib/supabase');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const [sentResult, recResult] = await Promise.all([
            supabase.from('final_sentences').select('*', { count: 'exact', head: true }),
            supabase.from('final_recordings').select('*', { count: 'exact', head: true })
        ]);
        if (sentResult.error) throw sentResult.error;
        if (recResult.error) throw recResult.error;

        // Paginate through ALL recordings to get accurate speaker count & total duration
        // Supabase returns max 1000 rows per query
        const uniqueSpeakers = new Set();
        let totalSeconds = 0;
        let offset = 0;
        const pageSize = 1000;
        let hasMore = true;
        while (hasMore) {
            const { data: batch, error: batchErr } = await supabase
                .from('final_recordings')
                .select('speaker_id, duration_seconds')
                .range(offset, offset + pageSize - 1);
            if (batchErr) throw batchErr;
            if (batch && batch.length > 0) {
                batch.forEach(r => {
                    if (r.speaker_id) uniqueSpeakers.add(r.speaker_id);
                    totalSeconds += (r.duration_seconds || 0);
                });
                hasMore = batch.length === pageSize;
                offset += pageSize;
            } else {
                hasMore = false;
            }
        }
        res.json({ sentences: sentResult.count || 0, recordings: recResult.count || 0, speakers: uniqueSpeakers.size, total_seconds: Math.round(totalSeconds) });
    } catch (err) {
        console.error('Summary error:', err);
        res.status(500).json({ error: err.message });
    }
};
