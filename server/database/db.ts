import postgres from "postgres";
import {
  type ISieveRepository,
  type ListFilterParams,
  InMemorySieveRepository,
} from "./repository";
import type {
  PriceCheck,
  BuildIntent,
  TradeReceipt,
} from "../../core/domain/types";
import { toDecimal } from "../../core/money/decimal";
import { SieveAppError } from "../services/errors";

export class PostgresSieveRepository implements ISieveRepository {
  private sql: postgres.Sql;

  constructor(connectionStringOrSql: string | postgres.Sql) {
    if (typeof connectionStringOrSql === "string") {
      this.sql = postgres(connectionStringOrSql, {
        max: 10,
        idle_timeout: 20,
        connect_timeout: 10,
      });
    } else {
      this.sql = connectionStringOrSql;
    }
  }

  async savePriceCheck(check: PriceCheck): Promise<void> {
    await this.sql`
      INSERT INTO price_checks (
        id, network, wallet,
        target_name, target_symbol, target_mint,
        funding_asset, funding_mint, funding_amount_raw, funding_amount_display, funding_usd_value,
        reference_price_usd, reference_observed_at, reference_source,
        quote_output_raw, quote_output_display, quote_observed_at, quote_expires_at,
        route_fingerprint, price_impact_pct,
        current_buy_price_usd, maximum_buy_price_usd, premium_bps, max_premium_bps,
        decision, reason_code, client_intent_version,
        created_at, expires_at,
        funding_method, quote_output_decimals
      ) VALUES (
        ${check.id}, ${check.network}, ${check.wallet},
        ${check.asset.name}, ${check.asset.symbol}, ${check.asset.mint},
        ${check.funding.fundingAsset}, ${check.quote?.inputMint ?? ""}, ${check.funding.inputRaw.toString()}, ${check.funding.inputDisplay}, ${check.funding.inputUsdValue},
        ${check.decision.referencePriceUsd}, ${check.asset.observedAt}, ${check.asset.source},
        ${check.quote?.outputRaw.toString() ?? null}, ${check.quote?.expectedTargetAmount ?? null}, ${check.quote?.observedAt ?? null}, ${check.quote?.expiresAt ?? null},
        ${check.quote?.routeFingerprint ?? null}, ${check.quote?.priceImpactPct ?? null},
        ${check.decision.currentBuyPriceUsd}, ${check.decision.maximumBuyPriceUsd}, ${check.decision.premiumBps}, ${check.maxPremiumBps},
        ${check.decision.status}, ${check.decision.status !== "GOOD_TO_GO" ? check.decision.status : null}, ${check.clientIntentVersion},
        ${check.createdAt}, ${check.expiresAt},
        ${check.funding.method}, ${check.quote?.outputDecimals ?? null}
      )
      ON CONFLICT (id) DO NOTHING
    `;
  }

  async getPriceCheck(id: string): Promise<PriceCheck | null> {
    const rows = await this.sql`
      SELECT * FROM price_checks WHERE id = ${id} LIMIT 1
    `;
    if (rows.length === 0) return null;
    return this.mapPriceCheckRow(rows[0]);
  }

  async listPriceChecks(params: ListFilterParams = {}): Promise<PriceCheck[]> {
    const limit = params.limit ?? 50;
    const offset = params.offset ?? 0;

    let rows;
    if (params.wallet && params.network) {
      rows = await this.sql`
        SELECT * FROM price_checks
        WHERE wallet = ${params.wallet} AND network = ${params.network}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    } else if (params.wallet) {
      rows = await this.sql`
        SELECT * FROM price_checks
        WHERE wallet = ${params.wallet}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    } else if (params.network) {
      rows = await this.sql`
        SELECT * FROM price_checks
        WHERE network = ${params.network}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    } else {
      rows = await this.sql`
        SELECT * FROM price_checks
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    }

    return rows.map((r) => this.mapPriceCheckRow(r));
  }

