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
                .select('speaker_id, speaker_gender, speaker_location')
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
            const name = r.speaker_id || 'Unknown';
            if (!speakerMap[name]) {
                speakerMap[name] = {
                    name,
                    count: 0,
                    gender: r.speaker_gender || '',
                    location: r.speaker_location || ''
                };
            }
            speakerMap[name].count++;
        });

        // Sort descending by count
        const leaderboard = Object.values(speakerMap)
            .sort((a, b) => b.count - a.count);

        // Fetch recent recordings for activity log (last 30)
        const { data: recentData, error: recentErr } = await supabase
            .from('recordings')
            .select('sentence_id, speaker_id, speaker_gender, speaker_location, duration_seconds, created_at')
            .order('created_at', { ascending: false })
            .limit(30);
        if (recentErr) throw recentErr;

        // Get sentence texts for recent recordings
        let recentLog = [];
        if (recentData && recentData.length > 0) {
            const sentIds = [...new Set(recentData.map(r => r.sentence_id))];
            const { data: sentData } = await supabase
                .from('sentences')
                .select('id, english_text, khasi_text')
                .in('id', sentIds);
            const sentMap = {};
            (sentData || []).forEach(s => { sentMap[s.id] = s; });

            recentLog = recentData.map(r => ({
                speaker: r.speaker_id || 'Unknown',
                gender: r.speaker_gender || '',
                location: r.speaker_location || '',
                duration: r.duration_seconds || 0,
                recorded_at: r.created_at,
                sentence_id: r.sentence_id,
                english: sentMap[r.sentence_id]?.english_text || '',
                khasi: sentMap[r.sentence_id]?.khasi_text || ''
            }));
        }

        res.json({
            leaderboard,
            recent: recentLog,
            total_recordings: allRecordings.length,
            total_speakers: leaderboard.length
        });
    } catch (err) {
        console.error('Leaderboard error:', err);
        res.status(500).json({ error: err.message });
    }
};
