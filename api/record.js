const supabase = require('../lib/supabase');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { sentence_id, speaker_id, duration_seconds, audio } = req.body;
        if (!sentence_id || !speaker_id || !audio) {
            return res.status(400).json({ error: 'sentence_id, speaker_id, and audio required' });
        }

        const buffer = Buffer.from(audio, 'base64');
        const safe = String(speaker_id).replace(/[^a-z0-9_-]/gi, '_').slice(0, 40);
        const fileName = `${sentence_id}_${safe}_${Date.now()}.wav`;

        const { error: uploadErr } = await supabase.storage
            .from('recordings').upload(fileName, buffer, { contentType: 'audio/wav', upsert: false });
        if (uploadErr) throw uploadErr;

        const { data: urlData } = supabase.storage.from('recordings').getPublicUrl(fileName);
        const audioUrl = urlData?.publicUrl || fileName;

        const { error: dbErr } = await supabase.from('recordings').insert({
            sentence_id: Number(sentence_id), speaker_id,
            audio_path: audioUrl, duration_seconds: parseFloat(duration_seconds) || null
        });
        if (dbErr) throw dbErr;

        await supabase.from('sentences').update({ has_recording: true }).eq('id', Number(sentence_id));

        res.json({ ok: true, audio_path: audioUrl });
    } catch (err) {
        console.error('Record error:', err);
        res.status(500).json({ error: err.message });
    }
};
