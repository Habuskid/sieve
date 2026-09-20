-- Migration 0004: Persist funding valuation method and quote output decimals
ALTER TABLE price_checks ADD COLUMN IF NOT EXISTS funding_method TEXT;
ALTER TABLE price_checks ADD COLUMN IF NOT EXISTS quote_output_decimals INTEGER;
