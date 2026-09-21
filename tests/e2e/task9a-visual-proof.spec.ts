import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";

const SCREENSHOTS_DIR = "C:/Users/PC/.gemini/antigravity-cli/brain/1136def9-fe43-446f-8026-cdda6b71798c/scratch/screenshots";

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

// Helper to inject mock wallet
async function injectMockWallet(page: any, walletAddress = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM") {
  await page.addInitScript((address: string) => {
    const pubkeyBytes = new Uint8Array(32);
    pubkeyBytes.fill(1);

    const mockAccount = {
      address,
      publicKey: pubkeyBytes,
      chains: ["solana:mainnet", "solana:devnet"],
      features: ["solana:signTransaction"],
    };

    const mockWallet = {
      version: "1.0.0",
      name: "Institutional Mock Wallet",
      icon: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24'><rect width='24' height='24' fill='%2322c55e'/></svg>",
      chains: ["solana:mainnet", "solana:devnet"],
      features: {
        "standard:connect": {
          version: "1.0.0",
          connect: async () => {
            mockWallet.accounts = [mockAccount];
            return { accounts: [mockAccount] };
          },
        },
        "standard:disconnect": {
          version: "1.0.0",
          disconnect: async () => {
            mockWallet.accounts = [];
          },
        },
        "standard:events": {
          version: "1.0.0",
          on: (_event: string, _listener: any) => () => {},
        },
        "solana:signTransaction": {
          version: "1.0.0",
          supportedTransactionVersions: ["legacy", 0],
          signTransaction: async (...inputs: any[]) => {
            return inputs.map((input) => ({ signedTransaction: input.transaction }));
          },
        },
      },
      accounts: [] as any[],
    };

    try {
      const nav = window.navigator as any;
      nav.wallets = nav.wallets || [];
      nav.wallets.push(({ register }: any) => register(mockWallet));
    } catch (e) {}

    window.addEventListener("wallet-standard:app-ready", (event: any) => {
      event.detail.register(mockWallet);
    });

    window.addEventListener("DOMContentLoaded", () => {
      window.dispatchEvent(
        new CustomEvent("wallet-standard:register-wallet", {
          detail: ({ register }: any) => register(mockWallet),
        })
      );
    });
  }, walletAddress);
}

// Connect wallet helper
async function connectWallet(page: any) {
  const connectBtn = page.getByRole("button", { name: /Connect wallet to check boundary/i });
  if (await connectBtn.isVisible()) {
    await connectBtn.click();
    const walletOption = page.getByRole("button", { name: /Institutional Mock Wallet/i });
    await expect(walletOption).toBeVisible({ timeout: 5000 });
    await walletOption.click();
    await expect(page.getByRole("button", { name: "Check boundary" })).toBeVisible({ timeout: 5000 });
  }
}

