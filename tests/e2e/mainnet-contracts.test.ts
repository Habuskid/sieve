// @vitest-environment node
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST as buyCheck } from "../../app/api/check/route";
import { POST as buyBuild } from "../../app/api/build/route";
import { POST as buyConfirm } from "../../app/api/confirm/route";
import { POST as sellCheck } from "../../app/api/sell/check/route";
import { POST as sellBuild } from "../../app/api/sell/build/route";
import { POST as sellConfirm } from "../../app/api/sell/confirm/route";

const wallet = "11111111111111111111111111111111";
const mint = "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF";
const uuid = "11111111-1111-4111-8111-111111111111";

function request(path: string, body: object) {
  return new NextRequest(`http://localhost:3000${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Mainnet-only public API contracts", () => {
  it("rejects network and scenario selectors on Buy check", async () => {
    const response = await buyCheck(request("/api/check", { network: "testnet", scenarioId: "PASS", targetMint: mint, fundingAsset: "USDC", amount: "10", maxPremiumPct: "5", wallet, clientIntentVersion: "v1" }));
    expect(response.status).toBe(400);
  });

  it("rejects scenario selectors on Buy build", async () => {
    expect((await buyBuild(request("/api/build", { checkId: uuid, wallet, scenarioId: "PASS" }))).status).toBe(400);
  });

  it("rejects network selectors and unsigned Buy confirmation", async () => {
    expect((await buyConfirm(request("/api/confirm", { buildIntentId: uuid, signature: "x".repeat(64), wallet, network: "testnet" }))).status).toBe(400);
  });

  it("rejects network and scenario selectors on Sell check", async () => {
    const response = await sellCheck(request("/api/sell/check", { network: "testnet", scenarioId: "SELL_PASS", targetMint: mint, amount: "1", maxDiscountPct: "5", wallet, clientIntentVersion: "v1" }));
    expect(response.status).toBe(400);
  });

  it("rejects network selectors on Sell build", async () => {
    expect((await sellBuild(request("/api/sell/build", { checkId: uuid, wallet, network: "testnet" }))).status).toBe(400);
  });

  it("rejects network selectors and unsigned Sell confirmation", async () => {
    expect((await sellConfirm(request("/api/sell/confirm", { buildIntentId: uuid, signature: "x".repeat(64), wallet, network: "testnet" }))).status).toBe(400);
  });
});
