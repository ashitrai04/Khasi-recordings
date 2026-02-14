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

        const { data, error } = await supabase.from('contributors').insert({
            name: name.trim(),
            gender: gender || null,
            age: age ? parseInt(age) : null,
            location: location || null
        }).select('id').single();

        if (error) throw error;
        res.json({ ok: true, contributor_id: data.id, speaker_id: name.trim() });
    } catch (err) {
        console.error('Contributor error:', err);
        res.status(500).json({ error: err.message });
    }
};
