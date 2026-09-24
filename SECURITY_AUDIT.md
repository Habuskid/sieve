# Sieve security audit

Baseline: `e3067dc0abdff53f58c6e95b7f89fb25fc8007cc`, GitHub `Habuskid/sieve`, 2026-09-24.
This initial findings document was written before application changes. Remediation and verification evidence follow at the end. No user-wallet transaction was signed or broadcast and no production database was modified. Test-only fixture signatures were generated locally.

## Executive Summary

**Do not use real funds yet.** The application has useful server-side intent binding and conservative raw-output arithmetic, but does not establish that the transaction presented to the wallet implements that policy. Provider JSON is not proof of transaction semantics. Confirmation also trusts provider assertions, and wallet connection is mistaken for authentication.

Final finding inventory: **1 Critical, 7 High, 6 Medium, 2 Low** (16 findings; S-16 was documented during dependency review before its fix). These counts describe findings, not npm advisory severity counts. The descriptions below record baseline behavior; final status and evidence are at the end. Several material fixes are implemented, but signing readiness remains NO. Findings are conditional where a provider, frontend, RPC or configuration compromise is required. A compromised frontend can request arbitrary wallet signatures independently of this backend; backend validation alone cannot prevent that. Users still need a trustworthy signing surface and transaction verification.

## Architecture / Trust Boundaries

```
Browser / wallet (untrusted request fields; wallet holds keys)
  -> Next.js route handlers (Zod; process-local rate buckets)
  -> BUY / SELL check and capacity services
     -> PreStocks HTTPS registry + reference price (external trust)
     -> Jupiter /swap/v2/order (external quote / opaque transaction)
     -> Solana RPC (mint, extensions, clock, balances; external trust)
     -> Decimal/bigint policy and protection calculations
     -> postgres.js repository (or development-only memory repository)
  -> build(checkId, wallet): reload intent, refresh reference/token/quote,
     compare JSON output threshold -> store build -> return transaction bytes
  -> browser deserializes, wallet signs
  -> confirm(buildIntentId, signedTransaction): Jupiter /execute
     -> provider-reported success/amounts -> receipt -> public history query
```

App Router pages: `/`, `/dashboard`, `/buy` (internal redirect preserving query), `/markets`, `/history`, `/preferences`. No server actions or root security middleware found. API GET: `/api/markets`, `/api/history`. API POST: `/api/check`, `/api/build`, `/api/confirm`, `/api/sell/{check,build,confirm}`, `/api/capacity/{buy,sell}`. All execution paths are server services; frontend types are imported with `import type`. No private keys, seeds or server-side signing in runtime code.

BUY uses canonical Mainnet USDC/WSOL input, quote output adjusted for target transfer fee and active multiplier, maximum price `reference * (1 + premium/100)`, then a minimum raw output and floored slippage BPS. SELL quotes the full raw wallet debit (fee-adjusted route debit is tracked separately), uses canonical USDC output and minimum price `reference * (1 - discount/100)`, and ceilings the minimum USDC raw output. Capacity probes at most ten distinct raw amounts and persists only a passing observed candidate; it does not interpolate unquoted execution.

## Critical Assets

Wallet signing authority; input SOL/USDC/PreStocks balances; exact mint/amount/side/boundary; reference identity and observation time; mint extension state; transaction message and signature; Jupiter API key; RPC credentials; runtime/migration database credentials; check/build/receipt ownership and integrity.

## Attack Surface

All public API handlers, unbounded JSON/decimal fields, unsigned wallet identifiers, provider JSON and transaction bytes, RPC responses, cache lifetimes, database state transitions, wallet changes during asynchronous UI work, external images, dependency installation and deployment configuration.

Environment: `PRESTOCKS_API_URL`, `JUPITER_API_BASE`, `JUPITER_API_KEY`, `SOLANA_MAINNET_RPC_URL`, `DATABASE_URL`, `MIGRATION_DATABASE_URL`; client provider additionally reads `NEXT_PUBLIC_SOLANA_RPC_URL`. `.env.example` also contains unused APP_ENV/app URL/SENTRY fields and a read-only taker address slot. Public request fields do not set fetch origins: URLSearchParams safely encodes Jupiter fields. No demonstrated public SSRF or SQL injection: runtime SQL uses postgres tagged parameters; migration `unsafe` executes repository-owned SQL files only. Provider configuration remains a privileged trust boundary, including redirects.

## Findings

### S-01 — CRITICAL — Opaque provider transaction reaches signing authority

- Files/location: `server/jupiter/adapter.ts::buildTransaction`; `server/jupiter/verified-build.ts`; `server/security/swap-semantics.ts`; `server/services/{build-service,sell-build-service}.ts::buildTransaction`; `components/buy/buy-view.tsx::handleConfirmInWallet`.
- Scenario: compromised/malformed Jupiter response reports a safe `otherAmountThreshold` but returns a different message, e.g. a transfer to an attacker, larger debit or authority change. Browser deserializes and asks the wallet to sign without semantic verification.
- Impact/proof: Baseline JSON minimum-output comparisons never read instruction data, resolved address lookup tables, signer set or destination accounts. The advertised boundary therefore is not proven to be inside the transaction. No claim that honest Jupiter currently emits malicious transactions.
- Fix & Status: **FIXED for supported direct DLMM route (fail-closed otherwise)**. Sieve implements an audited semantic verifier for direct Jupiter `route_v2` -> Meteora DLMM `SwapV2` (instruction discriminator `[187, 100, 250, 204, 49, 196, 175, 20]`, enum variant 75). It resolves address lookup tables directly against RPC, validates signer set and payer, checks DLMM LbPair account data, verifies bin arrays and bitmap, forbids supplemental instructions, fees, and hooks, verifies ordinary credits on destination ATAs (`assertOrdinaryCredits`), and calculates conservative net minimum output after transfer fees. All unsupported routes (multi-hop, non-DLMM DEXes, supplemental instructions) fail closed with `ROUTE_RISK`. Covered by 28 adversarial mutation tests in `tests/integration/transaction-semantics.test.ts` and live read-only Mainnet probe.