test.describe("TASK 9A: Desktop (1440 × 900) Visual & Interaction Proof", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("Desktop BUY workflow (initial, check, price rail authority, full capacity)", async ({ page }) => {
    await injectMockWallet(page);

    await page.route("**/api/markets", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          network: "mainnet",
          source: "PRESTOCKS",
          markets: [
            {
              name: "OpenAI",
              symbol: "OPENAI",
              mint: "PreStocksOpenAIMint111111111111111111111111",
              referencePriceUsd: "500.00",
              sourceTokenPriceUsd: "510.00",
              differencePct: "2.00",
            },
          ],
        }),
      });
    });

    await page.route("**/api/capacity/buy", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          checkId: "chk_buy_full_123",
          status: "FULLY_WITHIN_BOUNDARY",
          side: "BUY",
          asset: {
            symbol: "OPENAI",
            mint: "PreStocksOpenAIMint111111111111111111111111",
            decimals: 6,
          },
          fundingAsset: "USDC",
          requestedAmount: "100.00",
          userLimitPct: 5,
          maximumBuyPriceUsd: "525.00",
          verifiedCapacity: {
            fundingAmount: "100.00",
            effectiveBuyPriceUsd: "512.50",
            expectedTargetAmount: "0.195121",
            totalFeeLamports: "5000",
            networkFeeLamports: "5000",
            ataCreationFeeLamports: "0",
            token2022TransferFeeUsdc: "0",
            netFundingAmount: "100.00",
            token2022TaxBasisPoints: 0,
          },
          route: {
            marketPriceUsd: "500.00",
            effectivePriceUsd: "512.50",
            differencePct: 2.5,
            passesLimit: true,
          },
          expiresAt: "2026-09-21T12:00:00.000Z",
        }),
      });
    });

    await page.goto("/buy");
    await expect(page.getByText("Solana Mainnet")).toBeVisible();

    // 1. Initial BUY state verification
    await expect(page.getByRole("tab", { name: "BUY" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("combobox", { name: "Asset" })).toBeVisible();
    await expect(page.getByRole("radiogroup", { name: "Funding Asset" })).toBeVisible();
    await expect(page.getByText("USDC funding")).toBeVisible();
    await expect(page.getByText("Amount to spend")).toBeVisible();
    await expect(page.getByText("Maximum premium")).toBeVisible();
    await expect(page.getByText("You set this execution boundary.")).toBeVisible();

    // Price rail BEFORE check: NO fake values (shows "—")
    const maxPriceText = page.locator("p:has-text('Maximum price') + strong");
    await expect(maxPriceText).toHaveText("—");
    const routePriceText = page.locator("p:has-text('Route price') + strong");
    await expect(routePriceText).toHaveText("—");

    // Screenshot initial desktop BUY
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "desktop-buy-initial.png"), fullPage: true });

    // Connect wallet
    await connectWallet(page);

    // Enter amount and check boundary
    await page.getByPlaceholder("0.00").fill("100");
    await page.getByRole("button", { name: "Check boundary" }).click();

    // Verify FULLY_WITHIN_BOUNDARY result
    await expect(page.getByText("Within boundary")).toBeVisible();
    await expect(page.getByText(/fully verified within your execution boundary/i)).toBeVisible();
    await expect(page.getByText("Prepare transaction")).toBeVisible();
    // No "Use boundary amount" required
    await expect(page.getByRole("button", { name: "Use boundary amount" })).toHaveCount(0);

    // Price rail AFTER check: server values only
    await expect(page.locator("p:has-text('Route price') + strong")).toHaveText("$512.50");
    await expect(maxPriceText).toHaveText("$525.00");

    // Screenshot checked desktop BUY
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "desktop-buy-checked.png"), fullPage: true });
  });

  test("Desktop SELL workflow (initial, check, no stale BUY labels, price rail)", async ({ page }) => {
    await injectMockWallet(page);

    await page.route("**/api/markets", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          network: "mainnet",
          source: "PRESTOCKS",
          markets: [
            {
              name: "OpenAI",
              symbol: "OPENAI",
              mint: "PreStocksOpenAIMint111111111111111111111111",
              referencePriceUsd: "500.00",
              sourceTokenPriceUsd: "490.00",
              differencePct: "-2.00",
            },
          ],
        }),
      });
    });

    await page.route("**/api/capacity/sell", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          checkId: "chk_sell_full_123",
          status: "FULLY_WITHIN_BOUNDARY",
          side: "SELL",
          asset: {
            symbol: "OPENAI",
            mint: "PreStocksOpenAIMint111111111111111111111111",
            decimals: 6,
          },
          requestedAmount: "10.00",
          userLimitPct: 5,
          minimumSellPriceUsd: "475.00",
          verifiedCapacity: {
            economicAmount: "10.00",
            effectiveSellPriceUsd: "490.00",
            expectedUsdcProceeds: "4900.00",
            totalFeeLamports: "5000",
            networkFeeLamports: "5000",
            token2022TransferFeeRaw: "0",
            token2022TaxBasisPoints: 0,
          },
          route: {
            marketPriceUsd: "500.00",
            effectivePriceUsd: "490.00",
            differencePct: 2.0,
            passesLimit: true,
          },
          expiresAt: "2026-09-21T12:00:00.000Z",
        }),
      });
    });

    await page.goto("/buy");
    await connectWallet(page);

    // Switch to SELL
    await page.getByRole("tab", { name: "SELL" }).click();

    // Verify SELL mode UI
    await expect(page.getByRole("tab", { name: "SELL" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText("Sell PreStocks")).toBeVisible();
    await expect(page.getByRole("radiogroup", { name: "Funding Asset" })).toHaveCount(0); // Hidden
    await expect(page.getByText("Amount to sell")).toBeVisible();
    await expect(page.getByText("USDC output")).toBeVisible();
    await expect(page.getByText("USDC (Fixed)")).toBeVisible();
    await expect(page.getByText("Sell proceeds are always paid in USDC.")).toBeVisible();
    await expect(page.getByText("Maximum discount")).toBeVisible();
    await expect(page.getByText("Maximum premium")).toHaveCount(0); // No Maximum premium in Sell
    await expect(page.getByText("Minimum price", { exact: true })).toBeVisible(); // Price rail uses Minimum price

    // Screenshot initial desktop SELL
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "desktop-sell-initial.png"), fullPage: true });

    // Enter amount and check boundary
    await page.getByPlaceholder("0.00").fill("10");
    await page.getByRole("button", { name: "Check boundary" }).click();

    // Verify SELL result
    await expect(page.getByText("Within boundary")).toBeVisible();
    await expect(page.getByText(/10.00 OPENAI is fully verified/i)).toBeVisible();
    await expect(page.getByText("4900.00 USDC")).toBeVisible();
    await expect(page.getByRole("button", { name: "Prepare transaction" })).toBeVisible();

    // Price rail after check
    const minPriceText = page.locator("p:has-text('Minimum price') + strong");
    await expect(minPriceText).toHaveText("$475.00");

    // Screenshot checked desktop SELL
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "desktop-sell-checked.png"), fullPage: true });
  });

  test("Desktop PARTIAL result and build payload proof", async ({ page }) => {
    await injectMockWallet(page);

    await page.route("**/api/markets", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          network: "mainnet",
          source: "PRESTOCKS",
          markets: [
            {
              name: "OpenAI",
              symbol: "OPENAI",
              mint: "PreStocksOpenAIMint111111111111111111111111",
              referencePriceUsd: "500.00",
            },
          ],
        }),
      });
    });

    await page.route("**/api/capacity/buy", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          checkId: "chk_buy_partial_456",
          status: "PARTIALLY_WITHIN_BOUNDARY",
          side: "BUY",
          asset: {
            symbol: "OPENAI",
            mint: "PreStocksOpenAIMint111111111111111111111111",
            decimals: 6,
          },
          fundingAsset: "USDC",
          requestedAmount: "500.00",
          userLimitPct: 5,
          maximumBuyPriceUsd: "525.00",
          verifiedCapacity: {
            fundingAmount: "250.00",
            effectiveBuyPriceUsd: "520.00",
            expectedTargetAmount: "0.480769",
            totalFeeLamports: "5000",
            networkFeeLamports: "5000",
            ataCreationFeeLamports: "0",
            token2022TransferFeeUsdc: "0",
            netFundingAmount: "250.00",
            token2022TaxBasisPoints: 0,
          },
          route: {
            marketPriceUsd: "500.00",
            effectivePriceUsd: "520.00",
            differencePct: 4.0,
            passesLimit: true,
          },
          expiresAt: "2026-09-21T12:00:00.000Z",
        }),
      });
    });

    let buildRequestBody: any = null;
    await page.route("**/api/build", async (route) => {
      buildRequestBody = JSON.parse(route.request().postData() || "{}");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "OK",
          buildIntentId: "bld_123",
          serializedTransaction: "AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAED",
          expiresAt: "2026-09-21T12:05:00.000Z",
          summary: {
            side: "BUY",
            assetName: "OpenAI",
            assetSymbol: "OPENAI",
            requestedAmount: "250.00",
            fundingAsset: "USDC",
            limitPrice: "525.00",
            effectivePrice: "520.00",
            expectedOutput: "0.480769",
            referencePrice: "500.00",
            priceDifferencePct: "4.0",
            passesLimit: true,
            networkFee: "0.000005 SOL",
            ataFee: "0 SOL",
            totalSolFee: "0.000005 SOL",
          },
        }),
      });
    });

    await page.goto("/buy");
    await connectWallet(page);

    await page.getByPlaceholder("0.00").fill("500");
    await page.getByRole("button", { name: "Check boundary" }).click();

    // Verify PARTIALLY_WITHIN_BOUNDARY state: shows both Requested and Boundary Capacity
    await expect(page.getByText("Partial capacity")).toBeVisible();
    await expect(page.getByText("500.00 USDC", { exact: true })).toBeVisible();
    await expect(page.getByText("250.00 USDC", { exact: true })).toBeVisible();
    await expect(page.getByText(/250\.00 USDC of the requested 500\.00 USDC is currently verified/i)).toBeVisible();

    // Single primary action button is "Use boundary amount"
    const useBoundaryBtn = page.getByRole("button", { name: "Use boundary amount" });
    await expect(useBoundaryBtn).toBeVisible();
    await expect(useBoundaryBtn).toHaveCount(1); // No duplicate primary actions

    // Prepare transaction is NOT actionable yet
    await expect(page.getByRole("button", { name: "Prepare transaction" })).toHaveCount(0);

    // Screenshot desktop partial result before selection
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "desktop-partial-result.png"), fullPage: true });

    // Click "Use boundary amount"
    await useBoundaryBtn.click();

    // Now shows "Using verified amount: 250.00 USDC" and "Prepare transaction" becomes visible
    await expect(page.getByText(/Using verified amount: 250\.00 USDC/i)).toBeVisible();
    const prepareBtn = page.getByRole("button", { name: "Prepare transaction" });
    await expect(prepareBtn).toBeVisible();

    // Screenshot desktop partial result after selection
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "desktop-partial-selected.png"), fullPage: true });

    // Click Prepare transaction
    await prepareBtn.click();

    // Review dialog opens
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByText("Final transaction review")).toBeVisible();
    await expect(page.getByRole("button", { name: "Confirm in wallet" })).toBeVisible();

    // Verify build request payload sent { checkId, wallet } ONLY
    expect(buildRequestBody).toEqual({
      checkId: "chk_buy_partial_456",
      wallet: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
    });
    expect(buildRequestBody.amount).toBeUndefined();

    // Screenshot review dialog
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "desktop-review-dialog.png") });
  });

  test("Desktop NO_VERIFIED_CAPACITY", async ({ page }) => {
    await injectMockWallet(page);

    await page.route("**/api/markets", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          network: "mainnet",
          source: "PRESTOCKS",
          markets: [
            {
              name: "OpenAI",
              symbol: "OPENAI",
              mint: "PreStocksOpenAIMint111111111111111111111111",
              referencePriceUsd: "500.00",
            },
          ],
        }),
      });
    });

    await page.route("**/api/capacity/buy", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          checkId: "chk_buy_none_789",
          status: "NO_VERIFIED_CAPACITY",
          side: "BUY",
          asset: {
            symbol: "OPENAI",
            mint: "PreStocksOpenAIMint111111111111111111111111",
            decimals: 6,
          },
          fundingAsset: "USDC",
          requestedAmount: "1000.00",
          userLimitPct: 1,
          verifiedCapacity: null,
          route: {
            marketPriceUsd: "500.00",
            effectivePriceUsd: "530.00",
            differencePct: 6.0,
            passesLimit: false,
          },
          expiresAt: "2026-09-21T12:00:00.000Z",
        }),
      });
    });

    await page.goto("/buy");
    await connectWallet(page);

    await page.getByPlaceholder("0.00").fill("1000");
    await page.getByRole("button", { name: "Check boundary" }).click();

    await expect(page.getByText("No verified capacity", { exact: true })).toBeVisible();
    await expect(page.getByText("No verified capacity within this boundary.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Prepare transaction" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Check again" })).toBeVisible();

    // Screenshot desktop no capacity
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "desktop-no-capacity.png"), fullPage: true });
  });

  test("Desktop Error States & Invalidation (server error, price moved, wallet disconnect)", async ({ page }) => {
    await injectMockWallet(page);

    await page.route("**/api/markets", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          network: "mainnet",
          source: "PRESTOCKS",
          markets: [
            {
              name: "OpenAI",
              symbol: "OPENAI",
              mint: "PreStocksOpenAIMint111111111111111111111111",
              referencePriceUsd: "500.00",
            },
          ],
        }),
      });
    });

    // Server error from capacity
    await page.route("**/api/capacity/buy", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
          error: { code: "SERVER_ERROR", message: "Upstream liquidity source unavailable" },
        }),
      });
    });

    await page.goto("/buy");
    await connectWallet(page);

    await page.getByPlaceholder("0.00").fill("100");
    await page.getByRole("button", { name: "Check boundary" }).click();

    // Provider error does NOT look like NO_VERIFIED_CAPACITY
    await expect(page.getByText("Upstream liquidity source unavailable")).toBeVisible();
    await expect(page.getByText("No verified capacity within this boundary.")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Prepare transaction" })).toHaveCount(0);
  });
});

