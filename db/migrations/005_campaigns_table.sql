-- Create campaigns table for Automated AI Marketing
CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  target_segment TEXT, -- e.g., 'hot_leads', 'all_active', 'inactive'
  message_template TEXT,
  ai_enhanced BOOLEAN DEFAULT true,
  status TEXT DEFAULT 'draft', -- draft, sending, completed, failed
  total_recipients INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_sent_at DATETIME
);

CREATE TABLE IF NOT EXISTS campaign_logs (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  contact_id TEXT NOT NULL,
  message_id TEXT,
  status TEXT,
  sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id),
  FOREIGN KEY (contact_id) REFERENCES contacts(id)
);