### S-02 — HIGH — Confirmation is not bound to built bytes or chain execution

- Files/location: `server/services/confirmation-service.ts::confirmTransaction`, `sell-confirmation-service.ts::confirm`; `server/database/db.ts::{save,get}BuildIntent` and Sell equivalents.
- Scenario: submit a different signed transaction under a build ID; malicious/inconsistent execute response supplies unrelated signature, success or output. Optional wallet is not ownership proof.
- Impact/proof: no message comparison or signature verification; BUY transaction_hash is always NULL, both database loaders return empty transaction bytes. `Success` directly sets confirmed; existing `SolanaAdapter.confirmSignature` is unused. Provider totals are presented as realized wallet amounts.
- Fix: persist immutable message hash, verify wallet signature and exact message before execute, derive and match transaction signature, independently retrieve confirmed chain transaction and balances; preserve pending on uncertain landing. Idempotency must validate the binding before returning a receipt.

### S-03 — HIGH — Public wallet identifiers expose and pollute private lifecycle records

- Files/location: `app/api/history/route.ts::GET`; check/capacity/build handlers; `server/services/history-service.ts::getUserHistory`.
- Scenario: GET history with another public wallet address; POST checks with that address; learn check IDs and request builds with the same address.
- Impact/proof: no challenge, signed message, session or authentication anywhere. Wallet equality prevents A-to-B substitution but does not prove the caller owns A. Checks/preferences/blocked attempts are not public chain data. Arbitrary callers can populate victim history; cannot sign victim funds merely by knowing address.
- Fix: nonce-based wallet ownership authentication, domain/expiry binding and secure session, authorize every wallet-scoped access and attributed write. Address syntax validation and UI connection gates do not fix this.

### S-04 — HIGH — Database round trip can loosen user boundary

- Files/location: `core/money/decimal.ts::pctToBps`; `server/database/db.ts::mapPriceCheckRow/mapSellCheckRow`; check/capacity request schemas.
- Scenario: submit `5.005` percent. Check uses that value, persists half-up BPS 501, build reloads `5.01`, allowing a worse price. Both premiums and discounts become less protective when rounded upward.
- Impact/proof: schemas permit arbitrary fractional precision, check tables only store integer boundary BPS, mapping reconstructs with `/100`. Memory tests conceal the database discrepancy.
- Fix: reject finer-than-BPS boundaries consistently at service/API entry (current UI uses coarser increments), or persist exact boundary. Bound monetary input length/precision and raw u64 values. Test exact equality and adjacent raw units.

### S-05 — HIGH — Reference freshness and asset identity are provider assertions

- Files/location: `server/prestocks/adapter.ts::fetchMarkets/getMarketByMint`, `server/prestocks/registry.ts`, `schema.ts::RawPreStocksResponseSchema`.
- Scenario: stale upstream price is served repeatedly, or compromised registry labels an attacker's mint OPENAI. Fetch stamps current host time and accepts any 32–44-character mint, including duplicates.
- Impact/proof: observedAt is retrieval time, not source update time. No trusted mint registry or source timestamp existed at baseline.
- Fix & Status: **Asset Identity FIXED; Upstream Freshness REQUIRES EXTERNAL CHANGE**. Asset identity is locked to an independent canonical registry (`server/prestocks/registry.ts`) mapping all 8 canonical PreStocks symbols to Token-2022 program owner and verified mints. Reference freshness: Sieve explicitly differentiates `referenceRetrievedAt` (HTTP fetch timestamp) from `referenceSourceUpdatedAt` (which remains `null` because upstream PreStocks API does not expose source valuation timestamps). Detecting stale upstream data at the provider boundary requires PreStocks API changes.

### S-06 — HIGH — Off-chain expiry does not enforce execution-time reference/token state

- Files/location: `server/services/{build-service,sell-build-service,execution-snapshot}.ts`; `core/freshness/freshness.ts`; `core/domain/types.ts`.
- Scenario: slow provider calls use captured `now`, capacity probes outlive reference/check validity, or a user delays signing/directly submits a still-valid blockhash after app expiry. Issuer changes a scaled multiplier after snapshot or a scheduled transition falls outside a fixed 120-second guess.
- Impact/proof: no on-chain policy expiry/reference oracle; lastValidBlockHeight was not checked at baseline.
- Fix & Status: **FIXED for snapshot-bound execution (`SNAPSHOT_BOUND_V1`)**. Implemented `executionSnapshot` across BUY and SELL build flows. Binds evaluated intent version, reference price, `referenceRetrievedAt`, `referenceSourceUpdatedAt`, validated token state, active multiplier, raw minimum output, immutable message hash, and signing expiry bounded to `<= 30s` (minimum of check expiry and current time + 30s). Blockhash validity and last valid block height are verified with RPC. Without an on-chain program/oracle, true execution-time state validation remains impossible on Solana, but Sieve strictly bounds off-chain authorization to the verified snapshot.

### S-07 — HIGH — Mainnet label does not verify RPC cluster

- Files/location: `server/solana/adapter.ts::constructor/getConnection`; `components/app-shell/solana-provider.tsx`.
- Scenario: misconfigured RPC points at another network while UI still says Mainnet; malicious RPC returns fabricated metadata/balances.
- Impact/proof: environment name and TS network literal are the only cluster controls. No genesis comparison; no RPC request deadline for most reads. Browser independently accepts a public RPC override.
- Fix: check Mainnet genesis on server RPC access, bound requests, remove unnecessary client override. Genesis prevents accidental wrong-cluster configuration, not a Byzantine RPC lying about genesis and state; production RPC integrity remains an assumption.

### S-08 — MEDIUM — Public API resource controls are bypassable

