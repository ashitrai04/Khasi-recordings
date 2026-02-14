-- =============================================
-- Khasi Speech Collection — ADD MISSING COLUMNS
-- Run this in Supabase SQL Editor if you already have data
-- (This will NOT delete any existing data)
-- =============================================

-- Add gender and age columns to recordings table (if they don't exist)
ALTER TABLE recordings ADD COLUMN IF NOT EXISTS speaker_gender text DEFAULT '';
ALTER TABLE recordings ADD COLUMN IF NOT EXISTS speaker_age integer;
ALTER TABLE recordings ADD COLUMN IF NOT EXISTS speaker_location text DEFAULT '';

-- Remove broken FK to contributors table (if it exists)
ALTER TABLE recordings DROP CONSTRAINT IF EXISTS recordings_contributor_id_fkey;

-- Add index for faster filtering
CREATE INDEX IF NOT EXISTS idx_sentences_has_recording ON sentences(has_recording);

-- Update has_recording flag for sentences that have recordings
UPDATE sentences SET has_recording = true
WHERE id IN (SELECT DISTINCT sentence_id FROM recordings);
