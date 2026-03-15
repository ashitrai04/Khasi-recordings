-- =============================================
-- Khasi Speech Collection — CREATE DATASET VIEW
-- Run this in Supabase SQL Editor to create a "virtual table"
-- that acts as a single, always-synced dataset for ML export.
-- =============================================

CREATE OR REPLACE VIEW khasi_ml_dataset AS
SELECT 
  s.id AS sentence_id,
  s.excel_row_id,
  s.english_text,
  s.khasi_text,
  r.audio_path,
  r.speaker_id,
  r.speaker_gender,
  r.speaker_age,
  r.speaker_location,
  r.duration_seconds,
  r.created_at AS recorded_at
FROM sentences s
LEFT JOIN recordings r ON s.id = r.sentence_id
ORDER BY s.id ASC, r.created_at DESC;

-- Now you can go to the Table Editor in Supabase, 
-- open the 'khasi_ml_dataset' view, and click "Export to CSV"
-- It will be instant compared to the admin panel export!
