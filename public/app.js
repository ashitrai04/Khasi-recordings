// Frontend behaviour using Supabase for storage and DB (records 16kHz mono WAV)
// Requires Supabase URL and ANON key saved in localStorage as SUPABASE_URL and SUPABASE_ANON (use admin.html to save)
(async function(){
  // Only run on contributor page
  if (!(window.location.pathname.endsWith('index.html') || window.location.pathname === '/' || window.location.pathname.endsWith('/record'))) return;

  // Supabase client
  const SUPABASE_URL = localStorage.getItem('SUPABASE_URL') || '';
  const SUPABASE_ANON = localStorage.getItem('SUPABASE_ANON') || '';
  let sb = null;
  if (SUPABASE_URL && SUPABASE_ANON && window.supabase && supabase.createClient) {
    sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
  }

  const speakerInput = document.getElementById('speaker');
  const saveBtn = document.getElementById('saveSpeaker');
  const khasiText = document.getElementById('khasiText');
  const englishText = document.getElementById('englishText');
  const recordBtn = document.getElementById('recordBtn');
  const stopBtn = document.getElementById('stopBtn');
  const playBtn = document.getElementById('playBtn');
  const submitBtn = document.getElementById('submitBtn');
  const skipBtn = document.getElementById('skipBtn');
  const status = document.getElementById('status');

  let speakerId = localStorage.getItem('speaker_id') || '';
  if(speakerId) speakerInput.value = speakerId;
  saveBtn.addEventListener('click', ()=>{
    speakerId = speakerInput.value.trim();
    if(!speakerId) return alert('enter name');
    localStorage.setItem('speaker_id', speakerId);
    status.innerText = 'Saved speaker: '+speakerId;
    fetchNext();
  });

  let currentSentence = null;
  let recorder = null;
  let recorded = [];
  let audioContext = null;
  let lastBlob = null;
  let lastDuration = 0;

  function sanitizeFilename(s){ return String(s).replace(/[^a-z0-9-_]/gi,'_').slice(0,60); }

  async function fetchNext(){
    if(!speakerId){ status.innerText = 'Please enter and save speaker name.'; return; }
    status.innerText = 'Fetching next sentence...';
    try{
      if (sb) {
        // call RPC get_next_sentence; ensure you created it in Supabase SQL as described in README
        const { data, error } = await sb.rpc('get_next_sentence', { p_speaker: speakerId });
        if (error) throw error;
        if (!data || data.length === 0) { khasiText.innerText = 'No more sentences'; englishText.innerText=''; status.innerText='Done'; return; }
        currentSentence = data[0];
      } else {
        // fallback to existing backend if present
        const res = await fetch('/api/next?speaker_id='+encodeURIComponent(speakerId));
        const j = await res.json();
        if(!j.ok){ khasiText.innerText = 'No more sentences'; englishText.innerText=''; status.innerText = 'Done'; return; }
        currentSentence = j.sentence;
      }
      khasiText.innerText = currentSentence.khasi_text || '(no khasi)';
      englishText.innerText = currentSentence.english_text || '';
      status.innerText = '';
      playBtn.disabled = true; submitBtn.disabled = true;
      lastBlob = null; lastDuration = 0;
    }catch(err){ console.error(err); status.innerText = 'Error fetching next: '+err.message; }
  }

  // Recording logic: capture raw float buffers via ScriptProcessor and assemble
  recordBtn.addEventListener('click', async ()=>{
    if(!currentSentence) return alert('No sentence loaded');
    try{
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const src = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      recorded = [];
      processor.onaudioprocess = (e)=>{ recorded.push(new Float32Array(e.inputBuffer.getChannelData(0))); };
      src.connect(processor);
      processor.connect(audioContext.destination);
      recorder = { stream, src, processor };
      recordBtn.disabled = true; stopBtn.disabled = false; status.innerText = 'Recording...';
      // store start time
      recorder._start = Date.now();
    }catch(err){ alert('Microphone error: '+err.message); }
  });

  stopBtn.addEventListener('click', ()=>{
    if(!recorder) return;
    try{
      recorder.processor.disconnect(); recorder.src.disconnect();
      recorder.stream.getTracks().forEach(t=>t.stop());
      lastDuration = (Date.now() - recorder._start)/1000;
      processRecorded(audioContext.sampleRate);
    }catch(err){ console.error(err); }
    recordBtn.disabled = false; stopBtn.disabled = true;
  });

  function processRecorded(sampleRate){
    // concat
    let length = recorded.reduce((s,r)=>s+r.length,0);
    const full = new Float32Array(length); let off=0; for(const r of recorded){ full.set(r,off); off+=r.length; }

    // resample to 16k
    function resampleBuffer(buffer, srcRate, dstRate){
      const ratio = srcRate / dstRate; const len = Math.round(buffer.length / ratio); const out = new Float32Array(len);
      let pos = 0; for(let i=0;i<len;i++){ out[i] = buffer[Math.floor(pos)] || 0; pos += ratio; } return out;
    }
    const resampled = resampleBuffer(full, sampleRate, 16000);

    // encode WAV 16-bit
    function encodeWAV(samples, sampleRate){
      const buffer = new ArrayBuffer(44 + samples.length * 2); const view = new DataView(buffer);
      function writeString(view, offset, str){ for(let i=0;i<str.length;i++) view.setUint8(offset+i, str.charCodeAt(i)); }
      let offset2=0; writeString(view, offset2, 'RIFF'); offset2+=4; view.setUint32(offset2, 36 + samples.length*2, true); offset2+=4; writeString(view, offset2, 'WAVE'); offset2+=4;
      writeString(view, offset2, 'fmt '); offset2+=4; view.setUint32(offset2, 16, true); offset2+=4; view.setUint16(offset2,1,true); offset2+=2; view.setUint16(offset2,1,true); offset2+=2;
      view.setUint32(offset2, sampleRate, true); offset2+=4; view.setUint32(offset2, sampleRate*2, true); offset2+=4; view.setUint16(offset2,2,true); offset2+=2; view.setUint16(offset2,16,true); offset2+=2;
      writeString(view, offset2, 'data'); offset2+=4; view.setUint32(offset2, samples.length*2, true); offset2+=4;
      for(let i=0;i<samples.length;i++){ const s=Math.max(-1,Math.min(1,samples[i])); view.setInt16(44+i*2, s<0?s*0x8000:s*0x7FFF, true); }
      return new Blob([view], { type: 'audio/wav' });
    }

    lastBlob = encodeWAV(resampled, 16000);
    playBtn.disabled = false; submitBtn.disabled = false; status.innerText = 'Recording ready ('+lastDuration.toFixed(2)+'s)';
    // cleanup audioContext
    try{ audioContext.close(); }catch(e){}
    recorder = null; recorded = [];
  }

  playBtn.addEventListener('click', ()=>{ if(!lastBlob) return; const url = URL.createObjectURL(lastBlob); const a = new Audio(url); a.play(); });

  submitBtn.addEventListener('click', async ()=>{
    if(!lastBlob) return alert('No recording to submit');
    status.innerText = 'Uploading...';
    try{
      if (sb) {
        const fname = `s${currentSentence.id}_sp${sanitizeFilename(speakerId)}_${Date.now()}.wav`;
        // upload to storage bucket 'recordings'
        const { data: upData, error: upErr } = await sb.storage.from('recordings').upload(fname, lastBlob, { contentType: 'audio/wav' });
        if (upErr) throw upErr;
        // get public url (bucket must allow public access or use signed URL)
        const { publicURL, error: urlErr } = sb.storage.from('recordings').getPublicUrl(upData.path);
        // insert metadata into recordings table
        const { error: insErr } = await sb.from('recordings').insert([{ sentence_id: currentSentence.id, speaker_id: speakerId, storage_path: upData.path, duration_seconds: lastDuration }]);
        if (insErr) throw insErr;
        status.innerText = 'Uploaded: '+upData.path + (publicURL ? ' ('+publicURL+')' : '');
        // fetch next
        lastBlob = null; playBtn.disabled = true; submitBtn.disabled = true; await fetchNext();
      } else {
        // fallback to existing backend
        const fd = new FormData(); fd.append('audio', lastBlob, 'recording.wav'); fd.append('sentence_id', currentSentence.id); fd.append('speaker_id', speakerId); fd.append('duration_seconds', lastDuration);
        const res = await fetch('/api/recordings', { method: 'POST', body: fd }); const j = await res.json(); if(!j.ok) throw new Error(j.error || 'upload failed');
        status.innerText = 'Uploaded: '+j.audio_path; lastBlob = null; playBtn.disabled = true; submitBtn.disabled = true; await fetchNext();
      }
    }catch(err){ console.error(err); status.innerText = 'Upload failed: '+err.message; alert('Upload failed: '+err.message); }
  });

  skipBtn.addEventListener('click', async ()=>{ await fetchNext(); });

  // auto-fetch on load if speaker already set
  if (speakerId) fetchNext();
})();
