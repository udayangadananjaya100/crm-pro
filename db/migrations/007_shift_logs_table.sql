-- ============================================
-- AGENT SHIFT LOGS & MESSAGE FEEDBACK
-- PostgreSQL Migration v007
-- ============================================

CREATE TABLE IF NOT EXISTS shift_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    end_time TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shift_logs_agent ON shift_logs(agent_id);
CREATE INDEX IF NOT EXISTS idx_shift_logs_status ON shift_logs(status);
CREATE INDEX IF NOT EXISTS idx_shift_logs_start ON shift_logs(start_time);

-- Add feedback columns to messages table
ALTER TABLE messages ADD COLUMN IF NOT EXISTS feedback_score INTEGER;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS feedback_note TEXT;
