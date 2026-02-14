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

    let currentPage = 1;

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
        try {
            const r = await fetch(`/api/data?page=${currentPage}&limit=50`);
            const d = await r.json(); if (!r.ok) throw new Error(d.error);
            renderData(d); renderPagination(d.total, d.page, d.limit);
        } catch (e) { dataTableWrap.innerHTML = '<p style="text-align:center;color:var(--red);padding:20px">' + e.message + '</p>' }
    }

    function renderData(d) {
        let h = '<table class="data-table"><thead><tr><th>#</th><th>ID</th><th>English</th><th>Khasi</th><th>Recordings</th><th>Actions</th></tr></thead><tbody>';
        d.rows.forEach((r, i) => {
            const n = (d.page - 1) * d.limit + i + 1;
            const recCount = r.recordings ? r.recordings.length : 0;
            let recHtml = '<span class="rec-status pending">0 recordings</span>';
            if (recCount > 0) {
                recHtml = '<div style="font-size:.78rem">';
                r.recordings.forEach((rec, ri) => {
                    recHtml += `<div style="margin-bottom:4px;padding:4px 0;${ri > 0 ? 'border-top:1px solid var(--border)' : ''}">
          <div><strong>${esc(rec.contributor_name)}</strong> ${rec.contributor_gender ? '· ' + esc(rec.contributor_gender) : ''} ${rec.contributor_age ? '· ' + rec.contributor_age + 'y' : ''} ${rec.contributor_location ? '· ' + esc(rec.contributor_location) : ''}</div>
          <div style="color:var(--muted)">${rec.duration_seconds ? rec.duration_seconds.toFixed(1) + 's' : '—'} · ${fmtDate(rec.recorded_at)}</div>
          ${rec.audio_path ? '<span class="audio-badge" onclick="playAudio(\'' + escAttr(rec.audio_path) + '\')">🔊 Play</span>' : ''}
        </div>`;
                });
                recHtml += '</div>';
            }
            h += `<tr data-id="${r.id}">
      <td>${n}</td><td>${r.id}</td>
      <td class="wrap editable" data-field="english_text" data-table="sentences">${esc(r.english_text)}</td>
      <td class="wrap editable" data-field="khasi_text" data-table="sentences">${esc(r.khasi_text)}</td>
      <td style="white-space:normal;min-width:200px">${recHtml}</td>
      <td><button class="btn-icon edit-row-btn" title="Edit">✏️</button></td>
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

    function esc(v) { if (!v) return ''; return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }
    function escAttr(v) { if (!v) return ''; return String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') }
    function fmtDate(d) { if (!d) return '—'; const dt = new Date(d); return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' }) + ' ' + dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) }
})();
