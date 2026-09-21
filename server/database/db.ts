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
import type { SellBuildIntent, SellPriceCheck, SellTradeReceipt } from "../../core/domain/sell-types";
import { toDecimal } from "../../core/money/decimal";
import { SieveAppError } from "../services/errors";

export class PostgresSieveRepository implements ISieveRepository {
  private sql: postgres.Sql;

  constructor(connectionStringOrSql: string | postgres.Sql) {
    if (typeof connectionStringOrSql === "string") {
      this.sql = postgres(connectionStringOrSql, {
        max: 1,
        prepare: false,
        ssl: "require",
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
        expires_at, status, created_at,
        target_decimals, active_multiplier, chain_timestamp, epoch
      ) VALUES (
        ${intent.id}, ${intent.checkId}, ${intent.wallet}, ${intent.network},
        ${intent.summary.referencePriceUsd}, ${intent.summary.currentBuyPriceUsd}, ${premiumBps},
        ${intent.minimumAcceptableOutputRaw.toString()}, ${intent.protectionMethod}, null,
        ${intent.requestId ?? null}, null, ${intent.lastValidBlockHeight ?? null},
        ${intent.summary.fundingAsset}, ${intent.summary.fundingAmount}, ${intent.summary.targetSymbol}, ${intent.summary.expectedTargetAmount}, ${intent.summary.maxPremiumPct},
        ${intent.expiresAt}, 'READY_FOR_WALLET', NOW(),
        ${intent.summary.targetDecimals ?? null}, ${intent.summary.activeMultiplier ?? null}, ${intent.summary.chainTimestamp ?? null}, ${intent.summary.epoch ?? null}
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
    if (r.network !== "mainnet") {
      throw new SieveAppError("DATABASE_INTEGRITY_ERROR", "Non-Mainnet build intent cannot be loaded by the Mainnet-only runtime");
    }

    // Fail closed if any required persisted lifecycle field is missing (Defect 9)
    if (
      !r.funding_asset ||
      r.funding_amount_display == null ||
      !r.target_symbol ||
      r.expected_target_amount == null ||
      r.max_premium_pct == null
    ) {
      throw new SieveAppError(
        "DATABASE_INTEGRITY_ERROR",
        `Persisted build intent ${id} is missing required lifecycle fields; database integrity check failed`
      );
    }

    // Fail closed if target_decimals is missing (Requirement 3)
    if (r.target_decimals == null) {
      throw new SieveAppError(
        "DATABASE_INTEGRITY_ERROR",
        `Persisted build intent ${id} is missing required target_decimals; database integrity check failed`
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
        targetDecimals: Number(r.target_decimals),
        expectedTargetAmount: r.expected_target_amount.toString(),
        referencePriceUsd: r.revalidation_reference_price_usd.toString(),
        currentBuyPriceUsd: r.revalidation_buy_price_usd.toString(),
        premiumPct: (r.revalidation_premium_bps / 100).toFixed(2),
        maxPremiumPct: r.max_premium_pct.toString(),
        activeMultiplier: r.active_multiplier != null ? r.active_multiplier.toString() : undefined,
        chainTimestamp: r.chain_timestamp != null ? Number(r.chain_timestamp) : undefined,
        epoch: r.epoch != null ? r.epoch.toString() : undefined,
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
        submitted_at, confirmed_at, failure_code, created_at,
        raw_wallet_output, target_decimals, active_multiplier, chain_timestamp, epoch
      ) VALUES (
        ${receipt.id}, ${receipt.checkId}, ${receipt.buildIntentId}, ${receipt.wallet}, ${receipt.network},
        ${receipt.signature ?? null}, ${receipt.internalExecutionId ?? null}, ${receipt.status},
        ${receipt.fundingAsset}, ${receipt.fundingAmount}, ${receipt.requestedFundingAmount}, ${receipt.actualFundingAmount ?? null},
        ${receipt.targetSymbol}, ${receipt.targetMint}, ${receipt.expectedTargetAmount}, ${receipt.realizedTargetAmount},
        ${receipt.referencePriceUsd}, ${receipt.checkedBuyPriceUsd}, ${receipt.maxPremiumBps}, ${receipt.premiumBps},
        ${receipt.submittedAt}, ${receipt.confirmedAt}, ${receipt.failureCode ?? null}, NOW(),
        ${receipt.rawWalletOutput ?? null}, ${receipt.targetDecimals ?? null}, ${receipt.activeMultiplier ?? null}, ${receipt.chainTimestamp ?? null}, ${receipt.epoch ?? null}
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

  async saveSellPriceCheck(c: SellPriceCheck): Promise<void> {
    await this.sql`INSERT INTO sell_price_checks (id,network,wallet,target_name,target_symbol,target_mint,requested_economic_amount,actual_economic_amount,raw_wallet_input,raw_transfer_fee,raw_route_input,input_decimals,active_multiplier,expected_usdc_proceeds_raw,expected_usdc_proceeds,reference_price_usd,reference_observed_at,current_sell_price_usd,minimum_sell_price_usd,discount_bps,max_discount_bps,price_impact_pct,route_fingerprint,decision,source,client_intent_version,created_at,expires_at) VALUES (${c.id},${c.network},${c.wallet},${c.asset.name},${c.asset.symbol},${c.asset.mint},${c.input.requestedEconomicAmount},${c.input.actualEconomicAmount},${c.input.rawWalletInput.toString()},${c.input.rawTransferFee.toString()},${c.input.rawRouteInput.toString()},${c.input.decimals},${c.input.activeMultiplier},${c.expectedUsdcProceedsRaw.toString()},${c.expectedUsdcProceeds},${c.decision.referencePriceUsd},${c.asset.observedAt},${c.decision.currentSellPriceUsd},${c.decision.minimumSellPriceUsd},${c.decision.discountBps},${c.maxDiscountBps},${c.priceImpactPct},${c.routeFingerprint},${c.decision.status},${c.source},${c.clientIntentVersion},${c.createdAt},${c.expiresAt}) ON CONFLICT (id) DO NOTHING`;
  }
  async getSellPriceCheck(id: string): Promise<SellPriceCheck|null> { const rows=await this.sql`SELECT * FROM sell_price_checks WHERE id=${id} LIMIT 1`; if(!rows.length)return null; const r=rows[0]; if(r.network!=="mainnet")throw new SieveAppError("DATABASE_INTEGRITY_ERROR","Non-Mainnet Sell check cannot be loaded by the Mainnet-only runtime"); return { id:r.id,network:"mainnet",wallet:r.wallet,clientIntentVersion:r.client_intent_version,asset:{name:r.target_name,symbol:r.target_symbol,mint:r.target_mint,imageUrl:null,productUrl:null,referencePriceUsd:r.reference_price_usd.toString(),tokenPriceUsd:null,referenceValuationUsd:null,impliedValuationUsd:null,supply:null,source:"PRESTOCKS",observedAt:new Date(r.reference_observed_at).toISOString(),network:"mainnet"},input:{requestedEconomicAmount:r.requested_economic_amount.toString(),actualEconomicAmount:r.actual_economic_amount.toString(),rawWalletInput:BigInt(r.raw_wallet_input),rawTransferFee:BigInt(r.raw_transfer_fee),rawRouteInput:BigInt(r.raw_route_input),decimals:Number(r.input_decimals),activeMultiplier:r.active_multiplier.toString()},expectedUsdcProceedsRaw:BigInt(r.expected_usdc_proceeds_raw),expectedUsdcProceeds:r.expected_usdc_proceeds.toString(),priceImpactPct:r.price_impact_pct?.toString()??null,routeFingerprint:r.route_fingerprint,maxDiscountPct:(r.max_discount_bps/100).toFixed(2),maxDiscountBps:r.max_discount_bps,decision:{status:r.decision,isExecutable:r.decision==="GOOD_TO_GO",referencePriceUsd:r.reference_price_usd.toString(),currentSellPriceUsd:r.current_sell_price_usd?.toString()??null,minimumSellPriceUsd:r.minimum_sell_price_usd.toString(),discountPct:r.discount_bps==null?null:(r.discount_bps/100).toFixed(2),maxDiscountPct:(r.max_discount_bps/100).toFixed(2),discountBps:r.discount_bps,maxDiscountBps:r.max_discount_bps,differenceUsd:null,displayTitle:r.decision==="GOOD_TO_GO"?"Within boundary":"Outside boundary",displayMessage:""},source:"JUPITER",createdAt:new Date(r.created_at).toISOString(),expiresAt:new Date(r.expires_at).toISOString() }; }
  async saveSellBuildIntent(i: SellBuildIntent): Promise<void> { await this.sql`INSERT INTO sell_build_intents (id,check_id,wallet,network,minimum_usdc_output_raw,provider_request_id,last_valid_block_height,summary,status,expires_at) VALUES (${i.id},${i.checkId},${i.wallet},${i.network},${i.minimumUsdcOutputRaw.toString()},${i.requestId??null},${i.lastValidBlockHeight??null},${this.sql.json(i.summary as any)},'READY_FOR_WALLET',${i.expiresAt}) ON CONFLICT (id) DO NOTHING`; }
  async getSellBuildIntent(id:string):Promise<SellBuildIntent|null>{const rows=await this.sql`SELECT * FROM sell_build_intents WHERE id=${id} LIMIT 1`;if(!rows.length)return null;const r=rows[0];if(r.network!=="mainnet")throw new SieveAppError("DATABASE_INTEGRITY_ERROR","Non-Mainnet Sell build cannot be loaded by the Mainnet-only runtime");return{id:r.id,checkId:r.check_id,network:"mainnet",wallet:r.wallet,transactionBase64:"",requestId:r.provider_request_id??undefined,lastValidBlockHeight:r.last_valid_block_height?.toString(),minimumUsdcOutputRaw:BigInt(r.minimum_usdc_output_raw),expiresAt:new Date(r.expires_at).toISOString(),summary:r.summary as SellBuildIntent["summary"]};}
  async saveSellTradeReceipt(x:SellTradeReceipt):Promise<SellTradeReceipt>{const rows=await this.sql`INSERT INTO sell_trade_receipts (id,check_id,build_intent_id,side,wallet,network,signature,internal_execution_id,status,target_symbol,target_mint,requested_economic_amount,actual_economic_input,raw_input,expected_usdc_proceeds,realized_usdc_proceeds,reference_price_usd,checked_sell_price_usd,minimum_sell_price_usd,max_discount_bps,realized_discount_bps,submitted_at,confirmed_at,failure_code) VALUES (${x.id},${x.checkId},${x.buildIntentId},'SELL',${x.wallet},${x.network},${x.signature},${x.internalExecutionId??null},${x.status},${x.targetSymbol},${x.targetMint},${x.requestedEconomicAmount},${x.actualEconomicInput},${x.rawInput},${x.expectedUsdcProceeds},${x.realizedUsdcProceeds},${x.referencePriceUsd},${x.checkedSellPriceUsd},${x.minimumSellPriceUsd},${x.maxDiscountBps},${x.realizedDiscountBps},${x.submittedAt},${x.confirmedAt},${x.failureCode??null}) ON CONFLICT (signature) DO NOTHING RETURNING *`;if(rows.length)return this.mapSellReceipt(rows[0]);if(!x.signature)throw new SieveAppError("INTERNAL_ERROR");const e=await this.getSellTradeReceiptBySignature(x.signature);if(!e||e.buildIntentId!==x.buildIntentId)throw new SieveAppError("IDEMPOTENCY_VIOLATION");return e;}
  async getSellTradeReceiptBySignature(signature:string):Promise<SellTradeReceipt|null>{const rows=await this.sql`SELECT * FROM sell_trade_receipts WHERE signature=${signature} LIMIT 1`;return rows.length?this.mapSellReceipt(rows[0]):null;}
  private mapSellReceipt(r:Record<string,any>):SellTradeReceipt{if(r.network!=="mainnet")throw new SieveAppError("DATABASE_INTEGRITY_ERROR","Non-Mainnet Sell receipt cannot be loaded by the Mainnet-only runtime");return{id:r.id,side:"SELL",checkId:r.check_id,buildIntentId:r.build_intent_id,wallet:r.wallet,network:"mainnet",signature:r.signature,internalExecutionId:r.internal_execution_id,status:r.status,targetSymbol:r.target_symbol,targetMint:r.target_mint,requestedEconomicAmount:r.requested_economic_amount.toString(),actualEconomicInput:r.actual_economic_input?.toString()??null,rawInput:r.raw_input,expectedUsdcProceeds:r.expected_usdc_proceeds.toString(),realizedUsdcProceeds:r.realized_usdc_proceeds?.toString()??null,referencePriceUsd:r.reference_price_usd.toString(),checkedSellPriceUsd:r.checked_sell_price_usd.toString(),minimumSellPriceUsd:r.minimum_sell_price_usd.toString(),maxDiscountBps:r.max_discount_bps,realizedDiscountBps:r.realized_discount_bps,submittedAt:new Date(r.submitted_at).toISOString(),confirmedAt:r.confirmed_at?new Date(r.confirmed_at).toISOString():null,failureCode:r.failure_code};}

  private mapPriceCheckRow(r: Record<string, any>): PriceCheck {
    if (r.network !== "mainnet") {
      throw new SieveAppError("DATABASE_INTEGRITY_ERROR", "Non-Mainnet price check cannot be loaded by the Mainnet-only runtime");
    }
    if (!r.funding_method) {
      throw new SieveAppError("DATABASE_INTEGRITY_ERROR", "Persisted price check is missing required funding_method");
    }
    if (r.quote_output_raw && r.quote_output_decimals == null) {
      throw new SieveAppError("DATABASE_INTEGRITY_ERROR", "Persisted price check with quote is missing required quote_output_decimals");
    }

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
        method: r.funding_method,
        observedAt: r.created_at.toISOString(),
      },
      quote: r.quote_output_raw
        ? {
            provider: "JUPITER",
            inputMint: r.funding_mint,
            outputMint: r.target_mint,
            inputRaw: BigInt(r.funding_amount_raw),
            outputRaw: BigInt(r.quote_output_raw),
            outputDecimals: Number(r.quote_output_decimals),
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
        displayTitle: r.decision === "GOOD_TO_GO" ? "Within boundary" : "Outside boundary",
        displayMessage: "",
      },
      createdAt: r.created_at.toISOString(),
      expiresAt: r.expires_at?.toISOString() ?? r.created_at.toISOString(),
    };
  }

  private mapReceiptRow(r: Record<string, any>): TradeReceipt {
    if (r.network !== "mainnet") {
      throw new SieveAppError("DATABASE_INTEGRITY_ERROR", "Non-Mainnet receipt cannot be loaded by the Mainnet-only runtime");
    }
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
      targetDecimals: r.target_decimals != null ? Number(r.target_decimals) : null,
      expectedTargetAmount: r.expected_target_amount.toString(),
      realizedTargetAmount: r.realized_target_amount?.toString() ?? null,
      rawWalletOutput: r.raw_wallet_output != null ? r.raw_wallet_output.toString() : null,
      activeMultiplier: r.active_multiplier != null ? r.active_multiplier.toString() : null,
      chainTimestamp: r.chain_timestamp != null ? Number(r.chain_timestamp) : null,
      epoch: r.epoch != null ? r.epoch.toString() : null,
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
