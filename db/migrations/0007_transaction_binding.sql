-- Old unsigned builds lack proof of message binding and must fail closed.
ALTER TABLE build_intents ADD COLUMN IF NOT EXISTS transaction_message_hash TEXT;
ALTER TABLE sell_build_intents ADD COLUMN IF NOT EXISTS transaction_message_hash TEXT;
-- Refuse migration if old duplicates exist. Review/archive explicitly; never silently delete history.
CREATE UNIQUE INDEX IF NOT EXISTS unique_buy_build_check ON build_intents(check_id);
CREATE UNIQUE INDEX IF NOT EXISTS unique_sell_build_check ON sell_build_intents(check_id);
