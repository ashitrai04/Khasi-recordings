const supabase = require('../lib/supabase');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { speaker_id, limit = '30' } = req.query;
        if (!speaker_id) return res.status(400).json({ error: 'speaker_id required' });

        const lim = Math.min(50, Math.max(1, parseInt(limit)));

        // Get total count of unrecorded sentences
        const { count: totalCount, error: countErr } = await supabase
            .from('final_sentences')
            .select('*', { count: 'exact', head: true })
            .or('has_recording.eq.false,has_recording.is.null');

        if (countErr) throw countErr;

        if (!totalCount || totalCount === 0) {
            return res.json({ done: true, sentences: [], total: 0, message: 'All sentences recorded!' });
        }

        // Pick a random starting offset so different users get different batches
        const maxOffset = Math.max(0, totalCount - lim);
        const randomOff = Math.floor(Math.random() * (maxOffset + 1));

        const { data, error } = await supabase
            .from('final_sentences')
            .select('*')
            .or('has_recording.eq.false,has_recording.is.null')
            .order('id')
            .range(randomOff, randomOff + lim - 1);

        if (error) throw error;

        if (!data || data.length === 0) {
            return res.json({ done: true, sentences: [], total: 0, message: 'All sentences recorded!' });
        }

        res.json({ done: false, sentences: data, total: totalCount, limit: lim, offset: randomOff });
    } catch (err) {
        console.error('Next sentence error:', err);
        res.status(500).json({ error: err.message });
    }
};
