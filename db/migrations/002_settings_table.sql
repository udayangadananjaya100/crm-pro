-- ============================================
-- Pro CRM — Settings & Configuration Table
-- PostgreSQL Migration v002
-- ============================================

CREATE TABLE IF NOT EXISTS settings (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL,
    category VARCHAR(50) NOT NULL DEFAULT 'general',
    description TEXT,
    is_public BOOLEAN DEFAULT false, -- If true, can be accessed without auth (e.g., for login page branding)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add updated_at trigger for settings
CREATE TRIGGER update_settings_updated_at BEFORE UPDATE ON settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default settings
INSERT INTO settings (key, value, category, description, is_public) VALUES
    ('company_name', '"Pro CRM"', 'branding', 'The name of the company using the CRM', true),
    ('primary_color', '"#4F46E5"', 'branding', 'Primary brand color for the dashboard', true),
    ('logo_url', '"/logo.png"', 'branding', 'URL for the company logo', true),
    ('setup_completed', 'false', 'system', 'Whether the initial setup wizard has been completed', true),
    ('license_key', 'null', 'system', 'Product license key', false),
    ('license_status', '{"valid": false}', 'system', 'Current license validation status', false)
ON CONFLICT (key) DO NOTHING;
