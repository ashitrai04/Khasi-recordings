(function () {
    'use strict';

    /* ── Elements ── */
    const regView = el('regView'), recView = el('recView');
    const regName = el('regName'), regGender = el('regGender'), regAge = el('regAge'), regLocation = el('regLocation'), regBtn = el('regBtn'), regStatus = el('regStatus');
    const speakerNameEl = el('speakerName'), sentenceTableBody = el('sentenceTableBody'), mobileCards = el('mobileCards');
    const submitAllBtn = el('submitAllBtn'), recStatus = el('recStatus'), recPagination = el('recPagination');
    const pageSizeSelect = el('pageSizeSelect'), successOverlay = el('successOverlay'), successMsg = el('successMsg'), successNextBtn = el('successNextBtn');

    let speakerId = '', contributorId = null, speakerGender = '', speakerAge = '', speakerLocation = '', pageSize = 30, totalRemaining = 0;
    let sentences = [], recBlobs = {}; // recBlobs[sentenceId]={blob,duration}
    let saveStatus = {}; // saveStatus[sentenceId] = 'saving' | 'saved' | 'failed'
    let activeRecorder = null, activeCtx = null, activeSentenceId = null, recStartTime = 0, recInterval = null;

    /* ── Helpers ── */
    function el(id) { return document.getElementById(id) }
    function show(v) { v.classList.remove('hidden') } function hide(v) { v.classList.add('hidden') }

    /* ── Registration ── */
    const savedContrib = localStorage.getItem('contributor');
    if (savedContrib) { try { const c = JSON.parse(savedContrib); speakerId = c.speaker_id; contributorId = c.contributor_id; speakerGender = c.gender || ''; speakerAge = c.age || ''; speakerLocation = c.location || ''; hide(regView); show(recView); speakerNameEl.textContent = c.name; loadSentences() } catch (e) { } }

    regBtn.addEventListener('click', doRegister);
    regName.addEventListener('keydown', e => { if (e.key === 'Enter') doRegister() });

    async function doRegister() {
        const name = regName.value.trim();
        if (!name) { regStatus.textContent = 'Name is required'; regStatus.className = 'status error'; return }
        regBtn.disabled = true; regStatus.textContent = 'Saving…'; regStatus.className = 'status';
        speakerGender = regGender.value || '';
        speakerAge = regAge.value || '';
        speakerLocation = regLocation.value.trim() || '';
        try {
            const r = await fetch('/api/contributor', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, gender: regGender.value, age: regAge.value, location: regLocation.value.trim() })
            });
            const d = await r.json(); if (!r.ok) throw new Error(d.error);
            speakerId = d.speaker_id; contributorId = d.contributor_id;
            localStorage.setItem('contributor', JSON.stringify({ speaker_id: speakerId, contributor_id: contributorId, name, gender: speakerGender, age: speakerAge, location: speakerLocation }));
            speakerNameEl.textContent = name; hide(regView); show(recView); loadSentences();
        } catch (e) { regStatus.textContent = e.message; regStatus.className = 'status error' }
        regBtn.disabled = false;
    }

    /* ── Page Size ── */
    pageSizeSelect.addEventListener('change', () => { pageSize = parseInt(pageSizeSelect.value); loadSentences() });

    /* ── Load Sentences ── */
    async function loadSentences() {
        recStatus.textContent = 'Loading sentences…'; recStatus.className = 'status';
        recBlobs = {}; saveStatus = {}; updateSubmitBtn();
        try {
            const r = await fetch(`/api/next-sentence?speaker_id=${encodeURIComponent(speakerId)}&limit=${pageSize}`);
            const d = await r.json(); if (!r.ok) throw new Error(d.error);
            if (d.done || !d.sentences || d.sentences.length === 0) {
                sentenceTableBody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:30px;color:var(--muted)">🎉 All sentences recorded! Thank you!</td></tr>';
                mobileCards.innerHTML = '<div style="text-align:center;padding:30px;color:var(--muted)">🎉 All sentences recorded! Thank you!</div>';
                recPagination.innerHTML = ''; recStatus.textContent = ''; submitAllBtn.disabled = true; return;
            }
            sentences = d.sentences; totalRemaining = d.total || sentences.length;
            renderTable(); renderMobileCards(); renderPagination();
            recStatus.textContent = totalRemaining + ' sentences remaining'; recStatus.className = 'status';
        } catch (e) { recStatus.textContent = 'Error: ' + e.message; recStatus.className = 'status error' }
    }

    /* ── Render ── */
    function renderTable() {
        let h = '';
        sentences.forEach((s, i) => {
            const n = i + 1; const hasRec = !!recBlobs[s.id];
            const ss = saveStatus[s.id];
            const saveLabel = ss === 'saving' ? '<span style="color:var(--accent);font-size:.7rem">Saving…</span>'
                : ss === 'saved' ? '<span style="color:var(--green, #4caf50);font-size:.7rem">Saved ✓</span>'
                : ss === 'failed' ? '<span style="color:var(--red, #f44336);font-size:.7rem">Failed</span>'
                : '';
            h += `<tr id="row-${s.id}">
      <td>${n}</td>
      <td class="wrap editable" style="max-width:180px;cursor:pointer" onclick="editCell(${s.id},'english_text',this)">${esc(s.english_text)}</td>
      <td class="wrap editable" style="max-width:200px;font-weight:600;cursor:pointer" onclick="editCell(${s.id},'khasi_text',this)">${esc(s.khasi_text)}</td>
      <td><div class="rec-cell">
        <button class="btn-icon ${hasRec ? 'recorded' : ''}" onclick="toggleRec(${s.id})" id="recBtn-${s.id}" title="${hasRec ? 'Re-record' : 'Record'}">
          ${hasRec ? '✅' : '🎤'}
        </button>
        <button class="btn-icon" onclick="playRec(${s.id})" id="playBtn-${s.id}" title="Play" ${hasRec ? '' : 'disabled'} style="${hasRec ? '' : 'opacity:.3'}">▶</button>
        <span id="saveStatus-${s.id}">${saveLabel}</span>
      </div></td></tr>`;
        });
        sentenceTableBody.innerHTML = h;
    }

    function renderMobileCards() {
        let h = '';
        sentences.forEach((s, i) => {
            const n = i + 1; const hasRec = !!recBlobs[s.id];
            const ss = saveStatus[s.id];
            const statusBadge = ss === 'saving' ? '<span class="rec-status" style="font-size:.7rem;background:var(--accent,#2196f3);color:#fff">Saving…</span>'
                : ss === 'saved' ? '<span class="rec-status done" style="font-size:.7rem">Saved ✓</span>'
                : ss === 'failed' ? '<span class="rec-status" style="font-size:.7rem;background:var(--red,#f44336);color:#fff">Failed</span>'
                : hasRec ? '<span class="rec-status done" style="font-size:.7rem">Recorded</span>'
                : '<span class="rec-status pending" style="font-size:.7rem">Pending</span>';
            h += `<div class="mobile-rec-row" id="mrow-${s.id}">
      <div class="serial">#${n}</div>
      <div class="khasi editable" style="cursor:pointer" onclick="editCell(${s.id},'khasi_text',this)">${esc(s.khasi_text)}</div>
      <div class="english editable" style="cursor:pointer" onclick="editCell(${s.id},'english_text',this)">${esc(s.english_text)}</div>
      <div class="actions">
        <button class="btn-icon ${hasRec ? 'recorded' : ''}" onclick="toggleRec(${s.id})" id="mrecBtn-${s.id}" title="${hasRec ? 'Re-record' : 'Record'}">${hasRec ? '✅' : '🎤'}</button>
        <button class="btn-icon" onclick="playRec(${s.id})" id="mplayBtn-${s.id}" ${hasRec ? '' : 'disabled'} style="${hasRec ? '' : 'opacity:.3'}">▶</button>
        <span id="msaveStatus-${s.id}">${statusBadge}</span>
      </div>
    </div>`;
        });
        mobileCards.innerHTML = h;
    }

    function renderPagination() {
        const total = totalRemaining;
        let h = `<span class="info">${sentences.length} shown · ${total} remaining</span>`;
        if (total > pageSize) h += `<button class="page-btn" onclick="nextPage()">Next ›</button>`;
        recPagination.innerHTML = h;
    }

    window.nextPage = function () { loadSentences(); window.scrollTo(0, 0) };

    /* ── Recording Logic ── */
    window.toggleRec = async function (sid) {
        // If already recording this sentence, stop
        if (activeSentenceId === sid) { stopRecording(); return }
        // If recording another, stop that first
        if (activeSentenceId !== null) stopRecording();
        // Start recording this sentence
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            activeCtx = new (window.AudioContext || window.webkitAudioContext)();
            const source = activeCtx.createMediaStreamSource(stream);
            const proc = activeCtx.createScriptProcessor(4096, 1, 1);
            const chunks = [];
            proc.onaudioprocess = e => { chunks.push(new Float32Array(e.inputBuffer.getChannelData(0))) };
            source.connect(proc); proc.connect(activeCtx.destination);
            activeSentenceId = sid; recStartTime = Date.now();
            activeRecorder = { stream, source, processor: proc, chunks };
            // Update UI
            updateRecUI(sid, true);
            recStatus.textContent = '🔴 Recording sentence #' + sid + '…'; recStatus.className = 'status error';
        } catch (e) {
            alert(e.name === 'NotAllowedError' ? 'Microphone permission denied' : 'Mic error: ' + e.message);
        }
    };

    function stopRecording() {
        if (!activeRecorder || activeSentenceId === null) return;
        const dur = (Date.now() - recStartTime) / 1000;
        const sr = activeCtx.sampleRate;
        const chunks = activeRecorder.chunks;
        activeRecorder.processor.disconnect(); activeRecorder.source.disconnect();
        activeRecorder.stream.getTracks().forEach(t => t.stop());
        try { activeCtx.close() } catch (_) { }
        // Build WAV
        const raw = concatF32(chunks); const wav = buildWav(raw, sr, 16000);
        const sid = activeSentenceId;
        recBlobs[sid] = { blob: wav, duration: dur };
        updateRecUI(sid, false);
        activeSentenceId = null; activeRecorder = null; activeCtx = null;
        recStatus.textContent = '✓ Recorded ' + dur.toFixed(1) + 's for sentence #' + sid; recStatus.className = 'status success';
        updateSubmitBtn();
        // Auto-save immediately in background (fire and forget)
        autoSave(sid);
    }

    function updateRecUI(sid, isRecording) {
        // Desktop
        const btn = document.getElementById('recBtn-' + sid);
        const playB = document.getElementById('playBtn-' + sid);
        // Mobile
        const mbtn = document.getElementById('mrecBtn-' + sid);
        const mplayB = document.getElementById('mplayBtn-' + sid);

        if (isRecording) {
            if (btn) { btn.className = 'btn-icon recording'; btn.textContent = '⏹' }
            if (mbtn) { mbtn.className = 'btn-icon recording'; mbtn.textContent = '⏹' }
        } else {
            const has = !!recBlobs[sid];
            if (btn) { btn.className = 'btn-icon' + (has ? ' recorded' : ''); btn.textContent = has ? '✅' : '🎤' }
            if (playB) { playB.disabled = !has; playB.style.opacity = has ? '1' : '.3' }
            if (mbtn) { mbtn.className = 'btn-icon' + (has ? ' recorded' : ''); mbtn.textContent = has ? '✅' : '🎤' }
            if (mplayB) { mplayB.disabled = !has; mplayB.style.opacity = has ? '1' : '.3' }
        }
    }

    function updateSubmitBtn() {
        const totalRec = Object.keys(recBlobs).length;
        const unsaved = Object.keys(recBlobs).filter(id => saveStatus[id] !== 'saved').length;
        submitAllBtn.disabled = totalRec === 0;
        if (unsaved > 0) {
            submitAllBtn.textContent = `✓ Submit ${unsaved} Recording${unsaved > 1 ? 's' : ''}`;
        } else if (totalRec > 0) {
            submitAllBtn.textContent = `✓ All ${totalRec} Saved!`;
        } else {
            submitAllBtn.textContent = '✓ Submit All Recordings';
        }
    }

    /* ── Auto-Save (background upload after each recording) ── */
    function autoSave(sid) {
        saveStatus[sid] = 'saving';
        updateSaveUI(sid);

        blobTo64(recBlobs[sid].blob).then(b64 => {
            const payload = { recordings: [{
                sentence_id: sid,
                speaker_id: speakerId,
                contributor_id: contributorId,
                duration_seconds: recBlobs[sid].duration,
                audio: b64,
                speaker_gender: speakerGender,
                speaker_age: speakerAge,
                speaker_location: speakerLocation
            }] };
            return fetch('/api/record', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        }).then(res => res.json()).then(d => {
            if (d.ok || (d.results && d.results.some(r => r.ok))) {
                saveStatus[sid] = 'saved';
            } else {
                saveStatus[sid] = 'failed';
            }
            updateSaveUI(sid);
            updateSubmitBtn();
        }).catch(e => {
            console.error('Auto-save failed for sentence', sid, e);
            saveStatus[sid] = 'failed';
            updateSaveUI(sid);
            updateSubmitBtn();
        });
    }

    function updateSaveUI(sid) {
        const ss = saveStatus[sid];
        // Desktop
        const el1 = document.getElementById('saveStatus-' + sid);
        // Mobile
        const el2 = document.getElementById('msaveStatus-' + sid);

        let desktopHtml = '', mobileHtml = '';
        if (ss === 'saving') {
            desktopHtml = '<span style="color:var(--accent,#2196f3);font-size:.7rem">Saving…</span>';
            mobileHtml = '<span class="rec-status" style="font-size:.7rem;background:var(--accent,#2196f3);color:#fff">Saving…</span>';
        } else if (ss === 'saved') {
            desktopHtml = '<span style="color:var(--green,#4caf50);font-size:.7rem">Saved ✓</span>';
            mobileHtml = '<span class="rec-status done" style="font-size:.7rem">Saved ✓</span>';
        } else if (ss === 'failed') {
            desktopHtml = '<span style="color:var(--red,#f44336);font-size:.7rem">Failed</span>';
            mobileHtml = '<span class="rec-status" style="font-size:.7rem;background:var(--red,#f44336);color:#fff">Failed</span>';
        }

        if (el1) el1.innerHTML = desktopHtml;
        if (el2) el2.innerHTML = mobileHtml;
    }

    /* ── Playback ── */
    window.playRec = function (sid) {
        const r = recBlobs[sid]; if (!r) return;
        const url = URL.createObjectURL(r.blob); const a = new Audio(url); a.play(); a.onended = () => URL.revokeObjectURL(url);
    };

    /* ── Batch Submit (only unsaved recordings) ── */
    submitAllBtn.addEventListener('click', doSubmit);
    async function doSubmit() {
        const unsavedIds = Object.keys(recBlobs).filter(id => saveStatus[id] !== 'saved');
        // If all already auto-saved, show success!
        if (unsavedIds.length === 0) {
            const totalSaved = Object.keys(recBlobs).length;
            if (totalSaved > 0) {
                successMsg.textContent = `${totalSaved} recording${totalSaved > 1 ? 's' : ''} saved successfully!`;
                successOverlay.classList.add('show');
            }
            return;
        }
        submitAllBtn.disabled = true;
        let submitted = 0, failed = 0;
        for (let i = 0; i < unsavedIds.length; i++) {
            const sid = parseInt(unsavedIds[i]); const r = recBlobs[sid];
            recStatus.textContent = `Uploading ${i + 1}/${unsavedIds.length}…`; recStatus.className = 'status';
            try {
                const b64 = await blobTo64(r.blob);
                const payload = { recordings: [{
                    sentence_id: sid,
                    speaker_id: speakerId,
                    contributor_id: contributorId,
                    duration_seconds: r.duration,
                    audio: b64,
                    speaker_gender: speakerGender,
                    speaker_age: speakerAge,
                    speaker_location: speakerLocation
                }] };
                const res = await fetch('/api/record', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                const d = await res.json();
                if (!res.ok) throw new Error(d.error || 'Upload failed');
                saveStatus[sid] = 'saved';
                updateSaveUI(sid);
                submitted++;
            } catch (e) {
                console.error('Failed sentence', sid, e.message);
                saveStatus[sid] = 'failed';
                updateSaveUI(sid);
                failed++;
            }
        }
        if (failed === 0) {
            const totalSaved = Object.keys(recBlobs).length;
            successMsg.textContent = `${totalSaved} recording${totalSaved > 1 ? 's' : ''} saved successfully!`;
            successOverlay.classList.add('show');
        } else {
            recStatus.textContent = `${submitted} uploaded, ${failed} failed. Try again.`; recStatus.className = 'status error';
            submitAllBtn.disabled = false;
        }
        updateSubmitBtn();
    }

    successNextBtn.addEventListener('click', () => { successOverlay.classList.remove('show'); loadSentences() });

    /* ── Audio Utils ── */
    function concatF32(ch) { const l = ch.reduce((s, c) => s + c.length, 0); const o = new Float32Array(l); let p = 0; for (const c of ch) { o.set(c, p); p += c.length } return o }
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
    function blobTo64(b) { return new Promise((ok, no) => { const r = new FileReader(); r.onloadend = () => ok(r.result.split(',')[1]); r.onerror = no; r.readAsDataURL(b) }) }
    function esc(v) { if (!v) return ''; return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }
    function escAttr(v) { if (!v) return ''; return String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;') }

    /* ── Inline Editing ── */
    window.editCell = function (sid, field, cell) {
        if (cell.querySelector('input')) return; // already editing
        const oldVal = cell.textContent;
        cell.innerHTML = `<input class="edit-input" value="${escAttr(oldVal)}" onblur="saveCell(${sid},'${field}',this)" onkeydown="if(event.key==='Enter')this.blur()" style="width:100%">`;
        cell.querySelector('input').focus();
    };

    window.saveCell = async function (sid, field, input) {
        const newVal = input.value;
        const cell = input.parentElement;
        cell.textContent = newVal;
        // Update local sentence data
        const s = sentences.find(x => x.id === sid);
        if (s) s[field] = newVal;
        // Save to server
        try {
            await fetch('/api/data', {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ table: 'sentences', id: sid, updates: { [field]: newVal } })
            });
        } catch (e) { console.error('Save failed:', e) }
    };
})();
