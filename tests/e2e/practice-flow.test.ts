import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET as getMarkets } from "../../app/api/markets/route";
import { POST as postCheck } from "../../app/api/check/route";
import { POST as postBuild } from "../../app/api/build/route";
import { POST as postConfirm } from "../../app/api/confirm/route";
import { GET as getHistory } from "../../app/api/history/route";
import { getRepository } from "../../server/database/db";

describe("Phase 7: Critical Practice/Testnet E2E Flow", () => {
  const testWallet = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
  const repo = getRepository();

  beforeEach(async () => {
    if (repo.clear) await repo.clear();
  });

  it("completes full Golden Path: markets -> check pass -> build -> confirm -> history", async () => {
    // 1. Markets list
    const marketsReq = new NextRequest("http://localhost:3000/api/markets?network=testnet");
    const marketsRes = await getMarkets(marketsReq);
    expect(marketsRes.status).toBe(200);
    const marketsData = await marketsRes.json();
    expect(marketsData.network).toBe("testnet");
    expect(marketsData.source).toBe("PRACTICE_FIXTURE");
    expect(marketsData.markets.length).toBeGreaterThan(0);
    const openAiMarket = marketsData.markets.find((m: any) => m.symbol === "OPENAI");
    expect(openAiMarket).toBeDefined();
    expect(openAiMarket.referencePriceUsd).toBe("100.00");

    // 2. Price check PASS (PASS_BASIC: Reference $100, Buy $103 = +3.00%, Limit +5.00%)
    const checkReq = new NextRequest("http://localhost:3000/api/check", {
      method: "POST",
      body: JSON.stringify({
        network: "testnet",
        targetMint: openAiMarket.mint,
        fundingAsset: "USDC",
        amount: "10",
        maxPremiumPct: "5.0",
        wallet: testWallet,
        scenarioId: "PASS_BASIC",
      }),
    });
    const checkRes = await postCheck(checkReq);
    expect(checkRes.status).toBe(200);
    const checkData = await checkRes.json();
    expect(checkData.decision).toBe("GOOD_TO_GO");
    expect(checkData.price.premiumPct).toBe("3.00");
    expect(checkData.price.referenceUsd).toBe("100.0000");
    const checkId = checkData.checkId;
    expect(checkId).toBeDefined();

    // 3. Build Transaction
    const buildReq = new NextRequest("http://localhost:3000/api/build", {
      method: "POST",
      body: JSON.stringify({
        checkId,
        wallet: testWallet,
        scenarioId: "PASS_BASIC",
      }),
    });
    const buildRes = await postBuild(buildReq);
    expect(buildRes.status).toBe(200);
    const buildData = await buildRes.json();
    expect(buildData.status).toBe("READY_FOR_WALLET");
    expect(buildData.serializedTransaction).toBeDefined();
    expect(buildData.buildIntentId).toBeDefined();
    const buildIntentId = buildData.buildIntentId;

    // 4. Confirm Transaction with Mock Signature
    const mockSig = "5J7x9Z8y1mockSignatureForGoldenPathTestnetVerification1111111111111111111111111111111111111111";
    const confirmReq = new NextRequest("http://localhost:3000/api/confirm", {
      method: "POST",
      body: JSON.stringify({
        buildIntentId,
        signature: mockSig,
        network: "testnet",
      }),
    });
    const confirmRes = await postConfirm(confirmReq);
    expect(confirmRes.status).toBe(200);
    const confirmData = await confirmRes.json();
    expect(confirmData.status).toBe("CONFIRMED");
    expect(confirmData.signature).toBe(mockSig);
    expect(confirmData.receipt).toBeDefined();
    expect(confirmData.receipt.status).toBe("CONFIRMED");

    // 5. Query History
    const historyReq = new NextRequest(`http://localhost:3000/api/history?wallet=${testWallet}&network=testnet`);
    const historyRes = await getHistory(historyReq);
    expect(historyRes.status).toBe(200);
    const historyData = await historyRes.json();
    expect(historyData.wallet).toBe(testWallet);
    expect(historyData.items.length).toBeGreaterThanOrEqual(1);
    const confirmedTrade = historyData.items.find((item: any) => item.type === "TRADE_CONFIRMED");
    expect(confirmedTrade).toBeDefined();
    expect(confirmedTrade.signature).toBe(mockSig);
  });

  it("blocks buy when price exceeds user premium limit (BLOCK_ONE_BP_OVER)", async () => {
    // BLOCK_ONE_BP_OVER: Reference $100, Buy $105.01 (+5.01%), Limit +5.0%
    const checkReq = new NextRequest("http://localhost:3000/api/check", {
      method: "POST",
      body: JSON.stringify({
        network: "testnet",
        targetMint: "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF",
        fundingAsset: "USDC",
        amount: "10",
        maxPremiumPct: "5.0",
        wallet: testWallet,
        scenarioId: "BLOCK_ONE_BP_OVER",
      }),
    });
    const checkRes = await postCheck(checkReq);
    expect(checkRes.status).toBe(200);
    const checkData = await checkRes.json();
    expect(checkData.decision).toBe("PRICE_TOO_HIGH");
    expect(checkData.price.premiumPct).toBe("5.01");

    // Attempting to build with a blocked check revalidates and returns status: "BLOCKED"
    const buildReq = new NextRequest("http://localhost:3000/api/build", {
      method: "POST",
      body: JSON.stringify({
        checkId: checkData.checkId,
        wallet: testWallet,
        scenarioId: "BLOCK_ONE_BP_OVER",
      }),
    });
    const buildRes = await postBuild(buildReq);
    expect(buildRes.status).toBe(200);
    const buildData = await buildRes.json();
    expect(buildData.status).toBe("BLOCKED");
    expect(buildData.reason).toBe("PRICE_MOVED");
    expect(buildData.refreshedCheck.decision).toBe("PRICE_TOO_HIGH");
  });

  it("allows exact boundary PASS (PASS_EXACT_BOUNDARY)", async () => {
    // Reference $100, Buy $105.00 (+5.00%), Limit +5.0%
    const checkReq = new NextRequest("http://localhost:3000/api/check", {
      method: "POST",
      body: JSON.stringify({
        network: "testnet",
        targetMint: "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF",
        fundingAsset: "USDC",
        amount: "105",
        maxPremiumPct: "5.0",
        wallet: testWallet,
        scenarioId: "PASS_EXACT_BOUNDARY",
      }),
    });
    const checkRes = await postCheck(checkReq);
    expect(checkRes.status).toBe(200);
    const checkData = await checkRes.json();
    expect(checkData.decision).toBe("GOOD_TO_GO");
    expect(checkData.price.premiumPct).toBe("5.00");
  });

  it("supports SOL as funding asset (SOL_PASS)", async () => {
    // SOL funding asset
    const checkReq = new NextRequest("http://localhost:3000/api/check", {
      method: "POST",
      body: JSON.stringify({
        network: "testnet",
        targetMint: "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF",
        fundingAsset: "SOL",
        amount: "1",
        maxPremiumPct: "5.0",
        wallet: testWallet,
        scenarioId: "SOL_PASS",
      }),
    });
    const checkRes = await postCheck(checkReq);
    expect(checkRes.status).toBe(200);
    const checkData = await checkRes.json();
    expect(checkData.decision).toBe("GOOD_TO_GO");
    expect(checkData.funding.asset).toBe("SOL");
  });
});
