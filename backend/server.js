/*
Backend server moved to `backend/server.js` so Vercel will not try to run
the full Express server. This file is for local development only.

To run locally:
  npm run dev    # uses nodemon
  or
  npm run local  # direct node

*/

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const XLSX = require('xlsx');
const bodyParser = require('body-parser');
const cors = require('cors');

const PORT = process.env.PORT || 3000;
// use project root as base so uploads/recordings/data.sqlite are in repo root
const BASE_DIR = path.join(__dirname, '..');
const UPLOAD_DIR = path.join(BASE_DIR, 'uploads');
const RECORDINGS_DIR = path.join(BASE_DIR, 'recordings');

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(RECORDINGS_DIR)) fs.mkdirSync(RECORDINGS_DIR, { recursive: true });

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(BASE_DIR, 'public')));

// Setup multer
const upload = multer({ dest: UPLOAD_DIR });

let db;
(async function initDb() {
  db = await open({
    filename: path.join(BASE_DIR, 'data.sqlite'),
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS sentences (
      id INTEGER PRIMARY KEY,
      english_text TEXT,
      khasi_text TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS recordings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sentence_id INTEGER,
      speaker_id TEXT,
      audio_path TEXT,
      duration_seconds REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
})();

// Admin upload: accepts xlsx or csv
app.post('/admin/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const filePath = req.file.path;
    const workbook = XLSX.readFile(filePath, { cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    // Expected columns: id (optional), english_text, khasi_text
    const insertStmt = await db.prepare(`INSERT OR REPLACE INTO sentences (id, english_text, khasi_text) VALUES (?, ?, ?)`);
    for (const r of rows) {
      const id = r.id || r.ID || r.Id || null;
      const english = r.english_text || r.english || r.English || '';
      const khasi = r.khasi_text || r.khasi || r.Khasi || '';
      if (!khasi) continue; // skip empty
      if (id) {
        await insertStmt.run(id, english, khasi);
      } else {
        await insertStmt.run(null, english, khasi);
      }
    }
    await insertStmt.finalize();
    fs.unlinkSync(filePath);
    res.json({ ok: true, inserted: rows.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Get next sentence for speaker
app.get('/api/next', async (req, res) => {
  try {
    const speaker_id = req.query.speaker_id;
    if (!speaker_id) return res.status(400).json({ error: 'speaker_id required' });

    // Select sentences not yet recorded by this speaker; prefer ones with few recordings overall
    const row = await db.get(
      `SELECT s.*, (
         SELECT COUNT(*) FROM recordings r WHERE r.sentence_id = s.id
       ) AS rec_count
       FROM sentences s
       WHERE s.id NOT IN (SELECT sentence_id FROM recordings WHERE speaker_id = ?)
       ORDER BY rec_count ASC, s.id ASC
       LIMIT 1`,
      speaker_id
    );

    if (!row) return res.json({ ok: false, message: 'no_more' });
    res.json({ ok: true, sentence: row });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Receive recording upload
const audioUpload = multer({ dest: UPLOAD_DIR });
app.post('/api/recordings', audioUpload.single('audio'), async (req, res) => {
  try {
    const { sentence_id, speaker_id, duration_seconds } = req.body;
    if (!req.file) return res.status(400).json({ error: 'audio file required' });
    if (!sentence_id || !speaker_id) return res.status(400).json({ error: 'sentence_id and speaker_id required' });

    // Create deterministic name
    const timestamp = Date.now();
    const ext = path.extname(req.file.originalname) || '.webm';
    const fname = `s${sentence_id}_sp${sanitizeFilename(speaker_id)}_${timestamp}${ext}`;
    const dest = path.join(RECORDINGS_DIR, fname);
    fs.renameSync(req.file.path, dest);

    const audio_path = `recordings/${fname}`;
    // Insert recording: ensure audio_path is the 3rd parameter and duration_seconds the 4th
    await db.run(`INSERT INTO recordings (sentence_id, speaker_id, audio_path, duration_seconds) VALUES (?, ?, ?, ?)`,
      sentence_id, speaker_id, audio_path, duration_seconds || null);

    res.json({ ok: true, audio_path });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

function sanitizeFilename(s) {
  return s.replace(/[^a-z0-9-_]/gi, '_').slice(0, 60);
}

// Admin export: produce CSV with most recent recording per sentence
app.get('/admin/export', async (req, res) => {
  try {
    const rows = await db.all(`
      SELECT s.id, s.english_text, s.khasi_text,
        r.audio_path, r.speaker_id, r.duration_seconds, r.created_at as recorded_at
      FROM sentences s
      LEFT JOIN recordings r ON r.id = (
        SELECT id FROM recordings rr WHERE rr.sentence_id = s.id ORDER BY rr.created_at DESC LIMIT 1
      )
      ORDER BY s.id ASC
    `);

    // Build CSV
    const headers = ['id','english_text','khasi_text','audio_file_url','speaker_id','recorded_at','duration_seconds'];
    const lines = [headers.join(',')];
    for (const r of rows) {
      const line = [
        csvSafe(r.id),
        csvSafe(r.english_text),
        csvSafe(r.khasi_text),
        csvSafe(r.audio_path || ''),
        csvSafe(r.speaker_id || ''),
        csvSafe(r.recorded_at || ''),
        csvSafe(r.duration_seconds || '')
      ].join(',');
      lines.push(line);
    }
    const csv = lines.join('\n');
    res.setHeader('Content-disposition', 'attachment; filename=enriched_export.csv');
    res.setHeader('Content-Type', 'text/csv');
    res.send(csv);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

function csvSafe(v) {
  if (v === null || v === undefined) return '';
  const s = String(v).replace(/"/g, '""');
  if (s.includes(',') || s.includes('\n') || s.includes('"')) return `"${s}"`;
  return s;
}

// simple admin list endpoint
app.get('/admin/summary', async (req, res) => {
  try {
    const total = await db.get('SELECT COUNT(*) as c FROM sentences');
    const recs = await db.get('SELECT COUNT(*) as c FROM recordings');
    res.json({ sentences: total.c, recordings: recs.c });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fallback
app.use((req, res) => {
  res.status(404).send('Not found');
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
