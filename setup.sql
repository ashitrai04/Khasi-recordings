-- =============================================
-- Khasi Speech Collection — Database Setup
-- Run this in Supabase SQL Editor
-- =============================================

-- 1. Sentences table
CREATE TABLE IF NOT EXISTS sentences (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  excel_row_id integer,
  english_text text NOT NULL,
  khasi_text text NOT NULL,
  has_recording boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- 2. Contributors table (stores speaker profile info)
CREATE TABLE IF NOT EXISTS contributors (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL,
  gender text,
  age integer,
  location text,
  created_at timestamptz DEFAULT now()
);

-- 3. Recordings table (links to sentences + contributors)
-- If this table already exists, just add the contributor_id column:
--   ALTER TABLE recordings ADD COLUMN IF NOT EXISTS contributor_id bigint REFERENCES contributors(id);
CREATE TABLE IF NOT EXISTS recordings (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sentence_id bigint REFERENCES sentences(id) ON DELETE CASCADE,
  contributor_id bigint REFERENCES contributors(id) ON DELETE SET NULL,
  speaker_id text NOT NULL,
  audio_path text,
  duration_seconds real,
  created_at timestamptz DEFAULT now()
);

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_rec_sentence_speaker ON recordings(sentence_id, speaker_id);
CREATE INDEX IF NOT EXISTS idx_rec_speaker ON recordings(speaker_id);
CREATE INDEX IF NOT EXISTS idx_rec_contributor ON recordings(contributor_id);
CREATE INDEX IF NOT EXISTS idx_contrib_name ON contributors(name);

-- 5. Smart sentence assignment function
DROP FUNCTION IF EXISTS get_next_sentence(text);
CREATE OR REPLACE FUNCTION get_next_sentence(p_speaker text)
RETURNS SETOF sentences LANGUAGE sql STABLE AS $$
  SELECT s.* FROM sentences s
  LEFT JOIN recordings r ON r.sentence_id = s.id AND r.speaker_id = p_speaker
  WHERE r.id IS NULL
  ORDER BY (SELECT count(*) FROM recordings r2 WHERE r2.sentence_id = s.id) ASC, random()
  LIMIT 1;
$$;

-- 6. Batch fetch unrecorded sentences for a speaker
DROP FUNCTION IF EXISTS get_batch_sentences(text, integer, integer);
CREATE OR REPLACE FUNCTION get_batch_sentences(p_speaker text, p_limit integer DEFAULT 30, p_offset integer DEFAULT 0)
RETURNS SETOF sentences LANGUAGE sql STABLE AS $$
  SELECT s.* FROM sentences s
  LEFT JOIN recordings r ON r.sentence_id = s.id AND r.speaker_id = p_speaker
  WHERE r.id IS NULL
  ORDER BY s.id ASC
  LIMIT p_limit OFFSET p_offset;
$$;

-- 7. Disable RLS
ALTER TABLE sentences DISABLE ROW LEVEL SECURITY;
ALTER TABLE recordings DISABLE ROW LEVEL SECURITY;
ALTER TABLE contributors DISABLE ROW LEVEL SECURITY;
