const supabase = require('../lib/supabase');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { speaker_id, limit = '30', offset = '0' } = req.query;
        // speaker_id is still logged/tracked but not used for filtering anymore
        // per user request: "once recorded should not be shown same sentences to the client"

        const lim = Math.min(50, Math.max(1, parseInt(limit)));
        const off = Math.max(0, parseInt(offset));

        // Fetch sentences that have NOT been recorded by ANYONE
        const { data, error, count } = await supabase
            .from('sentences')
            .select('*', { count: 'exact' })
            .eq('has_recording', false)
            .order('id', { ascending: true })
            .range(off, off + lim - 1);

        if (error) throw error;

        if (!data || data.length === 0) {
            return res.json({ done: true, sentences: [], total: 0, message: 'All sentences recorded!' });
        }
        res.json({ done: false, sentences: data, total: count || 0, limit: lim, offset: off });
    } catch (err) {
        console.error('Next sentence error:', err);
        res.status(500).json({ error: err.message });
    }
};

async function fallbackBatch(res, speakerId, limit, offset) {
    const { data: recorded } = await supabase
        .from('recordings').select('sentence_id').eq('speaker_id', speakerId);
    const doneIds = (recorded || []).map(r => r.sentence_id);

    let query = supabase.from('sentences').select('*', { count: 'exact' }).order('id');
    if (doneIds.length > 0) query = query.not('id', 'in', `(${doneIds.join(',')})`);

    const { data, error, count } = await query.range(offset, offset + limit - 1);
    if (error) throw error;
    if (!data || data.length === 0) return res.json({ done: true, sentences: [], total: 0 });
    res.json({ done: false, sentences: data, total: count || data.length, limit, offset });
}
