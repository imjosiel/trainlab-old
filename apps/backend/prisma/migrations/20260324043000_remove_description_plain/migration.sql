-- Migration: remove descriptionPlain column from Exercise
-- This column was used for plain-text search but is no longer needed.
-- The PDF now renders HTML directly, and search uses the description field.

ALTER TABLE "Exercise" DROP COLUMN IF EXISTS "descriptionPlain";
