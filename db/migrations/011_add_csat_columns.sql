-- ============================================
-- Pro CRM — Add CSAT columns to conversations
-- PostgreSQL Migration v011
-- ============================================

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS csat_score INTEGER;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS csat_comment TEXT;