  async saveBuildIntent(intent: BuildIntent): Promise<void> {
    const premiumBps = toDecimal(intent.summary.premiumPct).times(100).round().toNumber();
    await this.sql`
      INSERT INTO build_intents (
        id, check_id, wallet, network,
        revalidation_reference_price_usd, revalidation_buy_price_usd, revalidation_premium_bps,
        minimum_output_raw, protection_method, protection_value,
        provider_request_id, transaction_hash, last_valid_block_height,
        funding_asset, funding_amount_display, target_symbol, expected_target_amount, max_premium_pct,
        expires_at, status, created_at
      ) VALUES (
        ${intent.id}, ${intent.checkId}, ${intent.wallet}, ${intent.network},
        ${intent.summary.referencePriceUsd}, ${intent.summary.currentBuyPriceUsd}, ${premiumBps},
        ${intent.minimumAcceptableOutputRaw.toString()}, ${intent.protectionMethod}, null,
        ${intent.requestId ?? null}, null, ${intent.lastValidBlockHeight ?? null},
        ${intent.summary.fundingAsset}, ${intent.summary.fundingAmount}, ${intent.summary.targetSymbol}, ${intent.summary.expectedTargetAmount}, ${intent.summary.maxPremiumPct},
        ${intent.expiresAt}, 'READY_FOR_WALLET', NOW()
      )
      ON CONFLICT (id) DO NOTHING
    `;
  }

  async getBuildIntent(id: string): Promise<BuildIntent | null> {
    const rows = await this.sql`
      SELECT * FROM build_intents WHERE id = ${id} LIMIT 1
    `;
    if (rows.length === 0) return null;
    const r = rows[0];

    // Fail closed if any required persisted lifecycle field is missing (Defect 9)
    if (
      !r.funding_asset ||
      r.funding_amount_display == null ||
      !r.target_symbol ||
      r.expected_target_amount == null ||
      r.max_premium_pct == null
    ) {
      throw new Error(
        `Persisted build intent ${id} is missing required lifecycle fields; database integrity check failed`
      );
    }

    return {
      id: r.id,
      checkId: r.check_id,
      network: r.network,
      wallet: r.wallet,
      minimumAcceptableOutputRaw: BigInt(r.minimum_output_raw),
      protectionMethod: r.protection_method,
      transactionBase64: "", // Not persisted in DB for size/security
      lastValidBlockHeight: r.last_valid_block_height?.toString(),
      requestId: r.provider_request_id,
      expiresAt: r.expires_at instanceof Date ? r.expires_at.toISOString() : new Date(r.expires_at).toISOString(),
      summary: {
        fundingAsset: r.funding_asset as any,
        fundingAmount: r.funding_amount_display.toString(),
        targetSymbol: r.target_symbol,
        expectedTargetAmount: r.expected_target_amount.toString(),
        referencePriceUsd: r.revalidation_reference_price_usd.toString(),
        currentBuyPriceUsd: r.revalidation_buy_price_usd.toString(),
        premiumPct: (r.revalidation_premium_bps / 100).toFixed(2),
        maxPremiumPct: r.max_premium_pct.toString(),
      },
    };
  }