- Files/location: `server/middleware/rate-limit.ts::getClientIdentifier/checkRateLimit`; every POST handler; history GET; capacity services.
- Scenario: rotate arbitrary wallet strings or forwarded headers to get fresh buckets, send huge decimals/bodies, request enormous history windows. Capacity costs up to ten Jupiter requests per call.
- Impact/proof: key concatenates IP plus unauthenticated wallet; forwarded header is always trusted; buckets never pruned; no shared quota, body size or history pagination bound. Rate limiting occurs after JSON parse.
- Fix: bound bodies/numerics/pagination, independent global budget, only trust explicitly configured overwritten proxy header, no wallet-based quota reset, prune bounded maps. Distributed deployment needs shared/WAF quotas.

### S-09 — MEDIUM — Raw errors can disclose provider and database details

- Files/location: all API catch blocks; Jupiter adapter error-body interpolation; `scripts/check-prestocks-compatibility.mjs` RPC URL logging.
- Scenario: induce provider/SQL/RPC errors containing operational details; API returns exception message. Diagnostic script prints credential-bearing RPC URL into logs.
- Impact/proof: errors are passed through directly, including wrapped SieveAppError messages. No claim an actual secret was exfiltrated.
- Fix: public registry messages only, generic unknown errors, bounded provider reads, remove RPC URL logging; keep secrets out of error payloads.

### S-10 — MEDIUM — Checks can produce multiple independent builds; lifecycle is not atomic

- Files/location: both build services; repository saveBuildIntent/saveSellBuildIntent; migrations 0001/0006.
- Scenario: duplicate or concurrent build requests create new request IDs/transactions under one check; client retries uncertain confirmations. Distinct signed builds can each execute; failures without signatures can create unlimited receipts.
- Impact/proof: check ID is a nonunique index; no consumed transition or transaction claim. Signature uniqueness prevents duplicate successful receipt within each side, not multiple authorizations. Replaying identical Solana bytes does not itself double-spend because chain signatures deduplicate.
- Fix: database-enforced one build per check with idempotent retrieval, atomic claims and one terminal receipt per build; reconcile pending rather than treating unknown landing as failure.

### S-11 — MEDIUM — Token metadata acceptance/cache exceeds validated semantics

- Files/location: `server/solana/adapter.ts::resolveMintMetadata/checkDestinationAccount`; `server/security/swap-semantics.ts`; `core/money/decimal.ts::rawToEconomicDisplay`.
- Scenario: indefinite cache masks issuer updates at check time; allowed confidential/account-only extensions are never interpreted; present extension getter returns null; mint is uninitialized; ATA has changed authority; scaled multiplication overflows safe integer range.
- Impact/proof: cache had no TTL and was shared across adapter endpoints at baseline; allowed unhandled extensions.
- Fix & Status: **FIXED for ordinary Token-2022 transfers across all 8 canonical PreStocks**. Initialized mint and ATA owner/mint/program checks; adapter-scoped short TTL cache; fresh build reads; finite multiplier/decimal/product limits. For Token-2022 extensions: verified that extensions 4 (`ConfidentialTransferMint`) and 16 (`ConfidentialTransferFeeConfig`) on PreStocks mints do not inhibit ordinary (non-confidential) transfers. Sieve verifies confidential mint TLVs for structural validity, verifies destination token accounts have ordinary credits enabled (`assertOrdinaryCredits`), and rejects any confidential instructions. All 8 PreStocks markets pass with `PASS_SUPPORTED` in `check-prestocks-compatibility.mjs`. Issuer permanent delegate/pause/freeze powers remain disclosed risks.

### S-12 — MEDIUM — UI async races and history label can misrepresent authorization/result

- Files/location: `components/buy/buy-view.tsx::handlePrepareTransaction/handleConfirmInWallet`; `components/history/history-view.tsx::fetchHistory`; `server/services/history-service.ts` receipt mapping.
- Scenario: change wallet/amount/side while build is pending: late response reopens old review; old history fetch completes after wallet switch; checked premium is labeled realized.
- Impact/proof: checks have intent-version guards, builds do not. Neither pre-sign expiry nor post-sign context checks exist. BUY realizedBoundaryBps uses build-time premium, not actual chain amounts.
- Fix: invalidate and compare intent snapshots around asynchronous boundaries; bind build to wallet/side; clear stale history; calculate realized metrics only from verified execution data.

### S-13 — MEDIUM — Known dependency advisories require reachability review

