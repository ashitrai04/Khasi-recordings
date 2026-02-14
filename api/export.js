const supabase = require('../lib/supabase');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    try {
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename=khasi_speech_export.csv');
        res.write('id,excel_row_id,english_text,khasi_text,audio_file_url,speaker_id,recorded_at,duration_seconds\n');

        const PAGE = 1000;
        let offset = 0, hasMore = true;
        while (hasMore) {
            const { data, error } = await supabase
                .from('sentences')
                .select('id, excel_row_id, english_text, khasi_text, recordings(speaker_id, audio_path, duration_seconds, created_at)')
                .order('id').range(offset, offset + PAGE - 1);
            if (error) throw error;

            for (const s of data) {
                let latest = null;
                if (s.recordings && s.recordings.length > 0)
                    latest = s.recordings.reduce((a, b) => new Date(a.created_at) > new Date(b.created_at) ? a : b);
                res.write([esc(s.id), esc(s.excel_row_id), esc(s.english_text), esc(s.khasi_text),
                esc(latest?.audio_path || ''), esc(latest?.speaker_id || ''), esc(latest?.created_at || ''), esc(latest?.duration_seconds || '')
                ].join(',') + '\n');
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
