-- Migration 0001_initial.sql: Sieve Price Checks, Build Intents, and Trade Receipts

CREATE TABLE IF NOT EXISTS price_checks (
  id UUID PRIMARY KEY,
  network TEXT NOT NULL CHECK (network IN ('mainnet', 'testnet')),
  wallet TEXT,
  target_name TEXT NOT NULL,
  target_symbol TEXT NOT NULL,
  target_mint TEXT NOT NULL,
  funding_asset TEXT NOT NULL CHECK (funding_asset IN ('SOL', 'USDC')),
  funding_mint TEXT NOT NULL,
  funding_amount_raw TEXT NOT NULL,
  funding_amount_display NUMERIC(38, 18) NOT NULL,
  funding_usd_value NUMERIC(38, 18) NOT NULL,
  reference_price_usd NUMERIC(38, 18) NOT NULL,
  reference_observed_at TIMESTAMPTZ NOT NULL,
  reference_source TEXT NOT NULL,
  quote_output_raw TEXT,
  quote_output_display NUMERIC(38, 18),
  quote_observed_at TIMESTAMPTZ,
  quote_expires_at TIMESTAMPTZ,
  route_fingerprint TEXT,
  price_impact_pct NUMERIC(38, 18),
  current_buy_price_usd NUMERIC(38, 18),
  maximum_buy_price_usd NUMERIC(38, 18) NOT NULL,
  premium_bps INTEGER,
  max_premium_bps INTEGER NOT NULL,
  decision TEXT NOT NULL,
  reason_code TEXT,
  client_intent_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_price_checks_wallet_created ON price_checks(wallet, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_price_checks_network_created ON price_checks(network, created_at DESC);

CREATE TABLE IF NOT EXISTS build_intents (
  id UUID PRIMARY KEY,
  check_id UUID NOT NULL REFERENCES price_checks(id) ON DELETE CASCADE,
  wallet TEXT NOT NULL,
  network TEXT NOT NULL CHECK (network IN ('mainnet', 'testnet')),
  revalidation_reference_price_usd NUMERIC(38, 18) NOT NULL,
  revalidation_buy_price_usd NUMERIC(38, 18) NOT NULL,
  revalidation_premium_bps INTEGER NOT NULL,
  minimum_output_raw TEXT NOT NULL,
  protection_method TEXT NOT NULL,
  protection_value TEXT,
  provider_request_id TEXT,
  transaction_hash TEXT,
  last_valid_block_height BIGINT,
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_build_intents_check_id ON build_intents(check_id);
CREATE INDEX IF NOT EXISTS idx_build_intents_wallet ON build_intents(wallet, created_at DESC);

CREATE TABLE IF NOT EXISTS trade_receipts (
  id UUID PRIMARY KEY,
  check_id UUID NOT NULL REFERENCES price_checks(id) ON DELETE CASCADE,
  build_intent_id UUID NOT NULL REFERENCES build_intents(id) ON DELETE CASCADE,
  wallet TEXT NOT NULL,
  network TEXT NOT NULL CHECK (network IN ('mainnet', 'testnet')),
  signature TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  funding_asset TEXT NOT NULL,
  funding_amount_display NUMERIC(38, 18) NOT NULL,
  target_symbol TEXT NOT NULL,
  target_mint TEXT NOT NULL,
  expected_target_amount NUMERIC(38, 18) NOT NULL,
  realized_target_amount NUMERIC(38, 18),
  reference_price_usd NUMERIC(38, 18) NOT NULL,
  checked_buy_price_usd NUMERIC(38, 18) NOT NULL,
  max_premium_bps INTEGER NOT NULL,
  premium_bps INTEGER NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL,
  confirmed_at TIMESTAMPTZ,
  failure_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trade_receipts_wallet_confirmed ON trade_receipts(wallet, confirmed_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_trade_receipts_signature ON trade_receipts(signature);
