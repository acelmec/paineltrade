-- ==========================================
-- SQL Migration: Resolving Report Timestamp Discrepancies
-- ==========================================
-- Instructions:
-- Execute this script in the SQL Editor of your Supabase console.
-- It fixes the timezone offset discrepancy for strategy reports.

-- 1. Fix created_at default value
-- Currently it might be 'timezone('utc'::text, now())' which causes a 3-hour shift when converted
-- to TIMESTAMPTZ under a local connection timezone. We set it to standard 'now()' which is safe.
ALTER TABLE painelvm_strategy_reports 
ALTER COLUMN created_at SET DEFAULT now();

-- 2. Create trigger function to automatically set closed_at when report status changes to terminal
-- This eliminates dependency on the client-side clock (browser/VPS) which can be out of sync.
CREATE OR REPLACE FUNCTION trigger_set_report_closed_at()
RETURNS TRIGGER AS $$
BEGIN
  -- If status changes from 'Em Andamento' (or NULL) to a terminal status, set closed_at to current db time
  IF NEW.status IN ('Gain', 'Stop', 'Cancelado') AND (OLD.status = 'Em Andamento' OR OLD.status IS NULL) THEN
    NEW.closed_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Bind the trigger to painelvm_strategy_reports table
DROP TRIGGER IF EXISTS trg_set_report_closed_at ON painelvm_strategy_reports;
CREATE TRIGGER trg_set_report_closed_at
BEFORE UPDATE ON painelvm_strategy_reports
FOR EACH ROW
EXECUTE FUNCTION trigger_set_report_closed_at();

-- Note: All new reports will now get precise, server-synchronized timestamps.
