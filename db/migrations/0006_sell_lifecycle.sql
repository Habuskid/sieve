CREATE TABLE IF NOT EXISTS sell_price_checks (
  id UUID PRIMARY KEY, network TEXT NOT NULL CHECK (network IN ('mainnet','testnet')), wallet TEXT,
  target_name TEXT NOT NULL, target_symbol TEXT NOT NULL, target_mint TEXT NOT NULL,
  requested_economic_amount NUMERIC(38,18) NOT NULL, actual_economic_amount NUMERIC(38,18) NOT NULL,
  raw_wallet_input TEXT NOT NULL, raw_transfer_fee TEXT NOT NULL, raw_route_input TEXT NOT NULL,
  input_decimals INTEGER NOT NULL, active_multiplier NUMERIC(38,18) NOT NULL,
  expected_usdc_proceeds_raw TEXT NOT NULL, expected_usdc_proceeds NUMERIC(38,18) NOT NULL,
  reference_price_usd NUMERIC(38,18) NOT NULL, reference_observed_at TIMESTAMPTZ NOT NULL,
  current_sell_price_usd NUMERIC(38,18), minimum_sell_price_usd NUMERIC(38,18) NOT NULL,
  discount_bps INTEGER, max_discount_bps INTEGER NOT NULL, price_impact_pct NUMERIC(38,18),
  route_fingerprint TEXT, decision TEXT NOT NULL, source TEXT NOT NULL,
  practice_scenario_id TEXT,
  client_intent_version TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL, expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sell_checks_wallet_created ON sell_price_checks(wallet, created_at DESC);

CREATE TABLE IF NOT EXISTS sell_build_intents (
  id UUID PRIMARY KEY, check_id UUID NOT NULL REFERENCES sell_price_checks(id) ON DELETE CASCADE,
  wallet TEXT NOT NULL, network TEXT NOT NULL CHECK (network IN ('mainnet','testnet')),
  minimum_usdc_output_raw TEXT NOT NULL, provider_request_id TEXT, last_valid_block_height BIGINT,
  summary JSONB NOT NULL, status TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sell_builds_check ON sell_build_intents(check_id);

CREATE TABLE IF NOT EXISTS sell_trade_receipts (
  id UUID PRIMARY KEY, check_id UUID NOT NULL REFERENCES sell_price_checks(id) ON DELETE CASCADE,
  build_intent_id UUID NOT NULL REFERENCES sell_build_intents(id) ON DELETE CASCADE,
  side TEXT NOT NULL CHECK (side='SELL'), simulated BOOLEAN NOT NULL DEFAULT FALSE, wallet TEXT NOT NULL, network TEXT NOT NULL,
  signature TEXT UNIQUE, internal_execution_id TEXT, status TEXT NOT NULL,
  target_symbol TEXT NOT NULL, target_mint TEXT NOT NULL,
  requested_economic_amount NUMERIC(38,18) NOT NULL, actual_economic_input NUMERIC(38,18), raw_input TEXT,
  expected_usdc_proceeds NUMERIC(38,18) NOT NULL, realized_usdc_proceeds NUMERIC(38,18),
  reference_price_usd NUMERIC(38,18) NOT NULL, checked_sell_price_usd NUMERIC(38,18) NOT NULL,
  minimum_sell_price_usd NUMERIC(38,18) NOT NULL, max_discount_bps INTEGER NOT NULL,
  realized_discount_bps INTEGER, submitted_at TIMESTAMPTZ NOT NULL, confirmed_at TIMESTAMPTZ,
  failure_code TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
