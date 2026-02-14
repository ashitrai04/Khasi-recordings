const supabase = require('../lib/supabase');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { speaker_id, limit = '30', offset = '0' } = req.query;
        if (!speaker_id) return res.status(400).json({ error: 'speaker_id required' });

        const lim = Math.min(50, Math.max(1, parseInt(limit)));
        const off = Math.max(0, parseInt(offset));

        // Try RPC batch function first
        const { data, error } = await supabase.rpc('get_batch_sentences', {
            p_speaker: speaker_id, p_limit: lim, p_offset: off
        });

        if (error) {
            console.warn('RPC failed, using fallback:', error.message);
            return await fallbackBatch(res, speaker_id, lim, off);
        }

        // Get total unrecorded count for this speaker
        const { count } = await supabase.rpc('get_batch_sentences', {
            p_speaker: speaker_id, p_limit: 100000, p_offset: 0
        }).then(r => ({ count: r.data?.length || 0 }));

        if (!data || data.length === 0) {
            return res.json({ done: true, sentences: [], total: 0, message: 'All sentences recorded!' });
        }
        res.json({ done: false, sentences: data, total: count, limit: lim, offset: off });
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
