-- ============================================
-- Pro CRM — Migration v003
-- Add Notifications Table
-- ============================================

CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(50) DEFAULT 'info', -- 'info', 'warning', 'error', 'sla_breach'
    target_role VARCHAR(20), -- 'admin', 'manager', 'agent'
    target_agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
    is_read BOOLEAN DEFAULT false,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_role ON notifications(target_role);
CREATE INDEX idx_notifications_agent ON notifications(target_agent_id);
CREATE INDEX idx_notifications_read ON notifications(is_read);
