-- =============================================
-- Khasi Speech Collection — FULL DATABASE REBUILD
-- Run this ONCE in Supabase SQL Editor
-- WARNING: This drops and recreates all tables!
-- =============================================

-- Drop existing objects
DROP FUNCTION IF EXISTS get_next_sentence(text);
DROP FUNCTION IF EXISTS get_batch_sentences(text, integer, integer);
DROP TABLE IF EXISTS recordings CASCADE;
DROP TABLE IF EXISTS contributors CASCADE;
DROP TABLE IF EXISTS sentences CASCADE;

-- 1. Sentences
CREATE TABLE sentences (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  excel_row_id integer,
  english_text text NOT NULL,
  khasi_text text NOT NULL,
  has_recording boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- 2. Recordings (gender/age stored directly — no FK dependency)
CREATE TABLE recordings (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sentence_id bigint NOT NULL REFERENCES sentences(id) ON DELETE CASCADE,
  speaker_id text NOT NULL,
  speaker_gender text DEFAULT '',
  speaker_age integer,
  speaker_location text DEFAULT '',
  audio_path text,
  duration_seconds real,
  created_at timestamptz DEFAULT now()
);

-- 3. Indexes
CREATE INDEX idx_rec_sentence ON recordings(sentence_id);
CREATE INDEX idx_rec_speaker ON recordings(speaker_id);
CREATE INDEX idx_sentences_has_recording ON sentences(has_recording);

-- 4. Batch fetch unrecorded sentences for a speaker
CREATE FUNCTION get_batch_sentences(p_speaker text, p_limit integer DEFAULT 30, p_offset integer DEFAULT 0)
RETURNS SETOF sentences LANGUAGE sql STABLE AS $$
  SELECT s.* FROM sentences s
  LEFT JOIN recordings r ON r.sentence_id = s.id AND r.speaker_id = p_speaker
  WHERE r.id IS NULL
  ORDER BY s.id ASC
  LIMIT p_limit OFFSET p_offset;
$$;

-- 5. Disable RLS
ALTER TABLE sentences DISABLE ROW LEVEL SECURITY;
ALTER TABLE recordings DISABLE ROW LEVEL SECURITY;
