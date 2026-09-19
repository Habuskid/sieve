import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST as postCheck } from "../../app/api/check/route";
import { POST as postBuild } from "../../app/api/build/route";
import { POST as postConfirm } from "../../app/api/confirm/route";
import { getRepository } from "../../server/database/db";
import { activeChecksStore } from "../../server/services/check-service";

describe("Phase 8: Stress and Race Condition Testing", () => {
  const testWallet = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
  const openAiMint = "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF";
  const repo = getRepository();

  beforeEach(async () => {
    if (repo.clear) await repo.clear();
  });

  it("handles rapid concurrent checks without race conditions or memory corruption", async () => {
    // Fire 10 concurrent checks
    const promises = Array.from({ length: 10 }).map((_, idx) => {
      const req = new NextRequest("http://localhost:3000/api/check", {
        method: "POST",
        body: JSON.stringify({
          network: "testnet",
          targetMint: openAiMint,
          fundingAsset: "USDC",
          amount: (10 * (idx + 1)).toString(),
          maxPremiumPct: "5.0",
          wallet: testWallet,
          scenarioId: "PASS_BASIC",
        }),
      });
      return postCheck(req);
    });

    const responses = await Promise.all(promises);
    expect(responses.length).toBe(10);
    for (const res of responses) {
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.decision).toBe("GOOD_TO_GO");
      expect(data.checkId).toBeDefined();
    }
  });

  it("handles pass-then-move: initial check PASS, but price moves over limit by build time -> BLOCKED", async () => {
    // 1. Initial check passes with PASS_THEN_MOVE scenario (at check time +3.0%, limit +5.0%)
    const checkReq = new NextRequest("http://localhost:3000/api/check", {
      method: "POST",
      body: JSON.stringify({
        network: "testnet",
        targetMint: openAiMint,
        fundingAsset: "USDC",
        amount: "10",
        maxPremiumPct: "5.0",
        wallet: testWallet,
        scenarioId: "PASS_THEN_MOVE",
      }),
    });
    const checkRes = await postCheck(checkReq);
    expect(checkRes.status).toBe(200);
    const checkData = await checkRes.json();
    expect(checkData.decision).toBe("GOOD_TO_GO");
    const checkId = checkData.checkId;

    // 2. Build time: price moved to +6.0%, which exceeds limit of +5.0%
    const buildReq = new NextRequest("http://localhost:3000/api/build", {
      method: "POST",
      body: JSON.stringify({
        checkId,
        wallet: testWallet,
        scenarioId: "PASS_THEN_MOVE",
      }),
    });
    const buildRes = await postBuild(buildReq);
    expect(buildRes.status).toBe(200);
    const buildData = await buildRes.json();
    expect(buildData.status).toBe("BLOCKED");
    expect(buildData.reason).toBe("PRICE_MOVED");
    expect(buildData.refreshedCheck).toBeDefined();
    expect(buildData.refreshedCheck.decision).toBe("PRICE_TOO_HIGH");
  });

  it("blocks stale quotes (STALE_QUOTE)", async () => {
    const checkReq = new NextRequest("http://localhost:3000/api/check", {
      method: "POST",
      body: JSON.stringify({
        network: "testnet",
        targetMint: openAiMint,
        fundingAsset: "USDC",
        amount: "10",
        maxPremiumPct: "5.0",
        wallet: testWallet,
        scenarioId: "STALE_QUOTE",
      }),
    });
    const checkRes = await postCheck(checkReq);
    expect(checkRes.status).toBe(200);
    const checkData = await checkRes.json();
    expect(checkData.decision).toBe("STALE_DATA");
  });

  it("blocks stale reference price (STALE_REFERENCE)", async () => {
    const checkReq = new NextRequest("http://localhost:3000/api/check", {
      method: "POST",
      body: JSON.stringify({
        network: "testnet",
        targetMint: openAiMint,
        fundingAsset: "USDC",
        amount: "10",
        maxPremiumPct: "5.0",
        wallet: testWallet,
        scenarioId: "STALE_REFERENCE",
      }),
    });
    const checkRes = await postCheck(checkReq);
    expect(checkRes.status).toBe(200);
    const checkData = await checkRes.json();
    expect(checkData.decision).toBe("STALE_DATA");
  });

  it("handles no route gracefully (NO_ROUTE)", async () => {
    const checkReq = new NextRequest("http://localhost:3000/api/check", {
      method: "POST",
      body: JSON.stringify({
        network: "testnet",
        targetMint: openAiMint,
        fundingAsset: "USDC",
        amount: "10",
        maxPremiumPct: "5.0",
        wallet: testWallet,
        scenarioId: "NO_ROUTE",
      }),
    });
    const checkRes = await postCheck(checkReq);
    expect(checkRes.status).toBe(200);
    const checkData = await checkRes.json();
    expect(checkData.decision).toBe("NO_ROUTE");
  });

  it("rejects expired checks at build time", async () => {
    // 1. Initial check
    const checkReq = new NextRequest("http://localhost:3000/api/check", {
      method: "POST",
      body: JSON.stringify({
        network: "testnet",
        targetMint: openAiMint,
        fundingAsset: "USDC",
        amount: "10",
        maxPremiumPct: "5.0",
        wallet: testWallet,
        scenarioId: "PASS_BASIC",
      }),
    });
    const checkRes = await postCheck(checkReq);
    const checkData = await checkRes.json();
    const checkId = checkData.checkId;

    // Simulate check expiry by modifying expiresAt in repo and store
    const check = (await repo.getPriceCheck(checkId)) || activeChecksStore.get(checkId);
    if (check) {
      const expiredCheck = {
        ...check,
        expiresAt: new Date(Date.now() - 5000).toISOString(),
      };
      await repo.savePriceCheck(expiredCheck);
      activeChecksStore.set(checkId, expiredCheck);
    }

    // Build should fail with TRANSACTION_EXPIRED
    const buildReq = new NextRequest("http://localhost:3000/api/build", {
      method: "POST",
      body: JSON.stringify({
        checkId,
        wallet: testWallet,
        scenarioId: "PASS_BASIC",
      }),
    });
    const buildRes = await postBuild(buildReq);
    expect(buildRes.status).toBe(410);
    const buildData = await buildRes.json();
    expect(buildData.error.code).toBe("TRANSACTION_EXPIRED");
  });

  it("ensures duplicate confirmation requests are idempotent and return the existing receipt", async () => {
    // 1. Check & build
    const checkReq = new NextRequest("http://localhost:3000/api/check", {
      method: "POST",
      body: JSON.stringify({
        network: "testnet",
        targetMint: openAiMint,
        fundingAsset: "USDC",
        amount: "10",
        maxPremiumPct: "5.0",
        wallet: testWallet,
        scenarioId: "PASS_BASIC",
      }),
    });
    const checkRes = await postCheck(checkReq);
    const checkData = await checkRes.json();

    const buildReq = new NextRequest("http://localhost:3000/api/build", {
      method: "POST",
      body: JSON.stringify({
        checkId: checkData.checkId,
        wallet: testWallet,
        scenarioId: "PASS_BASIC",
      }),
    });
    const buildRes = await postBuild(buildReq);
    const buildData = await buildRes.json();

    // 2. First confirm
    const sig = "5J7xIdempotencyTestSignature1111111111111111111111111111111111111111111111111111111111111111111";
    const confirmReq1 = new NextRequest("http://localhost:3000/api/confirm", {
      method: "POST",
      body: JSON.stringify({
        buildIntentId: buildData.buildIntentId,
        signature: sig,
        network: "testnet",
      }),
    });
    const confirmRes1 = await postConfirm(confirmReq1);
    expect(confirmRes1.status).toBe(200);
    const confirmData1 = await confirmRes1.json();
    expect(confirmData1.status).toBe("CONFIRMED");

    // 3. Duplicate confirm with same signature
    const confirmReq2 = new NextRequest("http://localhost:3000/api/confirm", {
      method: "POST",
      body: JSON.stringify({
        buildIntentId: buildData.buildIntentId,
        signature: sig,
        network: "testnet",
      }),
    });
    const confirmRes2 = await postConfirm(confirmReq2);
    expect(confirmRes2.status).toBe(200);
    const confirmData2 = await confirmRes2.json();
    expect(confirmData2.status).toBe("CONFIRMED");
    expect(confirmData2.receipt.id).toBe(confirmData1.receipt.id);
  });
});
