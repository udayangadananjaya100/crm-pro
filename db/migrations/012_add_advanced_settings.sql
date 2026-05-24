-- Migration: 012_add_advanced_settings.sql
-- Description: Seeds default settings for Visual Flow Builder and Multi-channel bots.

INSERT INTO settings (key, value, category, description, is_public)
VALUES 
  ('VISUAL_FLOW_LAYOUT', '{"nodes":[],"edges":[]}', 'general', 'Layout JSON representation of visual routing builder nodes and links.', 1),
  ('TELEGRAM_BOT_TOKEN', 'mock-telegram-bot-token-12345', 'routing', 'Bot Token for Telegram Bot API integration.', 0),
  ('MESSENGER_PAGE_TOKEN', 'mock-messenger-page-token-12345', 'routing', 'Page Access Token for FB Messenger integration.', 0)
ON CONFLICT (key) DO NOTHING;
