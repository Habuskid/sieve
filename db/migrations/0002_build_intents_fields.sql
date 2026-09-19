-- Migration 0002_build_intents_fields.sql: Add missing summary and valuation fields to build_intents

ALTER TABLE build_intents
  ADD COLUMN IF NOT EXISTS funding_asset TEXT,
  ADD COLUMN IF NOT EXISTS funding_amount_display NUMERIC(38, 18),
  ADD COLUMN IF NOT EXISTS target_symbol TEXT,
  ADD COLUMN IF NOT EXISTS expected_target_amount NUMERIC(38, 18),
  ADD COLUMN IF NOT EXISTS max_premium_pct NUMERIC(38, 18);
