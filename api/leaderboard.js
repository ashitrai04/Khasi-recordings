const supabase = require('../lib/supabase');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const period = url.searchParams.get('period') || 'all';

        // Calculate date filter
        let dateFilter = null;
        const now = new Date();
        if (period === 'today') {
            dateFilter = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        } else if (period === 'yesterday') {
            const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
            dateFilter = y.toISOString();
            var dateEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        } else if (period === 'week') {
            const w = new Date(now);
            w.setDate(w.getDate() - 7);
            dateFilter = w.toISOString();
        } else if (period === 'month') {
            const m = new Date(now);
            m.setDate(m.getDate() - 30);
            dateFilter = m.toISOString();
        }

        // Paginate through recordings with optional date filter
        let allRecordings = [];
        let from = 0;
        const PAGE = 1000;
        while (true) {
            let query = supabase
                .from('recordings')
                .select('speaker_id, speaker_gender, speaker_location, created_at')
                .range(from, from + PAGE - 1);

            if (dateFilter) {
                query = query.gte('created_at', dateFilter);
                if (period === 'yesterday' && dateEnd) {
                    query = query.lt('created_at', dateEnd);
                }
            }

            const { data, error } = await query;
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

        // Fetch recent recordings for activity log (last 30, always unfiltered)
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
            period,
            total_recordings: allRecordings.length,
            total_speakers: leaderboard.length
        });
    } catch (err) {
        console.error('Leaderboard error:', err);
        res.status(500).json({ error: err.message });
    }
};
