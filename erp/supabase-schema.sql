-- ================================================================
-- ANSHA SHINE KIDS SCHOOL ERP — Supabase Schema
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ================================================================

-- Single table that mirrors the ERP localStorage structure
CREATE TABLE IF NOT EXISTS erp_data (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE erp_data ENABLE ROW LEVEL SECURITY;

-- Allow anon (public) full access — ERP handles its own auth
CREATE POLICY "erp_anon_all" ON erp_data
  FOR ALL TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "erp_auth_all" ON erp_data
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_erp_data_key ON erp_data (key);
CREATE INDEX IF NOT EXISTS idx_erp_data_updated ON erp_data (updated_at DESC);

-- ================================================================
-- DONE! Your ERP will now auto-sync data to this table.
-- Keys stored: students, staff, fee_records, ledger,
--              transport_routes, branches, att_YYYY-MM-DD
-- ================================================================
