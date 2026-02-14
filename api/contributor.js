const supabase = require('../lib/supabase');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { name, gender, age, location } = req.body;
        if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });

        const speakerId = name.trim();
        let contributorId = null;

        // Try to save to contributors table — but don't block if table doesn't exist
        try {
            const { data, error } = await supabase.from('contributors').insert({
                name: speakerId, gender: gender || null,
                age: age ? parseInt(age) : null, location: location || null
            }).select('id').single();
            if (!error && data) contributorId = data.id;
        } catch (e) { /* table may not exist yet — that's OK */ }

        res.json({ ok: true, contributor_id: contributorId, speaker_id: speakerId });
    } catch (err) {
        console.error('Contributor error:', err);
        // Even on error, return success with just speaker_id so the user can proceed
        const name = (req.body?.name || '').trim();
        res.json({ ok: true, contributor_id: null, speaker_id: name || 'anonymous' });
    }
};