  async saveTradeReceipt(receipt: TradeReceipt): Promise<TradeReceipt> {
    const rows = await this.sql`
      INSERT INTO trade_receipts (
        id, check_id, build_intent_id, wallet, network, signature, internal_execution_id, status,
        funding_asset, funding_amount_display, requested_funding_amount, actual_funding_amount,
        target_symbol, target_mint, expected_target_amount, realized_target_amount,
        reference_price_usd, checked_buy_price_usd, max_premium_bps, premium_bps,
        submitted_at, confirmed_at, failure_code, created_at
      ) VALUES (
        ${receipt.id}, ${receipt.checkId}, ${receipt.buildIntentId}, ${receipt.wallet}, ${receipt.network},
        ${receipt.signature ?? null}, ${receipt.internalExecutionId ?? null}, ${receipt.status},
        ${receipt.fundingAsset}, ${receipt.fundingAmount}, ${receipt.requestedFundingAmount}, ${receipt.actualFundingAmount ?? null},
        ${receipt.targetSymbol}, ${receipt.targetMint}, ${receipt.expectedTargetAmount}, ${receipt.realizedTargetAmount},
        ${receipt.referencePriceUsd}, ${receipt.checkedBuyPriceUsd}, ${receipt.maxPremiumBps}, ${receipt.premiumBps},
        ${receipt.submittedAt}, ${receipt.confirmedAt}, ${receipt.failureCode ?? null}, NOW()
      )
      ON CONFLICT (signature) DO NOTHING
      RETURNING *
    `;
    if (rows.length === 0) {
      if (!receipt.signature) {
        throw new SieveAppError("INTERNAL_ERROR", "Failed to insert trade receipt without signature");
      }
      const existing = await this.getTradeReceiptBySignature(receipt.signature);
      if (!existing) {
        throw new SieveAppError("INTERNAL_ERROR", "Conflicting trade receipt not found");
      }
      if (
        existing.buildIntentId !== receipt.buildIntentId ||
        existing.checkId !== receipt.checkId ||
        existing.wallet !== receipt.wallet ||
        existing.network !== receipt.network
      ) {
        throw new SieveAppError(
          "IDEMPOTENCY_VIOLATION",
          "Signature belongs to a different trade receipt or build intent"
        );
      }
      return existing;
    }
    return this.mapReceiptRow(rows[0]);
  }

  async getTradeReceiptBySignature(signature: string): Promise<TradeReceipt | null> {
    const rows = await this.sql`
      SELECT * FROM trade_receipts WHERE signature = ${signature} LIMIT 1
    `;
    if (rows.length === 0) return null;
    return this.mapReceiptRow(rows[0]);
  }

  async listTradeReceipts(params: ListFilterParams = {}): Promise<TradeReceipt[]> {
    const limit = params.limit ?? 50;
    const offset = params.offset ?? 0;

    let rows;
    if (params.wallet && params.network) {
      rows = await this.sql`
        SELECT * FROM trade_receipts
        WHERE wallet = ${params.wallet} AND network = ${params.network}
        ORDER BY submitted_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    } else if (params.wallet) {
      rows = await this.sql`
        SELECT * FROM trade_receipts
        WHERE wallet = ${params.wallet}
        ORDER BY submitted_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    } else if (params.network) {
      rows = await this.sql`
        SELECT * FROM trade_receipts
        WHERE network = ${params.network}
        ORDER BY submitted_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    } else {
      rows = await this.sql`
        SELECT * FROM trade_receipts
        ORDER BY submitted_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    }

    return rows.map((r) => this.mapReceiptRow(r));
  }

