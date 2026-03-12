const supabase = require('../lib/supabase');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { speaker_id, limit = '30', offset = '0' } = req.query;
        if (!speaker_id) return res.status(400).json({ error: 'speaker_id required' });

        const lim = Math.min(50, Math.max(1, parseInt(limit)));
        const off = Math.max(0, parseInt(offset));

        // Fetch sentences that have NOT been recorded by ANYONE yet (false or null)
        const { data, count, error } = await supabase
            .from('sentences')
            .select('*', { count: 'exact' })
            .or('has_recording.eq.false,has_recording.is.null')
            .order('id')
            .range(off, off + lim - 1);

        if (error) {
            console.error('Fetch error:', error.message);
            throw error;
        }

        if (!data || data.length === 0) {
            return res.json({ done: true, sentences: [], total: 0, message: 'All sentences recorded!' });
        }

        res.json({ done: false, sentences: data, total: count || 0, limit: lim, offset: off });
    } catch (err) {
        console.error('Next sentence error:', err);
        res.status(500).json({ error: err.message });
    }
};
