const supabase = require('../lib/supabase');

module.exports = async (req, res) => {
    try {
        console.log('Fetching all recordings...');
        let allRecordings = [];
        let from = 0;
        const PAGE = 1000;
        while (true) {
            const { data, error } = await supabase
                .from('recordings')
                .select('id, sentence_id, speaker_id, created_at, audio_path')
                .range(from, from + PAGE - 1)
                .order('created_at', { ascending: false });

            if (error) {
                return res.status(500).json({ error: error.message });
            }
            if (!data || data.length === 0) break;
            allRecordings = allRecordings.concat(data);
            if (data.length < PAGE) break;
            from += PAGE;
        }

        const groups = {};
        for (const rec of allRecordings) {
            const key = `${rec.sentence_id}_${rec.speaker_id}`;
            if (!groups[key]) groups[key] = [];
            groups[key].push(rec);
        }

        let toDeleteDbIds = [];
        let toDeleteStoragePaths = [];

        for (const key in groups) {
            const group = groups[key];
            if (group.length > 1) {
                // Keep the newest (first one since sorted DESC)
                const removeList = group.slice(1);
                for (const r of removeList) {
                    toDeleteDbIds.push(r.id);
                    if (r.audio_path) {
                        const parts = r.audio_path.split('/');
                        const filename = parts[parts.length - 1];
                        toDeleteStoragePaths.push(filename);
                    }
                }
            }
        }

        if (toDeleteDbIds.length > 0) {
            for (let i = 0; i < toDeleteDbIds.length; i += 100) {
                const chunk = toDeleteDbIds.slice(i, i + 100);
                await supabase.from('recordings').delete().in('id', chunk);
            }
            for (let i = 0; i < toDeleteStoragePaths.length; i += 50) {
                const chunk = toDeleteStoragePaths.slice(i, i + 50);
                await supabase.storage.from('recordings').remove(chunk);
            }
        }

        res.json({ success: true, deleted: toDeleteDbIds.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
