-- Migration 0003_receipt_amounts_and_signature.sql: Add requested/actual funding amounts and make signature nullable for failed executions
ALTER TABLE trade_receipts
  ALTER COLUMN signature DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS requested_funding_amount NUMERIC(38, 18),
  ADD COLUMN IF NOT EXISTS actual_funding_amount NUMERIC(38, 18),
  ADD COLUMN IF NOT EXISTS internal_execution_id TEXT;
