# Khasi Speech Collection Platform

**Stack:** Vercel Serverless + Supabase + Vanilla JS

## Setup
1. Run `setup.sql` in Supabase SQL Editor
2. Create `recordings` storage bucket (Public) in Supabase
3. Set env vars in Vercel: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
4. Deploy: `npx vercel --prod`

## Pages
- `/` or `/record` — Contributor recording page
- `/admin.html` — Admin dashboard (upload, stats, export)

## API Routes
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/upload` | Batch insert sentences |
| GET | `/api/next-sentence?speaker_id=X` | Get next sentence |
| POST | `/api/record` | Upload audio recording |
| GET | `/api/export` | Download enriched CSV |
| GET | `/api/summary` | Dashboard stats |
