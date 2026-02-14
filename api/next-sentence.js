const supabase = require('../lib/supabase');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { speaker_id, limit = '30', offset = '0' } = req.query;
        if (!speaker_id) return res.status(400).json({ error: 'speaker_id required' });

        const lim = Math.min(50, Math.max(1, parseInt(limit)));
        const off = Math.max(0, parseInt(offset));

        // Use RPC to get sentences not recorded by *this* speaker
        // This allows multiple speakers to record the same sentence, but prevents duplicates for one speaker.
        const { data, error } = await supabase.rpc('get_batch_sentences', {
            p_speaker: speaker_id, p_limit: lim, p_offset: off
        });

        if (error) {
            console.warn('RPC failed, using fallback:', error.message);
            // Fallback: manually fetch unrecorded sentences for this speaker
            const { data: recorded } = await supabase
                .from('recordings').select('sentence_id').eq('speaker_id', speaker_id);
            const doneIds = (recorded || []).map(r => r.sentence_id);

            let query = supabase.from('sentences').select('*', { count: 'exact' }).order('id');
            if (doneIds.length > 0) query = query.not('id', 'in', `(${doneIds.join(',')})`);

            const { data: fbData, count: fbCount, error: fbErr } = await query.range(off, off + lim - 1);
            if (fbErr) throw fbErr;

            if (!fbData || fbData.length === 0) {
                return res.json({ done: true, sentences: [], total: 0, message: 'All sentences recorded!' });
            }
            return res.json({ done: false, sentences: fbData, total: fbCount || 0, limit: lim, offset: off });
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