  private mapPriceCheckRow(r: Record<string, any>): PriceCheck {
    return {
      id: r.id,
      network: r.network,
      wallet: r.wallet,
      clientIntentVersion: r.client_intent_version,
      asset: {
        name: r.target_name,
        symbol: r.target_symbol,
        mint: r.target_mint,
        imageUrl: null,
        productUrl: null,
        referencePriceUsd: r.reference_price_usd.toString(),
        tokenPriceUsd: null,
        referenceValuationUsd: null,
        impliedValuationUsd: null,
        supply: null,
        source: r.reference_source,
        observedAt: r.reference_observed_at.toISOString(),
        network: r.network,
      },
      funding: {
        fundingAsset: r.funding_asset,
        inputRaw: BigInt(r.funding_amount_raw),
        inputDisplay: r.funding_amount_display.toString(),
        inputUsdValue: r.funding_usd_value.toString(),
        method: (r.funding_method as any) ?? (r.funding_asset === "USDC" ? "USDC_PAR" : "CURRENT_MARKET_ROUTE"),
        observedAt: r.created_at.toISOString(),
      },
      quote: r.quote_output_raw
        ? {
            provider: "JUPITER",
            inputMint: r.funding_mint,
            outputMint: r.target_mint,
            inputRaw: BigInt(r.funding_amount_raw),
            outputRaw: BigInt(r.quote_output_raw),
            outputDecimals: r.quote_output_decimals != null ? Number(r.quote_output_decimals) : (r.target_mint?.startsWith("Pre") ? 9 : 6),
            expectedTargetAmount: r.quote_output_display.toString(),
            priceImpactPct: r.price_impact_pct?.toString() ?? null,
            observedAt: r.quote_observed_at?.toISOString() ?? r.created_at.toISOString(),
            expiresAt: r.quote_expires_at?.toISOString() ?? null,
            routeFingerprint: r.route_fingerprint ?? "",
          }
        : null,
      maxPremiumPct: (r.max_premium_bps / 100).toFixed(2),
      maxPremiumBps: r.max_premium_bps,
      decision: {
        status: r.decision,
        isExecutable: r.decision === "GOOD_TO_GO",
        referencePriceUsd: r.reference_price_usd.toString(),
        currentBuyPriceUsd: r.current_buy_price_usd?.toString() ?? null,
        maximumBuyPriceUsd: r.maximum_buy_price_usd.toString(),
        premiumPct: r.premium_bps != null ? (r.premium_bps / 100).toFixed(2) : null,
        maxPremiumPct: (r.max_premium_bps / 100).toFixed(2),
        premiumBps: r.premium_bps,
        maxPremiumBps: r.max_premium_bps,
        differenceUsd: null,
        displayTitle: r.decision === "GOOD_TO_GO" ? "The price is inside your limit." : "This buy is outside your limit.",
        displayMessage: "",
      },
      createdAt: r.created_at.toISOString(),
      expiresAt: r.expires_at?.toISOString() ?? r.created_at.toISOString(),
    };
  }

  private mapReceiptRow(r: Record<string, any>): TradeReceipt {
    const actualFunding = r.actual_funding_amount != null ? r.actual_funding_amount.toString() : null;
    const requestedFunding = r.requested_funding_amount != null ? r.requested_funding_amount.toString() : r.funding_amount_display.toString();
    return {
      id: r.id,
      checkId: r.check_id,
      buildIntentId: r.build_intent_id,
      wallet: r.wallet,
      network: r.network,
      signature: r.signature ?? null,
      internalExecutionId: r.internal_execution_id ?? null,
      status: r.status,
      fundingAsset: r.funding_asset,
      fundingAmount: actualFunding ?? requestedFunding,
      requestedFundingAmount: requestedFunding,
      actualFundingAmount: actualFunding,
      targetSymbol: r.target_symbol,
      targetMint: r.target_mint,
      expectedTargetAmount: r.expected_target_amount.toString(),
      realizedTargetAmount: r.realized_target_amount?.toString() ?? null,
      referencePriceUsd: r.reference_price_usd.toString(),
      checkedBuyPriceUsd: r.checked_buy_price_usd.toString(),
      maxPremiumBps: r.max_premium_bps,
      premiumBps: r.premium_bps,
      submittedAt: r.submitted_at.toISOString(),
      confirmedAt: r.confirmed_at?.toISOString() ?? null,
      failureCode: r.failure_code,
    };
  }
}

// Global repository singleton: uses Postgres if DATABASE_URL is set, otherwise InMemory
const globalForRepo = globalThis as unknown as {
  sieveRepoInstance?: ISieveRepository;
};

export function getRepository(): ISieveRepository {
  if (!globalForRepo.sieveRepoInstance) {
    if (process.env.DATABASE_URL) {
      globalForRepo.sieveRepoInstance = new PostgresSieveRepository(process.env.DATABASE_URL);
    } else {
      if (
        process.env.NODE_ENV === "production" &&
        process.env.NEXT_PHASE !== "phase-production-build"
      ) {
        throw new Error("DATABASE_URL must be configured in production environment");
      }
      globalForRepo.sieveRepoInstance = new InMemorySieveRepository();
    }
  }
  return globalForRepo.sieveRepoInstance;
}

export function setRepository(repo: ISieveRepository): void {
  globalForRepo.sieveRepoInstance = repo;
}
