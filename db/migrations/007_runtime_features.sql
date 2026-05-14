-- Runtime feature schema additions used by dashboard/services.

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS csat_score INTEGER;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS csat_comment TEXT;

ALTER TABLE messages ADD COLUMN IF NOT EXISTS transcription TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS feedback_score INTEGER;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS feedback_note TEXT;

ALTER TABLE agents DROP CONSTRAINT IF EXISTS agents_status_check;
ALTER TABLE agents ADD CONSTRAINT agents_status_check
  CHECK (status IN ('active', 'inactive', 'away', 'busy', 'suspended'));

ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_direction_check;
ALTER TABLE messages ADD CONSTRAINT messages_direction_check
  CHECK (direction IN ('inbound', 'outbound', 'internal'));

ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_message_type_check;
ALTER TABLE messages ADD CONSTRAINT messages_message_type_check
  CHECK (message_type IN ('text', 'image', 'document', 'audio', 'video', 'sticker', 'template', 'interactive', 'reaction', 'transfer', 'note'));

CREATE TABLE IF NOT EXISTS canned_responses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shortcut TEXT NOT NULL UNIQUE,
  content TEXT NOT NULL,
  category TEXT DEFAULT 'General',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS scheduled_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_messages_pending
  ON scheduled_messages(status, scheduled_for);

CREATE TABLE IF NOT EXISTS shift_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_time TIMESTAMPTZ,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shift_logs_agent_status
  ON shift_logs(agent_id, status);

CREATE TABLE IF NOT EXISTS webhooks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  target_url TEXT NOT NULL,
  events TEXT NOT NULL DEFAULT '*',
  secret TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
