Khasi Speech Collector — Deploy to Vercel + Supabase

Overview
This project includes a simple contributor frontend and a Node backend for local use. To host the frontend on Vercel and store audio and data persistently, use Supabase (Postgres + Storage).

Quick steps (recommended)
1. Create a Supabase project
   - Go to https://app.supabase.com and create a new project.
   - Note the Project URL and ANON key (Settings -> API). Keep the service_role key secret for server-side admin tasks.
   - Create a storage bucket named `recordings` (public or private; public makes CSV audio URLs simpler).

2. Run SQL in Supabase SQL editor (Tables + RPC)
-- sentences table
create table if not exists sentences (
  id bigint primary key,
  english_text text,
  khasi_text text,
  created_at timestamptz default now()
);

-- recordings table (metadata only)
create table if not exists recordings (
  id bigint generated always as identity primary key,
  sentence_id bigint references sentences(id) on delete cascade,
  speaker_id text,
  storage_path text,
  duration_seconds numeric,
  created_at timestamptz default now()
);
create index on recordings(sentence_id);

-- RPC to get next sentence for a speaker (used by frontend)
create or replace function get_next_sentence(p_speaker text)
returns table (id bigint, english_text text, khasi_text text) as $$
  select s.id, s.english_text, s.khasi_text
  from sentences s
  where s.id not in (select sentence_id from recordings where speaker_id = p_speaker)
  order by (select count(*) from recordings r where r.sentence_id = s.id) asc, s.id asc
  limit 1;
$$ language sql stable;

3. Deploy frontend to Vercel
   - Push this repo to GitHub.
   - In Vercel, create a new project from the GitHub repo.
   - Optionally configure environment variables (not necessary if you save keys in admin page localStorage).
   - Deploy; Vercel will give you a public URL.

4. Configure Supabase keys for contributors
   - Open the deployed admin page (e.g., https://<your-site>/admin.html).
   - Paste your Supabase Project URL and ANON key and click "Save Supabase keys". This stores them in your browser localStorage for use by contributors on that machine. For wider distribution, add these into your deployed frontend via environment variables or embed in the JS (less secure).

5. Upload initial sentences
   - Option A (recommended quick): Use Supabase Dashboard -> Table Editor -> Import CSV into `sentences`.
   - Option B: Use the existing `/admin/upload` endpoint on your local server to populate local SQLite (not relevant if you move fully to Supabase).

6. Contributors
   - Share the Vercel URL (e.g., https://<your-site>/index.html).
   - Contributors enter their speaker name and record; audio is uploaded directly to Supabase Storage and metadata inserted into the `recordings` table.

7. Export enriched CSV
   - Use Supabase SQL to join `sentences` with the most recent `recordings` per sentence and export as CSV. Example query:
     select s.id, s.english_text, s.khasi_text, r.storage_path as audio_file_url, r.speaker_id, r.created_at as recorded_at, r.duration_seconds
     from sentences s
     left join lateral (
       select * from recordings rr where rr.sentence_id = s.id order by rr.created_at desc limit 1
     ) r on true
     order by s.id;
   - Run and use the "Download CSV" button.

Notes
- Do NOT expose Supabase service_role key in frontend code. Use service_role only for server-side admin actions (e.g., CSV import endpoint you host privately).
- For production usage, consider adding Row Level Security (RLS) and policies for inserts into `recordings` so only valid actions are allowed.
- If you prefer private audio buckets, generate signed URLs during export rather than using public URLs.

Serverless admin CSV import (Vercel)
----------------------------------
I included a Vercel serverless function template at `api/supabase-upload.js`. It accepts a POST with JSON `{ filename, data }` where `data` is the base64-encoded file bytes (CSV or XLSX). The function decodes and inserts rows into the `sentences` table using the Supabase `service_role` key.

Set these environment variables in your Vercel project settings before deploying:
- `SUPABASE_URL` — your Supabase project URL
- `SUPABASE_SERVICE_ROLE` — the service_role key (keep secret)

For security, restrict access to the `/api/supabase-upload` endpoint (e.g., add Vercel Basic Auth or deploy it behind a private admin route). The current `public/admin.html` will POST the base64 payload to `/api/supabase-upload` when you click "Upload to Supabase (via Vercel)".

Local testing note: when running locally, the serverless endpoint won't be available. You can either deploy to Vercel or call Supabase directly from a secure server that has the service_role key.

.env.local (local development)
--------------------------------
You can place your Supabase keys into a `.env.local` file at the project root for local testing. Example keys (do NOT commit this file to a public repo):

NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_URL=your_supabase_url
BUCKET_NAME=recordings

I added a `.env.local` placeholder in the repository; replace the placeholder values with your real keys if you want to test locally. For deployment, set the same variables in Vercel's Environment Variables settings.

If you want, I can:
- Patch repository to commit these Supabase-based changes (done for client-side recording/upload),
- Add a Vercel serverless function template for admin CSV upload using service_role key,
- Or help set up Supabase project and run the SQL for you.
