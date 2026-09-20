-- Migration 0005_build_and_receipt_economic_context.sql: Persist build-time and receipt economic conversion context

ALTER TABLE build_intents
  ADD COLUMN IF NOT EXISTS target_decimals INTEGER,
  ADD COLUMN IF NOT EXISTS active_multiplier NUMERIC(38, 18),
  ADD COLUMN IF NOT EXISTS chain_timestamp BIGINT,
  ADD COLUMN IF NOT EXISTS epoch BIGINT;

ALTER TABLE trade_receipts
  ADD COLUMN IF NOT EXISTS raw_wallet_output TEXT,
  ADD COLUMN IF NOT EXISTS target_decimals INTEGER,
  ADD COLUMN IF NOT EXISTS active_multiplier NUMERIC(38, 18),
  ADD COLUMN IF NOT EXISTS chain_timestamp BIGINT,
  ADD COLUMN IF NOT EXISTS epoch BIGINT;
