# Sieve

Sieve is a valuation-aware execution guard for PreStocks on Solana.

A user chooses a PreStocks asset, chooses SOL or USDC, enters an amount, and sets the maximum premium above the current PreStocks reference price they are willing to accept.

Sieve checks the live market route. If the live buy price is still inside the user's chosen boundary, the user can continue to wallet review. If it is outside the boundary, Sieve creates no buy transaction.

## User promise

**You choose the price limit. Sieve checks the market before you sign.**

## Why this exists

Tokenized private-market assets can trade above or below a reference value. Seeing the difference is useful, but a chart or dashboard still leaves the user to manually enforce their decision.

Sieve turns the user's price decision into a rule:

> Do not prepare this buy if the current market requires paying more than I accepted.

That is the entire wedge.

## Supported funding assets

* SOL
* USDC

No arbitrary token input in the MVP.

## Network

Sieve is a Solana Mainnet-only application. Production routes use current PreStocks data, Solana Mainnet mint state, and Jupiter Mainnet liquidity. There is no user-selectable network or simulated execution mode.

Automated tests use isolated deterministic adapters and fixtures. Those fixtures are test-only dependencies and are never reachable from application routes.

## Primary screens

* Landing
* Private markets
* Buy
* Good to go
* Price too high
* Ready to buy
* Waiting for your wallet
* Trade sent
* Trade complete
* Trade not completed
* History
* Trade detail
* Preferences

## Technical shape

* Next.js App Router
* TypeScript
* server-side integration adapters
* pure deterministic pricing/policy core
* current Solana wallet integration
* Jupiter Swap API V2
* PreStocks public API
* Solana Mainnet
* Postgres persistence
* responsive UI
* Motion/CSS based interaction system

Exact library versions must be chosen from current official documentation during the build.

## 
