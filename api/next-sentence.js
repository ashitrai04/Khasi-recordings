const supabase = require('../lib/supabase');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { speaker_id } = req.query;
        if (!speaker_id) return res.status(400).json({ error: 'speaker_id required' });

        // Try RPC function first (optimal)
        const { data, error } = await supabase.rpc('get_next_sentence', { p_speaker: speaker_id });

        if (error) {
            console.warn('RPC failed, using fallback:', error.message);
            return await fallbackNext(res, speaker_id);
        }

        if (!data || data.length === 0) {
            return res.json({ done: true, message: 'All sentences recorded!' });
        }
        res.json({ done: false, sentence: data[0] });
    } catch (err) {
        console.error('Next sentence error:', err);
        res.status(500).json({ error: err.message });
    }
};

async function fallbackNext(res, speakerId) {
    const { data: recorded } = await supabase
        .from('recordings').select('sentence_id').eq('speaker_id', speakerId);
    const doneIds = (recorded || []).map((r) => r.sentence_id);

    let query = supabase.from('sentences').select('*').order('id').limit(20);
    if (doneIds.length > 0) query = query.not('id', 'in', `(${doneIds.join(',')})`);

    const { data, error } = await query;
    if (error) throw error;
    if (!data || data.length === 0) return res.json({ done: true });

    const pick = data[Math.floor(Math.random() * data.length)];
    res.json({ done: false, sentence: pick });
}
