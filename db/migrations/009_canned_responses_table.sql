-- ============================================
-- CANNED RESPONSES (QUICK REPLIES)
-- PostgreSQL Migration v009
-- ============================================

CREATE TABLE IF NOT EXISTS canned_responses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shortcut VARCHAR(50) NOT NULL UNIQUE,
    content TEXT NOT NULL,
    category VARCHAR(50) DEFAULT 'General',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_canned_responses_category ON canned_responses(category);
