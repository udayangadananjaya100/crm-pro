-- Create appointments table for Autonomous Action Agent
CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL,
  contact_name TEXT,
  contact_phone TEXT,
  appointment_date DATE NOT NULL,
  appointment_time TIME NOT NULL,
  reason TEXT,
  status TEXT DEFAULT 'confirmed', -- confirmed, cancelled, completed
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (contact_id) REFERENCES contacts(id)
);

CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(appointment_date);
