-- ============================================================
--  Workshop Feedback Table — Ansha Montessori LMS
-- ============================================================

CREATE TABLE IF NOT EXISTS workshop_feedback (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name           TEXT NOT NULL,
  whatsapp       TEXT NOT NULL,
  city           TEXT NOT NULL,
  feedback       TEXT,
  remarks        TEXT,
  rating         INTEGER CHECK (rating BETWEEN 1 AND 5),
  workshop_title TEXT DEFAULT 'General Workshop',
  workshop_date  DATE DEFAULT CURRENT_DATE,
  submitted_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Allow anyone to insert (public feedback form)
ALTER TABLE workshop_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_public_insert" ON workshop_feedback
  FOR INSERT TO anon WITH CHECK (true);

-- Allow authenticated users (admin/teacher) to read all
CREATE POLICY "allow_auth_select" ON workshop_feedback
  FOR SELECT TO authenticated USING (true);

-- Allow anon to read (for Supabase JS client with anon key)
CREATE POLICY "allow_anon_select" ON workshop_feedback
  FOR SELECT TO anon USING (true);
