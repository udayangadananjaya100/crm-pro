-- ============================================
-- WEBHOOK SUBSCRIPTIONS
-- PostgreSQL Migration v008
-- ============================================

CREATE TABLE IF NOT EXISTS webhooks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    target_url TEXT NOT NULL,
    events TEXT NOT NULL,
    secret VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhooks_active ON webhooks(is_active);
