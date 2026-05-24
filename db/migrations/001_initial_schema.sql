-- ============================================
-- Pro CRM — Initial Database Schema
-- PostgreSQL Migration v001
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- CONTACTS
-- ============================================
CREATE TABLE IF NOT EXISTS contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone_number VARCHAR(20) NOT NULL UNIQUE,
    phone_number_masked VARCHAR(20),
    display_name VARCHAR(255),
    email VARCHAR(255),
    company VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'unsubscribed', 'blocked', 'pending')),
    source VARCHAR(50) DEFAULT 'whatsapp',
    lead_score INTEGER DEFAULT 0,
    tags TEXT[] DEFAULT '{}',
    opt_in_marketing BOOLEAN DEFAULT false,
    opt_in_analytics BOOLEAN DEFAULT false,
    language_preference VARCHAR(5) DEFAULT 'en',
    last_message_at TIMESTAMPTZ,
    notes TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_contacts_phone ON contacts(phone_number);
CREATE INDEX idx_contacts_status ON contacts(status);
CREATE INDEX idx_contacts_last_message ON contacts(last_message_at);

-- ============================================
-- CONVERSATIONS
-- ============================================
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'assigned', 'pending', 'resolved', 'closed')),
    assigned_agent_id UUID,
    assigned_team VARCHAR(50) DEFAULT 'general_pool',
    intent VARCHAR(50),
    priority VARCHAR(10) DEFAULT 'normal'
        CHECK (priority IN ('low', 'normal', 'high', 'urgent', 'critical')),
    tags TEXT[] DEFAULT '{}',
    subject VARCHAR(500),
    resolution_notes TEXT,
    window_expires_at TIMESTAMPTZ,
    first_response_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    sla_breached BOOLEAN DEFAULT false,
    message_count INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_conversations_contact ON conversations(contact_id);
CREATE INDEX idx_conversations_status ON conversations(status);
CREATE INDEX idx_conversations_team ON conversations(assigned_team);
CREATE INDEX idx_conversations_window ON conversations(window_expires_at);

-- ============================================
-- MESSAGES
-- ============================================
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    whatsapp_message_id VARCHAR(255),
    direction VARCHAR(10) NOT NULL CHECK (direction IN ('inbound', 'outbound', 'internal')),
    message_type VARCHAR(20) NOT NULL DEFAULT 'text'
        CHECK (message_type IN ('text', 'image', 'document', 'audio', 'video', 'sticker', 'template', 'interactive', 'reaction', 'transfer', 'system')),
    content TEXT,
    content_masked TEXT,
    transcription TEXT,
    media_url TEXT,
    media_mime_type VARCHAR(100),
    template_name VARCHAR(100),
    template_language VARCHAR(10),
    status VARCHAR(20) DEFAULT 'received'
        CHECK (status IN ('received', 'processing', 'sent', 'delivered', 'read', 'failed', 'suppressed')),
    intent VARCHAR(50),
    confidence DECIMAL(3,2),
    ai_generated BOOLEAN DEFAULT false,
    pii_detected BOOLEAN DEFAULT false,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_messages_contact ON messages(contact_id);
CREATE INDEX idx_messages_wa_id ON messages(whatsapp_message_id);
CREATE INDEX idx_messages_created ON messages(created_at);

-- ============================================
-- AGENTS (Human agents for the CRM dashboard)
-- ============================================
CREATE TABLE IF NOT EXISTS agents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'agent'
        CHECK (role IN ('admin', 'manager', 'team_lead', 'agent')),
    team VARCHAR(50) DEFAULT 'general_pool',
    status VARCHAR(20) DEFAULT 'active'
        CHECK (status IN ('active', 'inactive', 'away', 'busy')),
    max_conversations INTEGER DEFAULT 20,
    active_conversations INTEGER DEFAULT 0,
    avatar_url TEXT,
    last_active_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_agents_email ON agents(email);
CREATE INDEX idx_agents_team ON agents(team);
CREATE INDEX idx_agents_status ON agents(status);

-- ============================================
-- AUDIT LOGS
-- ============================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    agent_type VARCHAR(50) NOT NULL,
    action VARCHAR(100) NOT NULL,
    intent VARCHAR(50),
    confidence DECIMAL(3,2),
    rule_applied VARCHAR(100),
    flags TEXT[] DEFAULT '{}',
    input_summary TEXT,
    output_summary TEXT,
    response_time_ms INTEGER,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_created ON audit_logs(created_at);
CREATE INDEX idx_audit_action ON audit_logs(action);
CREATE INDEX idx_audit_agent ON audit_logs(agent_type);

-- ============================================
-- TEMPLATES (Meta-approved templates tracking)
-- ============================================
CREATE TABLE IF NOT EXISTS templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    category VARCHAR(50) NOT NULL,
    language VARCHAR(10) NOT NULL DEFAULT 'en',
    status VARCHAR(20) DEFAULT 'approved'
        CHECK (status IN ('pending', 'approved', 'rejected', 'disabled')),
    header_text TEXT,
    body_text TEXT NOT NULL,
    footer_text TEXT,
    buttons JSONB DEFAULT '[]',
    variables TEXT[] DEFAULT '{}',
    usage_count INTEGER DEFAULT 0,
    last_used_at TIMESTAMPTZ,
    meta_template_id VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- OPT-OUT LOG
-- ============================================
CREATE TABLE IF NOT EXISTS opt_out_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    action VARCHAR(20) NOT NULL CHECK (action IN ('opt_out', 'opt_in')),
    keyword_used VARCHAR(100),
    channel VARCHAR(20) DEFAULT 'whatsapp',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_optout_contact ON opt_out_log(contact_id);

-- ============================================
-- UPDATED_AT TRIGGER
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_contacts_updated_at BEFORE UPDATE ON contacts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON conversations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_agents_updated_at BEFORE UPDATE ON agents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_templates_updated_at BEFORE UPDATE ON templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