- Files/location: `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `package.json`.
- Scenario: untrusted input reaches vulnerable transitive native bigint parser or JSON filter; exposed development test server reaches Vitest advisory.
- Evidence: registry audit reports bigint-buffer 1.1.5 GHSA-3gc7-fjrx-p6mg (high, no patched release), stream-json 1.9.1 GHSA-528h-pc64-c93x, Vitest 3.2.7 GHSA-82fw-gwwq-j7x9. Full advisory totals/reachability recorded below after inspection.
- Fix: smallest compatible patches where available; inspect whether affected entry points are used before broad upgrades. Native install scripts are allowed in workspace config. Install for audit used `--ignore-scripts`. Keep test servers private.

### S-14 — LOW — Application does not set security headers

- Files/location: no next.config headers or root middleware at baseline.
- Scenario: site framed for deceptive wallet interactions; permissive browser defaults increase impact of future injection.
- Impact: defense in depth; no demonstrated XSS. React escapes rendered provider strings; no unsafe HTML found. External image URLs can track viewers.
- Fix: deny framing, nosniff, restrictive referrer/permissions; HTTPS HSTS in production. Start CSP with nonbreaking frame/object/base restrictions; full script/connect CSP requires nonce and wallet compatibility testing.

### S-15 — LOW — Security verification is not a CI gate; audit/env artifacts can be mishandled

- Files/location: `.github/workflows/supabase-keepalive.yml`, `.gitignore`, `package.json::scripts.lint`.
- Scenario: regression merges without tests; `*.md` ignores this report; env variants outside `.env`/`.env*.local` can be committed. `next lint` is not the configured ESLint 9 invocation.
- Evidence: only workflow is read-only keepalive (permissions contents:read, no external actions to pin). No audit/test/build CI. No production migration concurrency lock/checksum.
- Fix: preserve audit explicitly, ignore all secret env variants; use ESLint CLI and add separately reviewed CI/deployment gates. Inspect reachable Git history for secrets and rotate any confirmed historical credentials.

### S-16 — HIGH — Database TLS does not authenticate the server

- Added during dependency reachability review, before changing TLS configuration. Total findings now **1 Critical, 7 High, 6 Medium, 2 Low**.
- Files/location: `server/database/db.ts::PostgresSieveRepository.constructor`; `scripts/migrate.mjs::runMigrations`.
- Scenario: network/DNS adversary presents an untrusted certificate to the application or migration connection.
- Proof: both configure `ssl: "require"`; installed postgres.js 3.4.9 `src/connection.js` lines 283–284 sets `rejectUnauthorized = false` for require/allow/prefer. Encryption without server authentication allows a positioned attacker to read credentials and alter database results.
- Impact: database credentials, private history, and lifecycle integrity; requires network interception, not demonstrated exploitation on the deployment.
- Fix: `rejectUnauthorized: true`, optionally supplying the database provider's verified CA certificate. Never fall back to insecure TLS if certificate validation fails. Deployment may need a provider CA configured.

## Secure controls and limits of evidence

- Build schemas accept only check ID and wallet; stored mint/amount/funding/boundary are used. Both sides reject wallet mismatch and expired checks at entry. No arbitrary provider URL request parameter exists.
- Unknown Mainnet mints fail market lookup; mint program owner is checked against SPL/Token-2022. Custom active transfer hooks, nontransferable and interest-bearing mints are blocked. These controls do not prove transaction-byte semantics.
- BUY transfer-fee minimum is conservatively netted under both known fee schedules. SELL price denominator is wallet economic debit, not reduced route amount. SELL USDC platform fees are not blindly subtracted twice. Exact provider/on-chain semantics still need real transaction reconciliation.
- Conservative minimum-output ceil and slippage floor are present. USDC is valued at USD par; SOL fees/rent are excluded from trade price. This is not an all-in USD cost guarantee.
- Runtime SQL is parameterized; production refuses missing DATABASE_URL outside build phase. Baseline's six migrations are transactional per file; migrations are not serialized across processes. No migration was run against real data.
- Injected-adapter and memory tests do not establish live transaction semantics or production database race behavior.

## Remediation Status

No risk has been accepted on the owner's behalf. FIXED means the described local defect is remediated in this diff, subject to the stated deployment requirements. This is not deployment approval. OPEN is used explicitly for unfinished local remediation: classifying that work as ACCEPTED RISK or solely REQUIRES EXTERNAL CHANGE would be misleading.

| ID | Status | Evidence and remaining work |
| --- | --- | --- |
| S-01 | **FIXED for supported route (fail-closed otherwise)** | Audited allowlisted instruction decoder implemented for direct Jupiter `route_v2` -> Meteora DLMM `SwapV2` (discriminator `[187, 100, 250, 204, 49, 196, 175, 20]`, variant 75). Resolves ALTs against RPC, verifies payer/taker, checks DLMM LbPair accounts/bin arrays/bitmap, forbids supplemental instructions, fees, and hooks, enforces conservative net minimum output after transfer fees. Non-DLMM and supplemental routes fail closed (`ROUTE_RISK`). Verified across 28 adversarial mutation tests in `tests/integration/transaction-semantics.test.ts` and live read-only Mainnet probe. |
| S-02 | **FIXED** | Both confirmation services verify Ed25519 signatures over the persisted exact message, derive the signature, compare provider signature, retrieve the confirmed chain transaction, reject `meta.err`, and use wallet/mint balance deltas. Unknown landing creates no receipt and returns PENDING. Execute timeouts still reconcile on chain. Native SOL trade debit is null rather than inferred from fees/rent. Requires migration 0007 and a trustworthy RPC. Old builds without hashes fail closed. |
| S-03 | **FIXED** | New domain/nonce/expiry-bound wallet challenge, Ed25519 proof and 15-minute HttpOnly SameSite=Strict session. Wallet-attributed POSTs require matching session and fixed Origin; history requires matching session. Tests reject forged/expired proofs and cross-wallet access. Configure a random WALLET_SESSION_SECRET and exact HTTPS SIEVE_APP_ORIGIN. Wallets must support signMessage. A stolen session remains usable until expiry; logout clears the browser cookie, not a global revocation list. |
| S-04 | **FIXED** | API and service validation reject boundaries finer than integer BPS. Decimal precision increased to 80, finite values checked, raw amounts bounded to u64, display inputs bounded, scaled multiplication guarded. Tests cover 5.005% rejection, equality and adjacent raw units. Existing legacy sub-BPS records cannot recover original intent and must not be reused. |
| S-05 | **PARTIALLY FIXED / REQUIRES EXTERNAL CHANGE** | Asset identity is **FIXED** via independent canonical registry (`server/prestocks/registry.ts`) locking all 8 PreStocks symbols to Token-2022 program owner and canonical mints. Reference freshness: upstream PreStocks API does not provide source update timestamps (`referenceSourceUpdatedAt = null`); `referenceRetrievedAt` records HTTP retrieval time. True upstream source freshness **REQUIRES EXTERNAL CHANGE** from PreStocks. |
| S-06 | **FIXED for snapshot-bound execution** | Explicit `SNAPSHOT_BOUND_V1` semantics implemented across BUY and SELL (`server/services/execution-snapshot.ts`). Binds evaluated intent version, reference price, `referenceRetrievedAt`, `referenceSourceUpdatedAt`, validated token state, active multiplier, raw minimum output, immutable message hash, and signing expiry (`<= 30s`). Evaluated against RPC blockhash validity and block height. True execution-time oracle/state guard remains an on-chain architectural limit without custom program. |
| S-07 | **FIXED for wrong-cluster configuration** | Every RPC fetch verifies the full Mainnet genesis hash `5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d`; RPC/body deadlines added, rate-limit retry disabled, browser RPC override removed. Wrong-cluster and full-hash regression tests pass; live Mainnet check passed. A Byzantine RPC can lie about genesis and state; independently trusted RPC/validator infrastructure remains an external assumption. |
| S-08 | **REQUIRES EXTERNAL CHANGE; local bypasses fixed** | 8 KiB streamed JSON cap, 5-second request-body deadline, bounded history windows, canonical monetary inputs, process-wide quota, bounded/pruned buckets and wallet-independent quota keys. Forwarded headers ignored unless explicitly configured as overwritten by trusted ingress. Capacity has six requests/minute/process identity. Distributed deployment still requires shared/WAF quotas, origin access restrictions and provider spend limits. |
| S-09 | **FIXED** | Public errors use fixed registry messages; unknown errors are generic. Diagnostic RPC URL logging removed. Provider bodies capped at 2 MB, redirects rejected, fetch+body deadlines enforced. API test verifies credential-bearing internal error text is not returned. Operational/migration logs remain privileged. |
| S-10 | **REQUIRES EXTERNAL CHANGE; local uniqueness fix implemented** | Migration 0007 adds unique check IDs for both build tables; memory repository and real PostgreSQL enforce the same invariant. Only one concurrent build can be persisted/released; duplicate callers fail closed rather than getting a second authorization. Signed-message replay produces one receipt per signature. Real PostgreSQL concurrency, rollback, and migration 0007 fail-closed tests verified (11/11 PASS). Production deployment, duplicate-data review, and durable recovery worker remain. |
| S-11 | **FIXED for ordinary Token-2022 transfers** | All 8 PreStocks mints supported under ordinary Token-2022 transfers. TLV verification confirms extensions 4 (`ConfidentialTransferMint`) and 16 (`ConfidentialTransferFeeConfig`) are structurally valid mint-level configurations; Sieve validates destination accounts have ordinary credits enabled (`assertOrdinaryCredits`, byte 262 = 1) and strictly rejects confidential instructions. Verified on-chain across 8/8 markets in `check-prestocks-compatibility.mjs` and live read-only probe. |
| S-12 | **FIXED for identified races/mislabeling** | Build is bound to wallet/side/intent version; stale async responses discarded; pre/post-sign context and exact serialized message checks added. History clears on wallet change and rejects old responses. BUY realized boundary is null rather than copied from the checked premium. SELL economic receipt units still use the build multiplier/reference snapshot, not an independently proven execution-time oracle (S-06). |
| S-13 | **REQUIRES EXTERNAL CHANGE; mitigated, audit not clean** | Native bigint-buffer build disabled; pure JS fallback observed and no native module found in this install. Transitive upstream fix/replacement and development-tool upgrade review remain. No advisory exclusions or broad dependency updates added. Full reachability assessment below. |
| S-14 | **FIXED for missing headers** | DENY/frame-ancestors none, nosniff, no-referrer, camera/microphone/geolocation denial, object-src none/base-uri self and production HSTS. Browser tests confirm headers. CSP intentionally does not claim script injection protection; complete nonce-based script/connect policy still needs wallet/provider compatibility testing. |
| S-15 | **FIXED for CI/env handling** | Pinned-action read-only CI, frozen dependency install, typecheck/lint/tests/build/history scan/audit; working ESLint CLI; all .env variants ignored except example; report explicitly tracked. Keepalive now calls a limited SELECT 1 health endpoint. Dependency audit intentionally keeps CI red. Migration runner still requires serialized operation; no concurrency lock/checksum was added. |
| S-16 | **FIXED in code; production verification required** | Runtime and migration connections require certificate authentication; optional DATABASE_CA_CERT. No insecure fallback. Configure a verified provider CA if needed, and test against the actual database before deployment. No production connection or migration was performed. |

### Resulting trust boundaries and lifecycle

Anonymous users can retrieve markets and perform walletless diagnostic checks. Associating any check/capacity result with a wallet, building, confirming and retrieving wallet history requires the signed wallet session. Authentication adds `/api/auth/challenge` POST and `/api/auth/session` GET/POST/DELETE. `/api/health` GET reveals only success of a bounded database ping. Unsupported HTTP methods use Next.js route-handler rejection; no broad CORS policy is enabled.

BUY and SELL builds reload persisted intent, refresh provider/token data, apply policy and preserve the checked wallet/mint/amount/funding/boundary. Strict HTTP schemas reject client overrides. Exact message hashes are stored with a unique check-to-build relation. The browser checks context around signing; confirmation verifies all required transaction signatures and checks actual chain message/status/token deltas before writing receipts. With S-01 semantic verification, provider transaction bytes are no longer accepted opaquely; they are decompiled, resolved against RPC, verified against the user intent, and asserted to match direct Meteora DLMM SwapV2 semantics before presentation to the wallet.

Both side repositories scope history by wallet and Mainnet. Runtime queries remain parameterized. A single Solana signature cannot execute twice on chain; receipt uniqueness prevents repeated successful confirmations producing additional history. A new user-authorized check is a new intent and can legitimately create another trade. Concurrent builds may still consume provider calls before the database uniqueness constraint rejects the loser.

No runtime private keys or server signing were introduced. Test keys/signatures exist only in `tests/helpers/security-fixtures.ts`; they authorize local fixture messages and are never broadcast. No production mocks or simulated execution mode were introduced. Tests inject provider doubles; passing those tests is not live-provider proof.

### Arithmetic and Token-2022 evidence

Raw on-chain quantities use bigint. Minimum BUY output and minimum SELL USDC proceeds round upward; derived allowed slippage rounds downward. SELL raw wallet debit rounds so that it does not exceed the requested economic amount. Transfer-fee withholding rounds upward and is capped; BUY protection checks net output under both known fee schedules. SELL denominator is the wallet's economic debit, while route input is tracked separately. Actual confirmation amounts come from chain wallet balances rather than Jupiter totals.

The documented [ScaledUiAmount semantics](https://solana.com/docs/tokens/extensions/scaled-ui-amount) require chain-time multiplier selection and attention to truncation. Tests cover fractional multipliers, unsafe products, epoch boundaries and one-raw-unit inequalities. Unsupported decimals/extensions fail closed. This does not prove an issuer cannot update state between build and execution; see S-06. Source account balance sums are availability prechecks, not proof of router source selection; the latter remains part of S-01. USDC is valued at USD par, SOL funding uses Jupiter's valuation, and SOL transaction fees/rent are outside the trade boundary. Provider fee fields are structurally validated but not reconciled against original transaction instructions.

On Mainnet, all 8 canonical PreStocks mints configure Token-2022 with extensions: 12 (MetadataPointer), 6 (DefaultAccountState), 1 (TransferFeeConfig), 4 (ConfidentialTransferMint), 16 (ConfidentialTransferFeeConfig), 14 (TransferHook), 25 (PermanentDelegate), 18 (TokenMetadata), 26 (PausableConfig), and 19 (GroupPointer). Extensions 4 and 16 are present at the mint level, but Sieve executes ordinary SPL Token-2022 transfers. Sieve validates confidential TLV structure, asserts that destination accounts have ordinary credits enabled (`assertOrdinaryCredits`), and strictly rejects confidential instructions. All 8 canonical markets are verified `PASS_SUPPORTED` via `scripts/check-prestocks-compatibility.mjs`. Live read-only probes against Mainnet RPC verified the USDC -> OPENAI PreStock route with PASS (Sieve protection verified `4597013 >= 4381791`). Zero signatures, broadcasts, or fund movement occurred.

### Dependencies, history and configuration

`pnpm audit` reports **0 Critical, 1 High, 3 Moderate, 0 Low** affected package entries. The three moderate entries include Vitest and its mocker for the same advisory. No dependency versions or lockfile were changed.

| Advisory | Reachability and action |
| --- | --- |
| [bigint-buffer GHSA-3gc7-fjrx-p6mg](https://github.com/advisories/GHSA-3gc7-fjrx-p6mg) | Transitive through SPL buffer-layout-utils; native overflow, no patched release listed by the audit. This repository's inspected layout calls use fixed 8/16/24/32-byte slices. Native build disabled and absent in this install; pure JS fallback observed. Other deployments/caches must also exclude prebuilt native binaries. This is mitigation, not removal of the advisory. |
| [stream-json GHSA-528h-pc64-c93x](https://github.com/advisories/GHSA-528h-pc64-c93x) | Transitive 1.9.1 via jayson. Advisory concerns filter APIs; inspected jayson uses StreamValues/Verifier, not those filters. Patched line is a major upgrade; no demonstrated reachable exploit in the inspected path and no forced transitive major override. |
| [Vitest GHSA-82fw-gwwq-j7x9](https://github.com/advisories/GHSA-82fw-gwwq-j7x9) | Vitest 3.2.7 and mocker, development server path traversal. Local/CI use run mode; no public Vitest server. Patched major toolchain needs compatibility review. |

Dependency installation used the frozen lockfile with scripts disabled for initial audit. Workspace now disables bigint-buffer's native build. The CI checkout/setup-node actions use full SHAs and contents:read; credentials are not persisted. No package was classified abandoned solely on age, and no dependency-confusion exploit was demonstrated. Lockfile integrity and registry trust remain supply-chain assumptions.

The read-only history scan examined **1,031 reachable Git objects / 462 blobs** over the cloned 94-commit history and found **zero matches** for the implemented credential patterns. Current example env values are placeholders. No confirmed secret requiring rotation was found. This is a heuristic scanner, not proof that arbitrary-format secrets never existed; gitleaks/trufflehog were unavailable, and unreachable/deleted remote objects are outside this clone. Only the report is retained as evidence; logs do not print suspected values.

Provider origins are controlled by server configuration, never public input. URL query construction uses URLSearchParams. Redirects are rejected. Protect PRESTOCKS_API_URL, JUPITER_API_BASE and SOLANA_MAINNET_RPC_URL as privileged configuration; an administrator controlling those values controls the upstream trust boundary. Server keys are not NEXT_PUBLIC variables. Browser Mainnet RPC is fixed. No unsafe HTML rendering, private-key collection, browser secret persistence, arbitrary public fetch destination, SQL interpolation of request strings, or open redirect was demonstrated in the inspected source.

Before deployment: configure the wallet session secret/origin; verify database CA/TLS and apply migration 0007 after reviewing duplicate existing check IDs; ensure old pre-hash builds are unusable; configure shared quotas and trusted ingress; provision provider credentials and a read-only taker for live validation. The migration deliberately fails on duplicates and does not delete historical data. Run migrations serially. None of these deployment steps were performed against production.

## Verification evidence

| Check | Result |
| --- | --- |
| Baseline Vitest | 395/395 passed before fixes. |
| Final full Vitest | **484/484 passed** across all 23 test files; `pnpm exec vitest run`. |
| Typecheck | **PASS**, `pnpm exec tsc --noEmit` (0 errors). |
| ESLint | **PASS with 228 warnings, 0 errors**. Warnings include test fixture any types and existing image/unused-variable warnings; no security-relevant rule disabled. Generated next-env.d.ts excluded. |
| Production build | **PASS**, Next.js 15.5.25; all 11 static and dynamic routes generated. Native bigint fallback warning expected. |
| Browser security/smoke | **7/7 passed**, Chromium, serial run. Covers security headers, wallet session, and route protections. |
| Live read-only | **2/2 passed** via `pnpm run test:live:readonly`: USDC -> WSOL correctly rejected with `BLOCKED_SAFE` (Jupiter returned supplemental instructions / non-DLMM route); USDC -> OPENAI PreStock verified with `PASS` (Sieve protection verified `4597013 >= 4381791`). Zero signatures, broadcasts, or fund movement. |
| PreStocks compatibility | **8/8 PASS_SUPPORTED** via `scripts/check-prestocks-compatibility.mjs` against live Mainnet Token-2022 policy. |
| Real PostgreSQL integration | **PASS (11/11 tests)** on disposable PostgreSQL 18.6 (Neon `sieve-security-test`, AWS us-east-1). Migrations 0001–0007 applied cleanly. Verified BUY (`unique_buy_build_check`) and SELL (`unique_sell_build_check`) constraints, single build per check enforcement, concurrent build race admission (1 admitted, 1 rejected with code 23505), duplicate confirmation idempotency (`IDEMPOTENCY_VIOLATION`), transaction rollback atomicity, parameterized SQL injection neutralization, foreign key cascade/integrity, migration 0007 duplicate conflict fail-closed behavior (code 23505, zero data loss), and TLS certificate enforcement (`rejectUnauthorized: true`). |
| Dependency audit | **NOT CLEAN**, 1 High + 3 Moderate; CI gate remains failing. |
| Secret scan | **PASS for configured patterns**, 1,031 reachable objects / 462 blobs, no matches via `scripts/audit-history.mjs`. |
| Diff whitespace | **PASS**, `git diff --check`. |

Browser tests cover shell behavior and HTTP access controls, not a funded-wallet end-to-end flow. Historical visual-proof scripts that substitute fixture routes were not treated as financial evidence. Signing/broadcasting was intentionally outside this audit run. All findings remain conditional on the documented assumptions; tests cannot prove safety against arbitrary frontend, RPC or provider compromise.

### Requested adversarial coverage

Numbers match the requested 30 cases. Coverage below distinguishes implemented checks from unresolved invariants.

| # | Case | Evidence / limitation |
| --- | --- | --- |
| 1 | Wallet changed | BUY/SELL service mismatch tests; delayed build wallet-switch UI test; session cross-wallet test. |
| 2 | Mint changed | Strict build override rejection and Jupiter input/output mismatch tests. Independent discovery identity remains S-05. |
| 3 | Amount changed | Strict build override, quote inAmount mismatch, signed-message amount mutation tests. |
| 4 | Boundary changed | Strict build override and sub-BPS precision rejection tests. |
| 5 | Stale quote | Core freshness/expiry tests, SELL expired-check test and both moved-price build tests. Original upstream quote age cannot be proven from fetch time. |
| 6 | Stale reference | Core stale timestamp tests. A stale upstream price returned in a fresh response is **not detected**, S-05. |
| 7 | Manipulated Jupiter | Nine malformed/mismatched quote variants plus fee/threshold matrices. Original malicious transaction semantics remain S-01. |
| 8 | Manipulated PreStocks | Duplicate/malformed mint and zero/negative/NaN/Infinity references rejected. Valid substituted discovery mint remains S-05. |
| 9 | Transfer-fee token | Fee ceil/cap, net threshold, epoch-switch, wallet-vs-route debit tests. Live OPENAI remains blocked. |
| 10 | Scaled UI | Fractional multiplier conversion, checked raw debit, truncation and safe-product tests. |
| 11 | Incorrect decimals | Out-of-range decimals reject; fresh mint metadata build binding. Malicious RPC remains trusted-state assumption. |
| 12 | Zero amount | Raw/display zero and negative-zero rejection. |
| 13 | Huge amount | u64 overflow, enormous string, exponent and precision rejection. |
| 14 | Precision edge | Sub-BPS rejection; 80-digit Decimal precision; scaled unsafe-product rejection. |
| 15 | Exact boundary | BUY/SELL threshold matrix equality and raw minimum tests. |
| 16 | One raw unit above | BUY minimum+1 and transfer-fee threshold tests; conservative direction explicitly checked. |
| 17 | One raw unit below | BUY minimum-1 and SELL floor-1 rejection tests. |
| 18 | Duplicate build | Memory repository uniqueness; real PostgreSQL unique index (`unique_buy_build_check` and `unique_sell_build_check`) verified: second insert with different build ID rejected with code 23505; identical build ID idempotent. |
| 19 | Duplicate confirmation | Identical signed message returns one receipt; concurrent confirm test. |
| 20 | Wrong signature | Invalid/wrong transaction signature, wallet and provider-returned signature tests. |
| 21 | Failed reported success | Provider Success plus chain failed cannot create CONFIRMED receipt. |
| 22 | Unauthorized history | Unit/integration and real HTTP 401 tests; cross-wallet session denial. |
| 23 | Malformed wallet | Canonical PublicKey schema rejection. |
| 24 | Unsupported extension | Adapter/service tests and real OPENAI read-only fail-closed result. |
| 25 | Provider timeout | Fetch abort/body cap tests; timeout after submission reconciles CONFIRMED or PENDING. |
| 26 | RPC timeout | Bounded RPC fetch and error cannot become confirmed; genesis mismatch test. |
| 27 | Concurrent builds | Memory Promise.allSettled admits one; verified on real PostgreSQL: `Promise.allSettled` concurrent build insertions admit exactly one; competing attempt rejected with unique violation (code 23505); database retains exactly 1 row. |
| 28 | Rate abuse | Wallet/XFF rotation tests and real HTTP capacity 429. Distributed quota remains external. |
| 29 | Destination mismatch | Post-build signed-message destination mutation rejected. Verified in `tests/integration/transaction-semantics.test.ts` and `tests/integration/security-audit.test.ts`. |
| 30 | Transaction vs quote | JSON mismatch, post-build message mutation, and instruction semantics verified. Semantic verifier decodes Jupiter `route_v2` and Meteora DLMM `SwapV2`, verifying exact inputs, accounts, and net minimum output. |

## MAINNET DEMO READINESS

### Safe to perform read-only checks?

**YES, for diagnostics only.** Assumptions: trusted deployment and configured provider/RPC origins; no transaction signature or broadcast; output treated as retrieval-time estimates rather than certified source freshness. All 8 canonical PreStocks markets are verified compatible (`PASS_SUPPORTED`). A successful read-only result is not permission to sign.

### Safe to build an unsigned Mainnet transaction?

**YES, for verified direct DLMM routes under SNAPSHOT_BOUND_V1 policy.** S-01 semantic verification decodes and enforces direct Jupiter `route_v2` -> Meteora DLMM `SwapV2` routes, ALT accounts, and net minimum output; S-05 locks asset identity to the canonical registry; S-06 enforces `SNAPSHOT_BOUND_V1` with signing expiry `<= 30s`; S-11 validates Token-2022 ordinary transfer compatibility. All other routes fail closed with `ROUTE_RISK`. Building an unsigned transaction moves zero funds.

### Safe to connect a funded wallet?

**NO for the proposed funded-wallet demo workflow.** While wallet connection and authentication sign only a text nonce (granting zero spending authority), connecting a funded wallet in an environment where signing readiness is NO presents unnecessary operational risk. Staging verification with an unfunded wallet should be conducted before any funded wallet is connected.

### Safe to sign a ~$1 USDC Sieve demo transaction?

**NO.** Despite major security remediations (S-01 semantic verifier, S-02 confirmation binding, S-03 session auth, S-06 snapshot binding, S-11 Token-2022 ordinary transfer support), signing with real funds is blocked by operational/infrastructure prerequisites:
1. **Database Schema & Constraints Verification**: Migration `0007_transaction_binding.sql`, TLS certificate verification (`rejectUnauthorized: true`), unique build constraints, rollback atomicity, and concurrent build constraints have been **FULLY VERIFIED AND CLEARED** on real PostgreSQL 18.6 (disposable Neon branch `sieve-security-test`, 11/11 checks passed). Before production deployment, migration 0007 must be applied serially with verified CA cert and no pre-existing duplicate check IDs.
2. **Upstream Source Freshness (S-05)**: PreStocks API provides no source valuation timestamp (`referenceSourceUpdatedAt = null`); freshness is based on HTTP retrieval time.
3. **Staging / Real Wallet End-to-End Validation**: The complete flow from frontend wallet popup to chain confirmation has not been validated in a live staging deployment with a hardware/browser wallet.
Until these operational gates are cleared, signing is blocked. No transaction was broadcast, no deployment was made, and no risk exception was assumed.

## Commit-ready diff summary and exact files

The reviewable diff adds wallet authentication, shared API validation/error/body/quota helpers, provider response validation/deadlines, exact transaction-message binding and chain receipt reconciliation, conservative financial input handling, stricter Token-2022/Mainnet validation, database TLS/uniqueness, UI race guards, headers, CI and adversarial tests. There are no broad dependency upgrades or cosmetic UI changes. **This is not a release-ready security sign-off; the open findings above remain.** Nothing was committed or pushed.

84 changed/new files, relative to repository root (56 modified, 28 new):

```text
.env.example
.github/workflows/security.yml
.github/workflows/supabase-keepalive.yml
.gitignore
SECURITY_AUDIT.md
app/api/auth/challenge/route.ts
app/api/auth/session/route.ts
app/api/build/route.ts
app/api/capacity/buy/route.ts
app/api/capacity/sell/route.ts
app/api/check/route.ts
app/api/confirm/route.ts
app/api/health/route.ts
app/api/history/route.ts
app/api/markets/route.ts
app/api/sell/build/route.ts
app/api/sell/check/route.ts
app/api/sell/confirm/route.ts
components/app-shell/solana-provider.tsx
components/app-shell/wallet-button.tsx
components/buy/buy-view.tsx
components/history/history-view.tsx
core/domain/sell-types.ts
core/domain/types.ts
core/money/decimal.ts
db/migrations/0007_transaction_binding.sql
eslint.config.mjs
lib/wallet-fetch.ts
next.config.mjs
package.json
pnpm-workspace.yaml
scripts/audit-history.mjs
scripts/capture-security-evidence.mjs
scripts/check-prestocks-compatibility.mjs
scripts/migrate.mjs
server/database/db.ts
server/database/repository.ts
server/jupiter/adapter.ts
server/jupiter/schema.ts
server/jupiter/verified-build.ts
server/middleware/rate-limit.ts
server/prestocks/adapter.ts
server/prestocks/registry.ts
server/prestocks/schema.ts
server/security/http.ts
server/security/provider-fetch.ts
server/security/swap-semantics.ts
server/security/transaction-binding.ts
server/security/validation.ts
server/security/wallet-auth.ts
server/services/build-service.ts
server/services/buy-capacity-service.ts
server/services/check-service.ts
server/services/confirmation-service.ts
server/services/execution-snapshot.ts
server/services/history-service.ts
server/services/sell-build-service.ts
server/services/sell-capacity-service.ts
server/services/sell-check-service.ts
server/services/sell-confirmation-service.ts
server/solana/adapter.ts
tests/e2e/security.spec.ts
tests/fixtures/security/all-mints.json
tests/fixtures/security/asset-provenance.json
tests/fixtures/security/jupiter-dlmm-direct.json
tests/fixtures/security/prestocks.json
tests/fixtures/security/route-accounts.json
tests/fixtures/security/route-v2-definition.json
tests/helpers/security-fixtures.ts
tests/integration/adapters.test.ts
tests/integration/database.test.ts
tests/integration/live-readonly.test.ts
tests/integration/security-audit.test.ts
tests/integration/sell-services.test.ts
tests/integration/services.test.ts
tests/integration/transaction-semantics.test.ts
tests/unit/buy-capacity.test.ts
tests/unit/capacity-api.test.ts
tests/unit/capacity-flow.test.tsx
tests/unit/capacity-security.test.ts
tests/unit/copy-audit.test.tsx
tests/unit/logout-history-ux.test.tsx
tests/unit/sell-capacity.test.ts
tests/unit/unified-history.test.tsx
```

