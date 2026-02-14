-- Run in Supabase SQL Editor (Dashboard > SQL Editor)

CREATE TABLE IF NOT EXISTS sentences (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  excel_row_id integer,
  english_text text NOT NULL,
  khasi_text text NOT NULL,
  has_recording boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recordings (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sentence_id bigint REFERENCES sentences(id) ON DELETE CASCADE,
  speaker_id text NOT NULL,
  audio_path text,
  duration_seconds real,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rec_sentence_speaker ON recordings(sentence_id, speaker_id);
CREATE INDEX IF NOT EXISTS idx_rec_speaker ON recordings(speaker_id);

CREATE OR REPLACE FUNCTION get_next_sentence(p_speaker text)
RETURNS SETOF sentences LANGUAGE sql STABLE AS $$
  SELECT s.* FROM sentences s
  LEFT JOIN recordings r ON r.sentence_id = s.id AND r.speaker_id = p_speaker
  WHERE r.id IS NULL
  ORDER BY (SELECT count(*) FROM recordings r2 WHERE r2.sentence_id = s.id) ASC, random()
  LIMIT 1;
$$;

ALTER TABLE sentences DISABLE ROW LEVEL SECURITY;
ALTER TABLE recordings DISABLE ROW LEVEL SECURITY;
