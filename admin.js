(function () {
    'use strict';
    const statSentences = document.getElementById('statSentences'), statRecordings = document.getElementById('statRecordings'),
        statSpeakers = document.getElementById('statSpeakers'), dropZone = document.getElementById('dropZone'),
        fileInput = document.getElementById('fileInput'), uploadProgress = document.getElementById('uploadProgress'),
        uploadLabel = document.getElementById('uploadLabel'), uploadFill = document.getElementById('uploadFill'),
        uploadStatus = document.getElementById('uploadStatus'), shareLink = document.getElementById('shareLink'),
        copyLinkBtn = document.getElementById('copyLinkBtn');

    loadStats();
    async function loadStats() {
        try {
            const r = await fetch('/api/summary'); if (!r.ok) throw 0; const d = await r.json();
            statSentences.textContent = Number(d.sentences).toLocaleString();
            statRecordings.textContent = Number(d.recordings).toLocaleString();
            statSpeakers.textContent = Number(d.speakers).toLocaleString();
        } catch (e) { console.error('Stats error', e) }
    }

    shareLink.textContent = window.location.origin + '/record';
    copyLinkBtn.addEventListener('click', () => { navigator.clipboard.writeText(window.location.origin + '/record').then(() => { copyLinkBtn.textContent = 'Copied!'; setTimeout(() => { copyLinkBtn.textContent = 'Copy' }, 2000) }) });

    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('over') });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('over'));
    dropZone.addEventListener('drop', e => { e.preventDefault(); dropZone.classList.remove('over'); if (e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0]) });
    fileInput.addEventListener('change', () => { if (fileInput.files[0]) processFile(fileInput.files[0]) });

    async function processFile(file) {
        uploadStatus.textContent = ''; uploadStatus.className = 'status';
        const ext = file.name.split('.').pop().toLowerCase();
        if (!['xlsx', 'xls', 'csv'].includes(ext)) { uploadStatus.textContent = 'Upload .xlsx, .xls, or .csv'; uploadStatus.className = 'status error'; return }
        uploadProgress.style.display = 'block'; uploadLabel.textContent = 'Reading file…'; uploadFill.style.width = '5%';
        try {
            const buf = await file.arrayBuffer(); const wb = XLSX.read(buf, { type: 'array' });
            const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
            if (!rows.length) throw new Error('No data rows');
            uploadLabel.textContent = rows.length.toLocaleString() + ' rows parsed. Uploading…'; uploadFill.style.width = '15%';
            const B = 500; const total = Math.ceil(rows.length / B); let ins = 0;
            for (let i = 0; i < rows.length; i += B) {
                const chunk = rows.slice(i, i + B), bn = Math.floor(i / B) + 1;
                const r = await fetch('/api/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows: chunk }) });
                if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'Batch failed') }
                const d = await r.json(); ins += d.inserted;
                uploadFill.style.width = (15 + bn / total * 85).toFixed(0) + '%';
                uploadLabel.textContent = 'Batch ' + bn + '/' + total + ' — ' + ins.toLocaleString() + ' inserted';
            }
            uploadFill.style.width = '100%'; uploadStatus.textContent = '✓ Upload complete! ' + ins.toLocaleString() + ' sentences.'; uploadStatus.className = 'status success'; loadStats();
        } catch (err) { console.error(err); uploadStatus.textContent = 'Error: ' + err.message; uploadStatus.className = 'status error' }
    }
})();
