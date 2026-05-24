-- Migration v010: Add notes column to contacts table
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS notes TEXT;
