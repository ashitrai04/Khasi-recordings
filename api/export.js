const supabase = require('../lib/supabase');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    try {
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename=khasi_speech_dataset.csv');
        res.write('sentence_id,excel_row_id,english_text,khasi_text,audio_file_url,speaker_id,contributor_name,gender,age,location,duration_seconds,recorded_at\n');

        const PAGE = 500;
        let offset = 0, hasMore = true;
        while (hasMore) {
            const { data, error } = await supabase
                .from('sentences')
                .select('id, excel_row_id, english_text, khasi_text')
                .order('id').range(offset, offset + PAGE - 1);
            if (error) throw error;

            for (const s of data) {
                // Fetch recordings for this sentence
                const { data: recs } = await supabase
                    .from('recordings')
                    .select('speaker_id, audio_path, duration_seconds, created_at, speaker_gender, speaker_age, speaker_location')
                    .eq('sentence_id', s.id)
                    .order('created_at', { ascending: false });

                if (recs && recs.length > 0) {
                    // Write one row per recording (for ML training — each audio is a data point)
                    for (const r of recs) {
                        res.write([
                            esc(s.id), esc(s.excel_row_id), esc(s.english_text), esc(s.khasi_text),
                            esc(r.audio_path), esc(r.speaker_id),
                            esc(r.speaker_id), // contributor_name is same as speaker_id now
                            esc(r.speaker_gender || ''),
                            esc(r.speaker_age || ''),
                            esc(r.speaker_location || ''),
                            esc(r.duration_seconds || ''),
                            esc(r.created_at || '')
                        ].join(',') + '\n');
                    }
                } else {
                    // Sentence with no recording yet
                    res.write([
                        esc(s.id), esc(s.excel_row_id), esc(s.english_text), esc(s.khasi_text),
                        '', '', '', '', '', '', '', ''
                    ].join(',') + '\n');
                }
            }
            hasMore = data.length === PAGE;
            offset += PAGE;
        }
        res.end();
    } catch (err) {
        console.error('Export error:', err);
        if (!res.headersSent) res.status(500).json({ error: err.message }); else res.end();
    }
};

function esc(v) {
    if (v === null || v === undefined) return '';
    const s = String(v).replace(/"/g, '""');
    return s.includes(',') || s.includes('\n') || s.includes('"') ? `"${s}"` : s;
}
