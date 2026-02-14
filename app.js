(function () {
    'use strict';
    const speakerSetup = document.getElementById('speakerSetup'), speakerInput = document.getElementById('speakerInput'),
        speakerSaveBtn = document.getElementById('speakerSaveBtn'), mainArea = document.getElementById('mainArea'),
        khasiText = document.getElementById('khasiText'), englishText = document.getElementById('englishText'),
        recordBtn = document.getElementById('recordBtn'), stopBtn = document.getElementById('stopBtn'),
        playBtn = document.getElementById('playBtn'), submitBtn = document.getElementById('submitBtn'),
        skipBtn = document.getElementById('skipBtn'), status = document.getElementById('status'),
        recIndicator = document.getElementById('recIndicator'), recTimer = document.getElementById('recTimer'),
        progressWrap = document.getElementById('progressWrap'), progressCount = document.getElementById('progressCount'),
        waveCanvas = document.getElementById('waveformCanvas'), waveCtx = waveCanvas.getContext('2d');

    let speakerId = localStorage.getItem('speaker_id') || '', currentSentence = null, audioCtx = null,
        recorder = null, recorded = [], wavBlob = null, duration = 0, timerInterval = null, startTime = 0,
        submitted = parseInt(localStorage.getItem('submitted_count') || '0', 10), analyser = null;

    if (speakerId) { speakerInput.value = speakerId; showMainArea() }
    speakerSaveBtn.addEventListener('click', () => { const v = speakerInput.value.trim(); if (!v) return alert('Please enter your name'); speakerId = v; localStorage.setItem('speaker_id', speakerId); showMainArea() });
    speakerInput.addEventListener('keydown', e => { if (e.key === 'Enter') speakerSaveBtn.click() });

    function showMainArea() { speakerSetup.style.display = 'none'; mainArea.style.display = 'block'; updateProgress(); fetchNext() }

    async function fetchNext() {
        setStatus('Fetching next sentence…'); resetRecState();
        try {
            const res = await fetch('/api/next-sentence?speaker_id=' + encodeURIComponent(speakerId));
            if (!res.ok) throw new Error('Server error ' + res.status);
            const data = await res.json();
            if (data.done) { khasiText.textContent = '🎉 All done!'; englishText.textContent = 'You have recorded all available sentences. Thank you!'; disableAll(); setStatus('No more sentences.', 'success'); return }
            currentSentence = data.sentence; khasiText.textContent = currentSentence.khasi_text; englishText.textContent = currentSentence.english_text; setStatus('Ready to record');
        } catch (err) { console.error(err); setStatus('Error: ' + err.message, 'error') }
    }

    recordBtn.addEventListener('click', async () => {
        if (!currentSentence) return alert('No sentence loaded');
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const source = audioCtx.createMediaStreamSource(stream);
            analyser = audioCtx.createAnalyser(); analyser.fftSize = 256; source.connect(analyser);
            const proc = audioCtx.createScriptProcessor(4096, 1, 1); recorded = [];
            proc.onaudioprocess = e => { recorded.push(new Float32Array(e.inputBuffer.getChannelData(0))) };
            source.connect(proc); proc.connect(audioCtx.destination);
            recorder = { stream, source, processor: proc }; startTime = Date.now();
            recordBtn.disabled = true; stopBtn.disabled = false; playBtn.disabled = true; submitBtn.disabled = true;
            recIndicator.classList.add('active'); setStatus('Recording…');
            timerInterval = setInterval(() => { const s = Math.floor((Date.now() - startTime) / 1000); recTimer.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') }, 500);
            drawWaveform();
        } catch (err) { alert(err.name === 'NotAllowedError' ? 'Microphone permission denied.' : 'Mic error: ' + err.message) }
    });

    stopBtn.addEventListener('click', () => {
        if (!recorder) return; clearInterval(timerInterval); duration = (Date.now() - startTime) / 1000;
        recorder.processor.disconnect(); recorder.source.disconnect();
        recorder.stream.getTracks().forEach(t => t.stop());
        const sr = audioCtx.sampleRate; wavBlob = buildWav(concat32(recorded), sr, 16000);
        try { audioCtx.close() } catch (_) { } recorder = null; analyser = null; recorded = [];
        recordBtn.disabled = false; stopBtn.disabled = true; playBtn.disabled = false; submitBtn.disabled = false;
        recIndicator.classList.remove('active'); setStatus('Ready (' + duration.toFixed(1) + 's). Play or submit.', 'success'); clearWave();
    });

    playBtn.addEventListener('click', () => { if (!wavBlob) return; const u = URL.createObjectURL(wavBlob); const a = new Audio(u); a.play(); a.onended = () => URL.revokeObjectURL(u) });

    submitBtn.addEventListener('click', async () => {
        if (!wavBlob || !currentSentence) return; setStatus('Uploading…'); submitBtn.disabled = true;
        try {
            const b64 = await blobTo64(wavBlob);
            const res = await fetch('/api/record', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sentence_id: currentSentence.id, speaker_id: speakerId, duration_seconds: duration, audio: b64 })
            });
            if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Upload failed') }
            submitted++; localStorage.setItem('submitted_count', submitted); updateProgress(); setStatus('Submitted! Loading next…', 'success'); await fetchNext();
        } catch (err) { console.error(err); setStatus('Upload failed: ' + err.message, 'error'); submitBtn.disabled = false }
    });

    skipBtn.addEventListener('click', () => fetchNext());

    function setStatus(m, t) { status.textContent = m; status.className = 'status' + (t ? ' ' + t : '') }
    function resetRecState() { wavBlob = null; duration = 0; recordBtn.disabled = false; stopBtn.disabled = true; playBtn.disabled = true; submitBtn.disabled = true; recIndicator.classList.remove('active'); clearInterval(timerInterval); recTimer.textContent = '0:00'; clearWave() }
    function disableAll() { [recordBtn, stopBtn, playBtn, submitBtn, skipBtn].forEach(b => b.disabled = true) }
    function updateProgress() { if (submitted > 0) { progressWrap.style.display = 'block'; progressCount.textContent = submitted + ' recorded' } }
    function blobTo64(b) { return new Promise((ok, no) => { const r = new FileReader(); r.onloadend = () => ok(r.result.split(',')[1]); r.onerror = no; r.readAsDataURL(b) }) }

    function concat32(ch) { const l = ch.reduce((s, c) => s + c.length, 0); const o = new Float32Array(l); let p = 0; for (const c of ch) { o.set(c, p); p += c.length } return o }
    function resample(b, sr, dr) { if (sr === dr) return b; const r = sr / dr, l = Math.round(b.length / r), o = new Float32Array(l); for (let i = 0; i < l; i++)o[i] = b[Math.floor(i * r)] || 0; return o }
    function buildWav(samples, sr, tr) {
        const rs = resample(samples, sr, tr), n = rs.length, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
        const ws = (o, s) => { for (let i = 0; i < s.length; i++)v.setUint8(o + i, s.charCodeAt(i)) };
        ws(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); ws(8, 'WAVE'); ws(12, 'fmt '); v.setUint32(16, 16, true);
        v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, tr, true); v.setUint32(28, tr * 2, true);
        v.setUint16(32, 2, true); v.setUint16(34, 16, true); ws(36, 'data'); v.setUint32(40, n * 2, true);
        for (let i = 0; i < n; i++) { const s = Math.max(-1, Math.min(1, rs[i])); v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true) }
        return new Blob([v], { type: 'audio/wav' });
    }

    function resizeCanvas() { const w = document.getElementById('waveformWrap'); waveCanvas.width = w.clientWidth; waveCanvas.height = w.clientHeight }
    window.addEventListener('resize', resizeCanvas); resizeCanvas();
    function clearWave() { waveCtx.fillStyle = '#0f1019'; waveCtx.fillRect(0, 0, waveCanvas.width, waveCanvas.height) } clearWave();
    function drawWaveform() {
        if (!analyser) return; requestAnimationFrame(drawWaveform);
        const d = new Uint8Array(analyser.frequencyBinCount); analyser.getByteFrequencyData(d);
        const W = waveCanvas.width, H = waveCanvas.height; waveCtx.fillStyle = 'rgba(15,16,25,0.35)'; waveCtx.fillRect(0, 0, W, H);
        const bars = Math.min(d.length, 64), bw = W / bars, g = waveCtx.createLinearGradient(0, H, 0, 0);
        g.addColorStop(0, '#6366f1'); g.addColorStop(1, '#a78bfa');
        for (let i = 0; i < bars; i++) { const h = d[i] / 255 * H * .9; waveCtx.fillStyle = g; waveCtx.fillRect(i * bw + 1, H - h, bw - 2, h) }
    }
})();
