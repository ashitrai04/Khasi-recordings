const supabase = require('../lib/supabase');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    try {
        // Paginate through ALL recordings to get every speaker
        let allRecordings = [];
        let from = 0;
        const PAGE = 1000;
        while (true) {
            const { data, error } = await supabase
                .from('recordings')
                .select('speaker_id, contributor_name, contributor_gender, contributor_location')
                .range(from, from + PAGE - 1);
            if (error) throw error;
            if (!data || data.length === 0) break;
            allRecordings = allRecordings.concat(data);
            if (data.length < PAGE) break;
            from += PAGE;
        }

        // Group by speaker and count
        const speakerMap = {};
        allRecordings.forEach(r => {
            const name = r.contributor_name || r.speaker_id || 'Unknown';
            if (!speakerMap[name]) {
                speakerMap[name] = {
                    name,
                    count: 0,
                    gender: r.contributor_gender || '',
                    location: r.contributor_location || ''
                };
            }
            speakerMap[name].count++;
        });

        // Sort descending by count
        const leaderboard = Object.values(speakerMap)
            .sort((a, b) => b.count - a.count);

        res.json({
            leaderboard,
            total_recordings: allRecordings.length,
            total_speakers: leaderboard.length
        });
    } catch (err) {
        console.error('Leaderboard error:', err);
        res.status(500).json({ error: err.message });
    }
};
