import type { MarketAsset, MarketQuote, FundingValuation } from "../../core/domain/types";

export interface FixtureScenario {
  id: string;
  name: string;
  description: string;
  asset: MarketAsset;
  funding: FundingValuation;
  quote: MarketQuote;
  maxPremiumPct: string;
  revalidationQuote?: MarketQuote; // For pass-then-move scenarios
}

const NOW = Date.now();

export const FIXTURE_ASSETS: MarketAsset[] = [
  {
    name: "OpenAI (Practice)",
    symbol: "OPENAI",
    mint: "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF",
    imageUrl: "https://www.prestocks.com/logos/openai.png",
    productUrl: "https://www.prestocks.com/openai",
    referencePriceUsd: "100.00",
    tokenPriceUsd: "103.00",
    referenceValuationUsd: "120000000000",
    impliedValuationUsd: "123600000000",
    supply: "1000000",
    source: "PRACTICE_FIXTURE",
    observedAt: new Date(NOW - 5000).toISOString(),
    network: "testnet",
  },
  {
    name: "SpaceX (Practice)",
    symbol: "SPACEX",
    mint: "PreANxuXjsy2pvisWWMNB6YaJNzr7681wJJr2rHsfTh",
    imageUrl: "https://www.prestocks.com/logos/spacex.png",
    productUrl: "https://www.prestocks.com/spacex",
    referencePriceUsd: "150.00",
    tokenPriceUsd: "155.00",
    referenceValuationUsd: "200000000000",
    impliedValuationUsd: "206666666666",
    supply: "1333333",
    source: "PRACTICE_FIXTURE",
    observedAt: new Date(NOW - 5000).toISOString(),
    network: "testnet",
  },
  {
    name: "Anthropic (Practice)",
    symbol: "ANTHROPIC",
    mint: "Pren1FvFX6J3E4kXhJuCiAD5aDmGEb7qJRncwA8Lkhw",
    imageUrl: "https://www.prestocks.com/logos/anthropic.png",
    productUrl: "https://www.prestocks.com/anthropic",
    referencePriceUsd: "500.00",
    tokenPriceUsd: "510.00",
    referenceValuationUsd: "50000000000",
    impliedValuationUsd: "51000000000",
    supply: "100000",
    source: "PRACTICE_FIXTURE",
    observedAt: new Date(NOW - 5000).toISOString(),
    network: "testnet",
  },
];