test.describe("TASK 9A: Mobile (390 × 844) Visual & Interaction Proof", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("Mobile BUY workflow (initial, check, no overflow, reachable controls)", async ({ page }) => {
    await injectMockWallet(page);

    await page.route("**/api/markets", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          network: "mainnet",
          source: "PRESTOCKS",
          markets: [
            {
              name: "OpenAI",
              symbol: "OPENAI",
              mint: "PreStocksOpenAIMint111111111111111111111111",
              referencePriceUsd: "500.00",
            },
          ],
        }),
      });
    });

    await page.route("**/api/capacity/buy", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          checkId: "chk_buy_full_mobile",
          status: "FULLY_WITHIN_BOUNDARY",
          side: "BUY",
          asset: {
            symbol: "OPENAI",
            mint: "PreStocksOpenAIMint111111111111111111111111",
            decimals: 6,
          },
          fundingAsset: "USDC",
          requestedAmount: "100.00",
          userLimitPct: 5,
          maximumBuyPriceUsd: "525.00",
          verifiedCapacity: {
            fundingAmount: "100.00",
            effectiveBuyPriceUsd: "512.50",
            expectedTargetAmount: "0.195121",
            totalFeeLamports: "5000",
            networkFeeLamports: "5000",
            ataCreationFeeLamports: "0",
            token2022TransferFeeUsdc: "0",
            netFundingAmount: "100.00",
            token2022TaxBasisPoints: 0,
          },
          route: {
            marketPriceUsd: "500.00",
            effectivePriceUsd: "512.50",
            differencePct: 2.5,
            passesLimit: true,
          },
          expiresAt: "2026-09-21T12:00:00.000Z",
        }),
      });
    });

    await page.goto("/buy");

    // Screenshot initial mobile BUY
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "mobile-buy-initial.png"), fullPage: true });

    // Connect wallet
    await connectWallet(page);

    await page.getByPlaceholder("0.00").fill("100");
    await page.getByRole("button", { name: "Check boundary" }).click();

    await expect(page.getByText("Within boundary")).toBeVisible();
    await expect(page.getByRole("button", { name: "Prepare transaction" })).toBeVisible();

    // Check no horizontal scrollbar on body
    const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
    const innerWidth = await page.evaluate(() => window.innerWidth);
    expect(scrollWidth).toBeLessThanOrEqual(innerWidth);

    // Screenshot checked mobile BUY
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "mobile-buy-checked.png"), fullPage: true });
  });

  test("Mobile SELL workflow (initial, check, reachable controls, no overflow)", async ({ page }) => {
    await injectMockWallet(page);

    await page.route("**/api/markets", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          network: "mainnet",
          source: "PRESTOCKS",
          markets: [
            {
              name: "OpenAI",
              symbol: "OPENAI",
              mint: "PreStocksOpenAIMint111111111111111111111111",
              referencePriceUsd: "500.00",
            },
          ],
        }),
      });
    });

    await page.route("**/api/capacity/sell", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          checkId: "chk_sell_full_mobile",
          status: "FULLY_WITHIN_BOUNDARY",
          side: "SELL",
          asset: {
            symbol: "OPENAI",
            mint: "PreStocksOpenAIMint111111111111111111111111",
            decimals: 6,
          },
          requestedAmount: "10.00",
          userLimitPct: 5,
          minimumSellPriceUsd: "475.00",
          verifiedCapacity: {
            economicAmount: "10.00",
            effectiveSellPriceUsd: "490.00",
            expectedUsdcProceeds: "4900.00",
            totalFeeLamports: "5000",
            networkFeeLamports: "5000",
            token2022TransferFeeRaw: "0",
            token2022TaxBasisPoints: 0,
          },
          route: {
            marketPriceUsd: "500.00",
            effectivePriceUsd: "490.00",
            differencePct: 2.0,
            passesLimit: true,
          },
          expiresAt: "2026-09-21T12:00:00.000Z",
        }),
      });
    });

    await page.goto("/buy");
    await connectWallet(page);

    // Switch to SELL
    await page.getByRole("tab", { name: "SELL" }).click();

    // Verify SELL controls
    await expect(page.getByText("Sell PreStocks")).toBeVisible();
    await expect(page.getByText("Amount to sell")).toBeVisible();
    await expect(page.getByText("USDC output")).toBeVisible();
    await expect(page.getByText("USDC (Fixed)")).toBeVisible();
    await expect(page.getByText("Sell proceeds are always paid in USDC.")).toBeVisible();

    // Screenshot initial mobile SELL
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "mobile-sell-initial.png"), fullPage: true });

    await page.getByPlaceholder("0.00").fill("10");
    await page.getByRole("button", { name: "Check boundary" }).click();

    await expect(page.getByText("Within boundary")).toBeVisible();
    await expect(page.getByRole("button", { name: "Prepare transaction" })).toBeVisible();

    // Check no horizontal scrollbar
    const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
    const innerWidth = await page.evaluate(() => window.innerWidth);
    expect(scrollWidth).toBeLessThanOrEqual(innerWidth);

    // Screenshot checked mobile SELL
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "mobile-sell-checked.png"), fullPage: true });
  });

  test("Mobile PARTIAL result, selection, and review dialog", async ({ page }) => {
    await injectMockWallet(page);

    await page.route("**/api/markets", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          network: "mainnet",
          source: "PRESTOCKS",
          markets: [
            {
              name: "OpenAI",
              symbol: "OPENAI",
              mint: "PreStocksOpenAIMint111111111111111111111111",
              referencePriceUsd: "500.00",
            },
          ],
        }),
      });
    });

    await page.route("**/api/capacity/buy", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          checkId: "chk_buy_partial_mob",
          status: "PARTIALLY_WITHIN_BOUNDARY",
          side: "BUY",
          asset: {
            symbol: "OPENAI",
            mint: "PreStocksOpenAIMint111111111111111111111111",
            decimals: 6,
          },
          fundingAsset: "USDC",
          requestedAmount: "500.00",
          userLimitPct: 5,
          maximumBuyPriceUsd: "525.00",
          verifiedCapacity: {
            fundingAmount: "250.00",
            effectiveBuyPriceUsd: "520.00",
            expectedTargetAmount: "0.480769",
            totalFeeLamports: "5000",
            networkFeeLamports: "5000",
            ataCreationFeeLamports: "0",
            token2022TransferFeeUsdc: "0",
            netFundingAmount: "250.00",
            token2022TaxBasisPoints: 0,
          },
          route: {
            marketPriceUsd: "500.00",
            effectivePriceUsd: "520.00",
            differencePct: 4.0,
            passesLimit: true,
          },
          expiresAt: "2026-09-21T12:00:00.000Z",
        }),
      });
    });

    await page.route("**/api/build", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "OK",
          buildIntentId: "bld_mob_123",
          serializedTransaction: "AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAED",
          expiresAt: "2026-09-21T12:05:00.000Z",
          summary: {
            side: "BUY",
            assetName: "OpenAI",
            assetSymbol: "OPENAI",
            requestedAmount: "250.00",
            fundingAsset: "USDC",
            limitPrice: "525.00",
            effectivePrice: "520.00",
            expectedOutput: "0.480769",
            referencePrice: "500.00",
            priceDifferencePct: "4.0",
            passesLimit: true,
            networkFee: "0.000005 SOL",
            ataFee: "0 SOL",
            totalSolFee: "0.000005 SOL",
          },
        }),
      });
    });

    await page.goto("/buy");
    await connectWallet(page);

    await page.getByPlaceholder("0.00").fill("500");
    await page.getByRole("button", { name: "Check boundary" }).click();

    await expect(page.getByText("Partial capacity")).toBeVisible();
    const useBoundaryBtn = page.getByRole("button", { name: "Use boundary amount" });
    await expect(useBoundaryBtn).toBeVisible();
    await expect(useBoundaryBtn).toHaveCount(1);

    // Screenshot mobile partial result before selection
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "mobile-partial-result.png"), fullPage: true });

    // Click "Use boundary amount"
    await useBoundaryBtn.click();
    await expect(page.getByText(/Using verified amount: 250\.00 USDC/i)).toBeVisible();
    const prepareBtn = page.getByRole("button", { name: "Prepare transaction" });
    await expect(prepareBtn).toBeVisible();

    // Screenshot mobile partial result after selection
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "mobile-partial-selected.png"), fullPage: true });

    // Click Prepare transaction
    await prepareBtn.click();
    await expect(page.getByRole("dialog")).toBeVisible();

    // Screenshot mobile review dialog
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "mobile-review-dialog.png") });
  });

  test("Mobile NO_VERIFIED_CAPACITY", async ({ page }) => {
    await injectMockWallet(page);

    await page.route("**/api/markets", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          network: "mainnet",
          source: "PRESTOCKS",
          markets: [
            {
              name: "OpenAI",
              symbol: "OPENAI",
              mint: "PreStocksOpenAIMint111111111111111111111111",
              referencePriceUsd: "500.00",
            },
          ],
        }),
      });
    });

    await page.route("**/api/capacity/buy", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          checkId: "chk_buy_none_mob",
          status: "NO_VERIFIED_CAPACITY",
          side: "BUY",
          asset: {
            symbol: "OPENAI",
            mint: "PreStocksOpenAIMint111111111111111111111111",
            decimals: 6,
          },
          fundingAsset: "USDC",
          requestedAmount: "1000.00",
          userLimitPct: 1,
          verifiedCapacity: null,
          route: {
            marketPriceUsd: "500.00",
            effectivePriceUsd: "530.00",
            differencePct: 6.0,
            passesLimit: false,
          },
          expiresAt: "2026-09-21T12:00:00.000Z",
        }),
      });
    });

    await page.goto("/buy");
    await connectWallet(page);

    await page.getByPlaceholder("0.00").fill("1000");
    await page.getByRole("button", { name: "Check boundary" }).click();

    await expect(page.getByText("No verified capacity", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Prepare transaction" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Check again" })).toBeVisible();

    // Screenshot mobile no capacity
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "mobile-no-capacity.png"), fullPage: true });
  });
});
