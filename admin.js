(function () {
    'use strict';

    /* ── Elements ── */
    const loginView = el('loginView'), dashView = el('dashView'), uploadView = el('uploadView'), dataView = el('dataView');
    const loginUser = el('loginUser'), loginPass = el('loginPass'), loginBtn = el('loginBtn'), loginStatus = el('loginStatus');
    const adminName = el('adminName'), logoutBtn = el('logoutBtn');
    const statSentences = el('statSentences'), statRecordings = el('statRecordings'), statSpeakers = el('statSpeakers');
    const goUpload = el('goUpload'), goData = el('goData');
    const shareLink = el('shareLink'), copyLinkBtn = el('copyLinkBtn');
    const dropZone = el('dropZone'), fileInput = el('fileInput'), uploadProgress = el('uploadProgress'), uploadLabel = el('uploadLabel'), uploadFill = el('uploadFill'), uploadStatus = el('uploadStatus');
    const backFromUpload = el('backFromUpload'), backFromData = el('backFromData');
    const dataTableWrap = el('dataTableWrap'), dataPagination = el('dataPagination');
    const filterSpeaker = el('filterSpeaker'), filterRecorded = el('filterRecorded'), filterSort = el('filterSort');
    const applyFilters = el('applyFilters'), resetFilters = el('resetFilters');

    let currentPage = 1;
    let activeRecorder = null, activeCtx = null, activeSentenceId = null, recStartTime = 0;
    let selectedIds = new Set();

    function el(id) { return document.getElementById(id) }
    function show(v) { v.classList.remove('hidden') } function hide(v) { v.classList.add('hidden') }
    function showView(v) { [loginView, dashView, uploadView, dataView].forEach(x => hide(x)); show(v) }

    /* ── Auth ── */
    const saved = sessionStorage.getItem('admin_user');
    if (saved) { adminName.textContent = saved; showView(dashView); loadStats() }

    loginBtn.addEventListener('click', doLogin);
    loginPass.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin() });
    loginUser.addEventListener('keydown', e => { if (e.key === 'Enter') loginPass.focus() });

    async function doLogin() {
        const u = loginUser.value.trim(), p = loginPass.value;
        if (!u || !p) { loginStatus.textContent = 'Enter both fields'; loginStatus.className = 'status error'; return }
        loginBtn.disabled = true; loginStatus.textContent = 'Logging in…'; loginStatus.className = 'status';
        try {
            const r = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) });
            const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Login failed');
            sessionStorage.setItem('admin_user', d.username); adminName.textContent = d.username; showView(dashView); loadStats();
        } catch (e) { loginStatus.textContent = e.message; loginStatus.className = 'status error' }
        loginBtn.disabled = false;
    }
    logoutBtn.addEventListener('click', e => { e.preventDefault(); sessionStorage.removeItem('admin_user'); showView(loginView); loginUser.value = ''; loginPass.value = ''; loginStatus.textContent = '' });

    /* ── Dashboard ── */
    async function loadStats() {
        try {
            const r = await fetch('/api/summary'); const d = await r.json();
            statSentences.textContent = Number(d.sentences || 0).toLocaleString();
            statRecordings.textContent = Number(d.recordings || 0).toLocaleString();
            statSpeakers.textContent = Number(d.speakers || 0).toLocaleString();
        } catch (e) { console.error(e) }
        shareLink.textContent = location.origin + '/record';
    }
    copyLinkBtn.addEventListener('click', () => { navigator.clipboard.writeText(location.origin + '/record').then(() => { copyLinkBtn.textContent = 'Copied!'; setTimeout(() => copyLinkBtn.textContent = 'Copy', 2000) }) });

    goUpload.addEventListener('click', () => showView(uploadView));
    goData.addEventListener('click', () => { showView(dataView); currentPage = 1; loadData() });
    backFromUpload.addEventListener('click', () => { showView(dashView); loadStats() });
    backFromData.addEventListener('click', () => { showView(dashView); loadStats() });

    /* ── Filters ── */
    applyFilters.addEventListener('click', () => { currentPage = 1; loadData() });
    resetFilters.addEventListener('click', () => {
        filterSpeaker.value = ''; filterRecorded.value = ''; filterSort.value = 'recorded_first';
        currentPage = 1; loadData();
    });

    /* ── Upload ── */
    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('over') });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('over'));
    dropZone.addEventListener('drop', e => { e.preventDefault(); dropZone.classList.remove('over'); if (e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0]) });
    fileInput.addEventListener('change', () => { if (fileInput.files[0]) processFile(fileInput.files[0]) });

    async function processFile(file) {
        uploadStatus.textContent = ''; uploadStatus.className = 'status';
        if (file.size > 50 * 1024 * 1024) { uploadStatus.textContent = 'File exceeds 50 MB limit'; uploadStatus.className = 'status error'; return }
        const ext = file.name.split('.').pop().toLowerCase();
        if (!['xlsx', 'xls', 'csv'].includes(ext)) { uploadStatus.textContent = 'Only .xlsx, .xls, .csv accepted'; uploadStatus.className = 'status error'; return }
        show(uploadProgress); uploadLabel.textContent = 'Reading file…'; uploadFill.style.width = '5%';
        try {
            const buf = await file.arrayBuffer(); const wb = XLSX.read(buf, { type: 'array' });
            const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
            if (!rows.length) throw new Error('No data rows found');
            uploadLabel.textContent = rows.length.toLocaleString() + ' rows. Uploading…'; uploadFill.style.width = '15%';
            const B = 500; const total = Math.ceil(rows.length / B); let ins = 0;
            for (let i = 0; i < rows.length; i += B) {
                const chunk = rows.slice(i, i + B), bn = Math.floor(i / B) + 1;
                const r = await fetch('/api/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows: chunk }) });
                if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'Batch failed') }
                const d = await r.json(); ins += d.inserted;
                uploadFill.style.width = (15 + bn / total * 85).toFixed(0) + '%';
                uploadLabel.textContent = 'Batch ' + bn + '/' + total + ' — ' + ins.toLocaleString() + ' inserted';
            }
            uploadFill.style.width = '100%'; uploadStatus.textContent = '✓ Done! ' + ins.toLocaleString() + ' sentences uploaded.'; uploadStatus.className = 'status success';
        } catch (err) { uploadStatus.textContent = 'Error: ' + err.message; uploadStatus.className = 'status error' }
    }

    /* ── Unified Data Viewer ── */
    async function loadData() {
        dataTableWrap.innerHTML = '<p style="text-align:center;color:var(--muted);padding:30px">Loading…</p>';
        dataPagination.innerHTML = '';
        selectedIds.clear(); updateBulkBar();
        try {
            const params = new URLSearchParams({ page: currentPage, limit: 50, sort: filterSort.value });
            if (filterSpeaker.value) params.set('speaker', filterSpeaker.value);
            if (filterRecorded.value) params.set('recorded', filterRecorded.value);
            const r = await fetch('/api/data?' + params.toString());
            const d = await r.json(); if (!r.ok) throw new Error(d.error);
            // Populate speaker dropdown
            if (d.speakers && d.speakers.length > 0) {
                const cur = filterSpeaker.value;
                filterSpeaker.innerHTML = '<option value="">All Speakers</option>';
                d.speakers.forEach(s => {
                    const opt = document.createElement('option');
                    opt.value = s; opt.textContent = s;
                    if (s === cur) opt.selected = true;
                    filterSpeaker.appendChild(opt);
                });
            }
            renderData(d); renderPagination(d.total, d.page, d.limit);
        } catch (e) { dataTableWrap.innerHTML = '<p style="text-align:center;color:var(--red);padding:20px">' + e.message + '</p>' }
    }

    function renderData(d) {
        let h = '<div class="bulk-bar hidden" id="bulkBar"><span id="bulkCount">0 selected</span><button class="btn btn-danger btn-sm" onclick="bulkDelete()">🗑 Delete Selected</button></div>';
        h += '<table class="data-table"><thead><tr>';
        h += '<th style="width:36px"><input type="checkbox" id="selectAll" onchange="toggleSelectAll(this.checked)" /></th>';
        h += '<th>ID</th><th>English</th><th>Khasi</th>';
        h += '<th>Speaker</th><th>Gender</th><th>Age</th>';
        h += '<th>Record</th><th>Duration</th><th>Actions</th>';
        h += '</tr></thead><tbody>';
        d.rows.forEach((r) => {
            const recCount = r.recordings ? r.recordings.length : 0;
            // Get latest recording info for speaker columns
            const latest = recCount > 0 ? r.recordings[0] : null;
            const speakerName = latest ? esc(latest.contributor_name || latest.speaker_id) : '—';
            const speakerGender = latest ? esc(latest.contributor_gender) || '—' : '—';
            const speakerAge = latest ? (latest.contributor_age || '—') : '—';
            const duration = latest && latest.duration_seconds ? latest.duration_seconds.toFixed(1) + 's' : '—';

            let recHtml = '';
            if (recCount > 1) {
                // Show additional recordings beyond the first
                recHtml = '<details style="font-size:.72rem;margin-top:4px"><summary style="cursor:pointer;color:var(--accent)">+' + (recCount - 1) + ' more</summary>';
                r.recordings.slice(1).forEach(rec => {
                    const n = esc(rec.contributor_name || rec.speaker_id);
                    recHtml += `<div style="padding:3px 0;border-top:1px solid var(--border)">👤 ${n} · ${rec.duration_seconds ? rec.duration_seconds.toFixed(1) + 's' : '—'} · ${fmtDate(rec.recorded_at)} ${rec.audio_path ? '<span class="audio-badge" onclick="playAudio(\'' + escAttr(rec.audio_path) + '\')">🔊</span>' : ''}</div>`;
                });
                recHtml += '</details>';
            }

            h += `<tr data-id="${r.id}">
      <td><input type="checkbox" class="row-check" value="${r.id}" onchange="toggleRowCheck(${r.id},this.checked)" ${selectedIds.has(r.id) ? 'checked' : ''} /></td>
      <td>${r.id}</td>
      <td class="wrap editable" data-field="english_text" data-table="sentences">${esc(r.english_text)}</td>
      <td class="wrap editable" data-field="khasi_text" data-table="sentences">${esc(r.khasi_text)}</td>
      <td style="font-weight:600">${speakerName}</td>
      <td>${speakerGender}</td>
      <td>${speakerAge}</td>
      <td><div class="rec-cell">
        <button class="btn-icon" onclick="adminRec(${r.id})" id="adminRecBtn-${r.id}" title="Record">🎤</button>
        <button class="btn-icon" onclick="adminPlay(${r.id})" id="adminPlayBtn-${r.id}" title="Play" disabled style="opacity:.3">▶</button>
        <button class="btn btn-xs btn-primary hidden" onclick="adminUpload(${r.id})" id="adminUpBtn-${r.id}">Upload</button>
        ${latest && latest.audio_path ? '<span class="audio-badge" onclick="playAudio(\'' + escAttr(latest.audio_path) + '\')" title="Play existing">🔊</span>' : ''}
      </div></td>
      <td>${duration}${recHtml}</td>
      <td><div style="display:flex;gap:4px">
        <button class="btn-icon edit-row-btn" title="Edit">✏️</button>
        <button class="btn-icon" onclick="deleteSingle(${r.id})" title="Delete" style="color:var(--red)">🗑</button>
      </div></td>
    </tr>`;
        });
        h += '</tbody></table>'; dataTableWrap.innerHTML = h; attachEditing();
    }

    function renderPagination(total, page, limit) {
        const pages = Math.ceil(total / limit); if (pages <= 1) { dataPagination.innerHTML = `<span class="info">${total} sentence${total !== 1 ? 's' : ''}</span>`; return }
        let h = `<span class="info">${total} sentences · Page ${page}/${pages}</span>`;
        h += `<button class="page-btn" ${page <= 1 ? 'disabled' : ''}onclick="goPage(${page - 1})">‹ Prev</button>`;
        const start = Math.max(1, page - 2), end = Math.min(pages, page + 2);
        if (start > 1) h += '<button class="page-btn" onclick="goPage(1)">1</button>';
        if (start > 2) h += '<span style="color:var(--muted)">…</span>';
        for (let i = start; i <= end; i++)h += `<button class="page-btn${i === page ? ' active' : ''}" onclick="goPage(${i})">${i}</button>`;
        if (end < pages - 1) h += '<span style="color:var(--muted)">…</span>';
        if (end < pages) h += `<button class="page-btn" onclick="goPage(${pages})">${pages}</button>`;
        h += `<button class="page-btn" ${page >= pages ? 'disabled' : ''}onclick="goPage(${page + 1})">Next ›</button>`;
        dataPagination.innerHTML = h;
    }
    window.goPage = function (p) { currentPage = p; loadData() };

    /* ── Selection & Delete ── */
    window.toggleSelectAll = function (checked) {
        document.querySelectorAll('.row-check').forEach(cb => {
            cb.checked = checked;
            const id = parseInt(cb.value);
            if (checked) selectedIds.add(id); else selectedIds.delete(id);
        });
        updateBulkBar();
    };
    window.toggleRowCheck = function (id, checked) {
        if (checked) selectedIds.add(id); else selectedIds.delete(id);
        const all = document.getElementById('selectAll');
        const total = document.querySelectorAll('.row-check').length;
        if (all) all.checked = selectedIds.size === total && total > 0;
        updateBulkBar();
    };
    function updateBulkBar() {
        const bar = document.getElementById('bulkBar');
        const cnt = document.getElementById('bulkCount');
        if (!bar) return;
        if (selectedIds.size > 0) { bar.classList.remove('hidden'); cnt.textContent = selectedIds.size + ' selected'; }
        else { bar.classList.add('hidden'); }
    }
    window.deleteSingle = async function (id) {
        if (!confirm('Delete sentence #' + id + ' and all its recordings?')) return;
        try {
            const r = await fetch('/api/data', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [id] }) });
            if (!r.ok) { const d = await r.json(); throw new Error(d.error); }
            loadData();
        } catch (e) { alert('Delete failed: ' + e.message) }
    };
    window.bulkDelete = async function () {
        const ids = Array.from(selectedIds);
        if (!confirm('Delete ' + ids.length + ' sentence(s) and all their recordings?')) return;
        try {
            const r = await fetch('/api/data', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) });
            if (!r.ok) { const d = await r.json(); throw new Error(d.error); }
            loadData();
        } catch (e) { alert('Delete failed: ' + e.message) }
    };

    /* ── Admin Recording ── */
    const adminRecBlobs = {};

    window.adminRec = async function (sid) {
        if (activeSentenceId === sid) { stopAdminRec(); return }
        if (activeSentenceId !== null) stopAdminRec();
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
            const btn = document.getElementById('adminRecBtn-' + sid);
            if (btn) { btn.className = 'btn-icon recording'; btn.textContent = '⏹' }
        } catch (e) { alert('Mic error: ' + e.message) }
    };

    function stopAdminRec() {
        if (!activeRecorder || activeSentenceId === null) return;
        const dur = (Date.now() - recStartTime) / 1000;
        const sr = activeCtx.sampleRate; const chunks = activeRecorder.chunks;
        activeRecorder.processor.disconnect(); activeRecorder.source.disconnect();
        activeRecorder.stream.getTracks().forEach(t => t.stop());
        try { activeCtx.close() } catch (_) { }
        const raw = concatF32(chunks); const wav = buildWav(raw, sr, 16000);
        const sid = activeSentenceId;
        adminRecBlobs[sid] = { blob: wav, duration: dur };
        activeSentenceId = null; activeRecorder = null; activeCtx = null;
        const btn = document.getElementById('adminRecBtn-' + sid);
        if (btn) { btn.className = 'btn-icon recorded'; btn.textContent = '✅' }
        const playB = document.getElementById('adminPlayBtn-' + sid);
        if (playB) { playB.disabled = false; playB.style.opacity = '1' }
        const upB = document.getElementById('adminUpBtn-' + sid);
        if (upB) { upB.classList.remove('hidden') }
    }

    window.adminPlay = function (sid) {
        const r = adminRecBlobs[sid]; if (!r) return;
        const url = URL.createObjectURL(r.blob); const a = new Audio(url); a.play(); a.onended = () => URL.revokeObjectURL(url);
    };

    window.adminUpload = async function (sid) {
        const r = adminRecBlobs[sid]; if (!r) return;
        const upB = document.getElementById('adminUpBtn-' + sid);
        if (upB) { upB.disabled = true; upB.textContent = 'Uploading…' }
        try {
            const b64 = await blobTo64(r.blob);
            const adminUser = sessionStorage.getItem('admin_user') || 'admin';
            const res = await fetch('/api/record', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ recordings: [{ sentence_id: sid, speaker_id: adminUser, duration_seconds: r.duration, audio: b64 }] })
            });
            const d = await res.json(); if (!res.ok) throw new Error(d.error);
            if (upB) { upB.textContent = '✓ Done'; upB.className = 'btn btn-xs btn-success' }
            delete adminRecBlobs[sid];
            setTimeout(() => loadData(), 1500);
        } catch (e) { if (upB) { upB.disabled = false; upB.textContent = 'Retry' } alert('Upload failed: ' + e.message) }
    };

    /* ── Inline Editing ── */
    function attachEditing() {
        document.querySelectorAll('.edit-row-btn').forEach(btn => {
            btn.addEventListener('click', function () {
                const row = this.closest('tr'); const id = row.dataset.id;
                const cells = row.querySelectorAll('.editable');
                if (this.dataset.editing === 'true') {
                    const updates = {};
                    cells.forEach(c => { const inp = c.querySelector('.edit-input'); if (inp) { updates[c.dataset.field] = inp.value; c.textContent = inp.value } });
                    this.textContent = '✏️'; this.dataset.editing = 'false';
                    saveEdit(id, updates, cells[0]?.dataset.table || 'sentences');
                } else {
                    cells.forEach(c => { const v = c.textContent; c.innerHTML = `<input class="edit-input" value="${escAttr(v)}">` });
                    this.textContent = '💾'; this.dataset.editing = 'true';
                }
            });
        });
    }

    async function saveEdit(id, updates, table) {
        try {
            const r = await fetch('/api/data', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ table, id: Number(id), updates }) });
            if (!r.ok) throw new Error('Save failed');
        } catch (e) { alert('Save failed: ' + e.message) }
    }

    window.playAudio = function (url) { const a = new Audio(url); a.play() };

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
    function escAttr(v) { if (!v) return ''; return String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') }
    function fmtDate(d) { if (!d) return '—'; const dt = new Date(d); return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' }) + ' ' + dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) }
})();