export const FIXTURE_SCENARIOS: Record<string, FixtureScenario> = {
  PASS_BASIC: {
    id: "PASS_BASIC",
    name: "Pass Basic",
    description: "Current buy price is $103.00, within the 5.00% limit ($105.00 max).",
    asset: FIXTURE_ASSETS[0],
    funding: {
      fundingAsset: "USDC",
      inputRaw: 10_000_000n, // 10 USDC
      inputDisplay: "10",
      inputUsdValue: "10.00",
      method: "PRACTICE_FIXTURE",
      observedAt: new Date(NOW - 3000).toISOString(),
    },
    quote: {
      provider: "PRACTICE_FIXTURE",
      inputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      outputMint: "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF",
      inputRaw: 10_000_000n,
      outputRaw: 97_087n, // 10 / 103 = 0.097087 tokens -> $103.00/token
      outputDecimals: 6,
      expectedTargetAmount: "0.097087",
      priceImpactPct: "-0.50",
      observedAt: new Date(NOW - 2000).toISOString(),
      expiresAt: new Date(NOW + 30_000).toISOString(),
      routeFingerprint: "fixture-pass-basic",
    },
    maxPremiumPct: "5.00",
  },

  PASS_EXACT_BOUNDARY: {
    id: "PASS_EXACT_BOUNDARY",
    name: "Pass Exact Boundary",
    description: "Current buy price is exactly $105.00, matching the 5.00% limit.",
    asset: FIXTURE_ASSETS[0],
    funding: {
      fundingAsset: "USDC",
      inputRaw: 105_000_000n,
      inputDisplay: "105",
      inputUsdValue: "105.00",
      method: "PRACTICE_FIXTURE",
      observedAt: new Date(NOW - 3000).toISOString(),
    },
    quote: {
      provider: "PRACTICE_FIXTURE",
      inputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      outputMint: "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF",
      inputRaw: 105_000_000n,
      outputRaw: 1_000_000n, // 105 / 105 = 1.000000 token -> exactly $105.00/token
      outputDecimals: 6,
      expectedTargetAmount: "1.000000",
      priceImpactPct: "-0.80",
      observedAt: new Date(NOW - 2000).toISOString(),
      expiresAt: new Date(NOW + 30_000).toISOString(),
      routeFingerprint: "fixture-pass-exact",
    },
    maxPremiumPct: "5.00",
  },

  BLOCK_ONE_BP_OVER: {
    id: "BLOCK_ONE_BP_OVER",
    name: "Block One BP Over",
    description: "Current buy price is $105.01, exceeding the 5.00% limit ($105.00 max).",
    asset: FIXTURE_ASSETS[0],
    funding: {
      fundingAsset: "USDC",
      inputRaw: 10_000_000n,
      inputDisplay: "10",
      inputUsdValue: "10.00",
      method: "PRACTICE_FIXTURE",
      observedAt: new Date(NOW - 3000).toISOString(),
    },
    quote: {
      provider: "PRACTICE_FIXTURE",
      inputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      outputMint: "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF",
      inputRaw: 10_000_000n,
      outputRaw: 95_229n, // 10 / 105.01 = 0.095229 tokens -> $105.01/token
      outputDecimals: 6,
      expectedTargetAmount: "0.095229",
      priceImpactPct: "-1.00",
      observedAt: new Date(NOW - 2000).toISOString(),
      expiresAt: new Date(NOW + 30_000).toISOString(),
      routeFingerprint: "fixture-block-one-bp",
    },
    maxPremiumPct: "5.00",
  },

  DISCOUNT: {
    id: "DISCOUNT",
    name: "Discount",
    description: "Current buy price is $92.00, trading at an 8.00% discount to reference.",
    asset: FIXTURE_ASSETS[0],
    funding: {
      fundingAsset: "USDC",
      inputRaw: 10_000_000n,
      inputDisplay: "10",
      inputUsdValue: "10.00",
      method: "PRACTICE_FIXTURE",
      observedAt: new Date(NOW - 3000).toISOString(),
    },
    quote: {
      provider: "PRACTICE_FIXTURE",
      inputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      outputMint: "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF",
      inputRaw: 10_000_000n,
      outputRaw: 108_695n, // 10 / 92 = 0.108695 tokens -> $92.00/token
      outputDecimals: 6,
      expectedTargetAmount: "0.108695",
      priceImpactPct: "-0.20",
      observedAt: new Date(NOW - 2000).toISOString(),
      expiresAt: new Date(NOW + 30_000).toISOString(),
      routeFingerprint: "fixture-discount",
    },
    maxPremiumPct: "5.00",
  },

  STALE_REFERENCE: {
    id: "STALE_REFERENCE",
    name: "Stale Reference",
    description: "Reference price was observed 75 seconds ago (> 60s max age).",
    asset: {
      ...FIXTURE_ASSETS[0],
      observedAt: new Date(NOW - 75_000).toISOString(),
    },
    funding: {
      fundingAsset: "USDC",
      inputRaw: 10_000_000n,
      inputDisplay: "10",
      inputUsdValue: "10.00",
      method: "PRACTICE_FIXTURE",
      observedAt: new Date(NOW - 3000).toISOString(),
    },
    quote: {
      provider: "PRACTICE_FIXTURE",
      inputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      outputMint: "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF",
      inputRaw: 10_000_000n,
      outputRaw: 97_087n,
      outputDecimals: 6,
      expectedTargetAmount: "0.097087",
      priceImpactPct: "-0.50",
      observedAt: new Date(NOW - 2000).toISOString(),
      expiresAt: new Date(NOW + 30_000).toISOString(),
      routeFingerprint: "fixture-stale-ref",
    },
    maxPremiumPct: "5.00",
  },

  STALE_QUOTE: {
    id: "STALE_QUOTE",
    name: "Stale Quote",
    description: "Market quote was observed 45 seconds ago (> 30s max age).",
    asset: FIXTURE_ASSETS[0],
    funding: {
      fundingAsset: "USDC",
      inputRaw: 10_000_000n,
      inputDisplay: "10",
      inputUsdValue: "10.00",
      method: "PRACTICE_FIXTURE",
      observedAt: new Date(NOW - 3000).toISOString(),
    },
    quote: {
      provider: "PRACTICE_FIXTURE",
      inputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      outputMint: "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF",
      inputRaw: 10_000_000n,
      outputRaw: 97_087n,
      outputDecimals: 6,
      expectedTargetAmount: "0.097087",
      priceImpactPct: "-0.50",
      observedAt: new Date(NOW - 45_000).toISOString(),
      expiresAt: new Date(NOW - 5000).toISOString(),
      routeFingerprint: "fixture-stale-quote",
    },
    maxPremiumPct: "5.00",
  },

  NO_ROUTE: {
    id: "NO_ROUTE",
    name: "No Route",
    description: "No market route available for this amount.",
    asset: FIXTURE_ASSETS[0],
    funding: {
      fundingAsset: "USDC",
      inputRaw: 100_000_000n,
      inputDisplay: "100",
      inputUsdValue: "100.00",
      method: "PRACTICE_FIXTURE",
      observedAt: new Date(NOW - 3000).toISOString(),
    },
    quote: {
      provider: "PRACTICE_FIXTURE",
      inputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      outputMint: "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF",
      inputRaw: 100_000_000n,
      outputRaw: 0n, // Zero output
      outputDecimals: 6,
      expectedTargetAmount: "0",
      priceImpactPct: null,
      observedAt: new Date(NOW - 2000).toISOString(),
      expiresAt: null,
      routeFingerprint: "fixture-no-route",
    },
    maxPremiumPct: "5.00",
  },

  HIGH_IMPACT: {
    id: "HIGH_IMPACT",
    name: "High Price Impact",
    description: "Route has 15.0% price impact, exceeding the 10.0% safety cap.",
    asset: FIXTURE_ASSETS[0],
    funding: {
      fundingAsset: "USDC",
      inputRaw: 50_000_000n,
      inputDisplay: "50",
      inputUsdValue: "50.00",
      method: "PRACTICE_FIXTURE",
      observedAt: new Date(NOW - 3000).toISOString(),
    },
    quote: {
      provider: "PRACTICE_FIXTURE",
      inputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      outputMint: "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF",
      inputRaw: 50_000_000n,
      outputRaw: 485_436n,
      outputDecimals: 6,
      expectedTargetAmount: "0.485436",
      priceImpactPct: "-15.00",
      observedAt: new Date(NOW - 2000).toISOString(),
      expiresAt: new Date(NOW + 30_000).toISOString(),
      routeFingerprint: "fixture-high-impact",
    },
    maxPremiumPct: "5.00",
  },

  PASS_THEN_MOVE: {
    id: "PASS_THEN_MOVE",
    name: "Pass Then Move",
    description: "Initial check passes at $103 (3% premium), but at build time price moved to $108 (8% premium), blocking the transaction.",
    asset: FIXTURE_ASSETS[0],
    funding: {
      fundingAsset: "USDC",
      inputRaw: 10_000_000n,
      inputDisplay: "10",
      inputUsdValue: "10.00",
      method: "PRACTICE_FIXTURE",
      observedAt: new Date(NOW - 3000).toISOString(),
    },
    quote: {
      provider: "PRACTICE_FIXTURE",
      inputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      outputMint: "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF",
      inputRaw: 10_000_000n,
      outputRaw: 97_087n, // $103/token initially
      outputDecimals: 6,
      expectedTargetAmount: "0.097087",
      priceImpactPct: "-0.50",
      observedAt: new Date(NOW - 2000).toISOString(),
      expiresAt: new Date(NOW + 30_000).toISOString(),
      routeFingerprint: "fixture-pass-then-move-init",
    },
    revalidationQuote: {
      provider: "PRACTICE_FIXTURE",
      inputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      outputMint: "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF",
      inputRaw: 10_000_000n,
      outputRaw: 92_592n, // 10 / 108 = 0.092592 tokens -> $108.00/token at build time!
      outputDecimals: 6,
      expectedTargetAmount: "0.092592",
      priceImpactPct: "-1.20",
      observedAt: new Date(NOW).toISOString(),
      expiresAt: new Date(NOW + 30_000).toISOString(),
      routeFingerprint: "fixture-pass-then-move-reval",
    },
    maxPremiumPct: "5.00",
  },

  SOL_PASS: {
    id: "SOL_PASS",
    name: "SOL Pass",
    description: "0.1 SOL funding (~$15.00 USD) for OpenAI PreStocks, buy price $103.00, inside 5.00% limit.",
    asset: FIXTURE_ASSETS[0],
    funding: {
      fundingAsset: "SOL",
      inputRaw: 100_000_000n, // 0.1 SOL
      inputDisplay: "0.1",
      inputUsdValue: "15.00", // $150/SOL
      method: "PRACTICE_FIXTURE",
      observedAt: new Date(NOW - 3000).toISOString(),
    },
    quote: {
      provider: "PRACTICE_FIXTURE",
      inputMint: "So11111111111111111111111111111111111111112",
      outputMint: "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF",
      inputRaw: 100_000_000n,
      outputRaw: 145_631n, // 15 / 103 = 0.145631 tokens
      outputDecimals: 6,
      expectedTargetAmount: "0.145631",
      priceImpactPct: "-0.60",
      observedAt: new Date(NOW - 2000).toISOString(),
      expiresAt: new Date(NOW + 30_000).toISOString(),
      routeFingerprint: "fixture-sol-pass",
    },
    maxPremiumPct: "5.00",
  },
};
