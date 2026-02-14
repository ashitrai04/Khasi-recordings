const supabase = require('../lib/supabase');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { recordings } = req.body;
        if (!recordings || !Array.isArray(recordings) || recordings.length === 0) {
            return res.status(400).json({ error: 'recordings array required' });
        }

        const results = [];
        for (const rec of recordings) {
            const { sentence_id, speaker_id, contributor_id, duration_seconds, audio } = rec;
            if (!sentence_id || !speaker_id || !audio) {
                results.push({ sentence_id, ok: false, error: 'Missing required fields' });
                continue;
            }

            const buffer = Buffer.from(audio, 'base64');
            const safe = String(speaker_id).replace(/[^a-z0-9_-]/gi, '_').slice(0, 40);
            const fileName = `${sentence_id}_${safe}_${Date.now()}.wav`;

            const { error: uploadErr } = await supabase.storage
                .from('recordings').upload(fileName, buffer, { contentType: 'audio/wav', upsert: false });
            if (uploadErr) { results.push({ sentence_id, ok: false, error: uploadErr.message }); continue; }

            const { data: urlData } = supabase.storage.from('recordings').getPublicUrl(fileName);
            const audioUrl = urlData?.publicUrl || fileName;

            const insertObj = {
                sentence_id: Number(sentence_id), speaker_id,
                audio_path: audioUrl, duration_seconds: parseFloat(duration_seconds) || null
            };
            if (contributor_id) insertObj.contributor_id = Number(contributor_id);

            const { error: dbErr } = await supabase.from('recordings').insert(insertObj);
            if (dbErr) { results.push({ sentence_id, ok: false, error: dbErr.message }); continue; }

            await supabase.from('sentences').update({ has_recording: true }).eq('id', Number(sentence_id));
            results.push({ sentence_id, ok: true, audio_path: audioUrl });
        }

        const allOk = results.every(r => r.ok);
        res.json({ ok: allOk, results, submitted: results.filter(r => r.ok).length });
    } catch (err) {
        console.error('Record error:', err);
        res.status(500).json({ error: err.message });
    }
};
