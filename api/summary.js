const supabase = require('../lib/supabase');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const [sentResult, recResult, speakerResult] = await Promise.all([
            supabase.from('sentences').select('*', { count: 'exact', head: true }),
            supabase.from('recordings').select('*', { count: 'exact', head: true }),
            supabase.from('recordings').select('speaker_id')
        ]);
        if (sentResult.error) throw sentResult.error;
        if (recResult.error) throw recResult.error;

        const uniqueSpeakers = new Set((speakerResult.data || []).map((r) => r.speaker_id));
        res.json({ sentences: sentResult.count || 0, recordings: recResult.count || 0, speakers: uniqueSpeakers.size });
    } catch (err) {
        console.error('Summary error:', err);
        res.status(500).json({ error: err.message });
    }
};
