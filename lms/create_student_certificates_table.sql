-- ============================================================
--  Student Certificates & Marksheets — Ansha Montessori LMS
--  Stores both Certificate of Completion AND Statement of Marks
--  records. The QR code on each printed PDF links to a public
--  verification page that fetches the row by certificate_no.
-- ============================================================

CREATE TABLE IF NOT EXISTS student_certificates (
  id                 UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Identity
  certificate_no     TEXT NOT NULL UNIQUE,        -- e.g. IW/AMD/2026/0001
  course_code        TEXT NOT NULL,               -- e.g. AMD, MTE-PP
  course_name        TEXT NOT NULL,

  -- Student personal details
  student_full_name  TEXT NOT NULL,
  father_name        TEXT,
  mother_name        TEXT,
  date_of_birth      DATE,

  -- Academic identity
  enrollment_no      TEXT,
  roll_no            TEXT,
  centre_code        TEXT,
  centre_city        TEXT,

  -- Programme dates
  duration_from      DATE,
  duration_to        DATE,
  examination_held   TEXT,                        -- e.g. "Nov-2025"
  issue_date         DATE DEFAULT CURRENT_DATE,
  place              TEXT DEFAULT 'Chennai, Tamil Nadu',

  -- Marks (jsonb so subject lists can vary per course)
  -- Shape: [{ code, subject, max, theory, practical, total }, ...]
  marks              JSONB DEFAULT '[]'::jsonb,
  grand_total        INTEGER,
  grand_total_max    INTEGER,
  division_awarded   TEXT,                        -- DISTINCTION / FIRST CLASS / SECOND CLASS / THIRD CLASS / FAIL

  -- Lifecycle
  status             TEXT DEFAULT 'active',       -- active | revoked
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_student_certificates_cert_no
  ON student_certificates (certificate_no);
CREATE INDEX IF NOT EXISTS idx_student_certificates_course_code
  ON student_certificates (course_code);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION trg_set_updated_at_student_certificates()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at_student_certificates ON student_certificates;
CREATE TRIGGER set_updated_at_student_certificates
  BEFORE UPDATE ON student_certificates
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at_student_certificates();

-- Row-level security: public verification needs read access by cert_no.
-- Admin/teacher can read+write. We rely on the application to scope writes
-- (admin-only page) since the LMS uses a single anon key.
ALTER TABLE student_certificates ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read (public QR-verification scenario).
-- The cert_no is treated as a non-secret identifier printed on the PDF.
CREATE POLICY "allow_anon_select_certificates" ON student_certificates
  FOR SELECT TO anon USING (status = 'active');

CREATE POLICY "allow_auth_select_certificates" ON student_certificates
  FOR SELECT TO authenticated USING (true);

-- Allow anon insert/update/delete (admin page uses the anon key like rest of LMS).
-- Tighten this once you move admin actions to a service-role flow.
CREATE POLICY "allow_anon_insert_certificates" ON student_certificates
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "allow_anon_update_certificates" ON student_certificates
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "allow_anon_delete_certificates" ON student_certificates
  FOR DELETE TO anon USING (true);
