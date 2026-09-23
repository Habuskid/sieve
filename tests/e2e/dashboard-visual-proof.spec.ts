import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";

const SCREENSHOTS_DIR = "C:/Users/PC/.gemini/antigravity-cli/brain/1136def9-fe43-446f-8026-cdda6b71798c/scratch/screenshots";

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

// Helper to inject mock wallet into window.navigator.wallets
async function injectMockWallet(
  page: any,
  options: { autoConnect?: boolean; walletAddress?: string } = {}
) {
  const { autoConnect = false, walletAddress = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM" } = options;

  await page.addInitScript(
    ({ address, preConnected }: { address: string; preConnected: boolean }) => {
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
        icon: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24'><rect width='24' height='24' fill='%2338bdf8'/></svg>",
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
        accounts: preConnected ? [mockAccount] : ([] as any[]),
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
    },
    { address: walletAddress, preConnected: autoConnect }
  );
}

// Helper to mock markets endpoint
async function setupMockMarkets(page: any) {
  await page.route("**/api/markets", async (route: any) => {
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
}

// Helper to mock buy capacity endpoint
async function setupMockBuyCapacity(page: any) {
  await page.route("**/api/capacity/buy", async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        checkId: "chk_dash_buy_123",
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
}

// Helper to mock history endpoint
async function setupMockHistory(page: any) {
  await page.route("**/api/history**", async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        wallet: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
        network: "mainnet",
        items: [
          {
            id: "chk-openai",
            side: "BUY",
            type: "CHECK_PASSED",
            timestamp: "2026-09-23T12:00:00.000Z",
            tokenSymbol: "OPENAI",
            amount: "50.000000000000000000",
            asset: { name: "OpenAI PreStock", symbol: "OPENAI", mint: "mint-openai" },
            funding: { asset: "USDC", amount: "50.000000000000000000" },
            executionPriceUsd: "512.50",
            boundary: { type: "MAX_PREMIUM", bps: 500, pct: "5.00" },
            realizedBoundaryPct: "2.50",
            network: "mainnet",
            statusLabel: "Checked",
          },
          {
            id: "chk-spacex",
            side: "BUY",
            type: "CHECK_BLOCKED",
            timestamp: "2026-09-23T12:05:00.000Z",
            tokenSymbol: "SPACEX",
            amount: "100.000000",
            asset: { name: "SpaceX PreStock", symbol: "SPACEX", mint: "mint-spacex" },
            funding: { asset: "USDC", amount: "100.000000" },
            executionPriceUsd: "220.00",
            boundary: { type: "MAX_PREMIUM", bps: 500, pct: "5.00" },
            realizedBoundaryPct: "10.00",
            network: "mainnet",
            statusLabel: "Blocked",
          },
          {
            id: "trade-anthropic",
            side: "BUY",
            type: "TRADE_CONFIRMED",
            timestamp: "2026-09-23T12:10:00.000Z",
            tokenSymbol: "ANTHROPIC",
            amount: "250.000000",
            asset: { name: "Anthropic PreStock", symbol: "ANTHROPIC", mint: "mint-anthropic" },
            funding: { asset: "USDC", amount: "250.000000" },
            executionPriceUsd: "153.00",
            boundary: { type: "MAX_PREMIUM", bps: 500, pct: "5.00" },
            realizedBoundaryPct: "2.00",
            network: "mainnet",
            signature: "5VERv8NMvzbJMEdV8xnrLkEaMaWRqfZ8xTuU8xnrLkEaMaWRqfZ8xTuU8xnrLkEaMaWRqfZ8xTuU8xnrLkEaMaWR",
            statusLabel: "Confirmed",
          },
        ],
      }),
    });
  });
}

test.describe("TASK DASHBOARD & LANDING REFINEMENT — Complete 9 Proofs", () => {
  // PROOF 1: Landing disconnected CTA is "Connect wallet" button in hero and opens wallet modal
  test("Proof 1: Landing disconnected CTA is 'Connect wallet' button and opens wallet modal", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await injectMockWallet(page, { autoConnect: false });
    await page.goto("/");

    // Hero contains "Connect wallet" button
    const heroBtn = page.locator("main").getByRole("button", { name: "Connect wallet" });
    await expect(heroBtn).toBeVisible();

    // Verify it is NOT a link to /buy
    const buyLinkInHero = page.locator("main section").first().getByRole("link", { name: /check a boundary/i });
    await expect(buyLinkInHero).toHaveCount(0);

    // Clicking it opens the wallet modal
    await heroBtn.click();
    const walletModal = page.locator(".wallet-adapter-modal");
    await expect(walletModal).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("button", { name: /Institutional Mock Wallet/i })).toBeVisible();

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "proof1-landing-disconnected-cta-modal.png"), fullPage: true });
  });

  // PROOF 2: Header Connect wallet while on landing redirects to /dashboard
  test("Proof 2: Header Connect wallet while on landing redirects to /dashboard", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await injectMockWallet(page, { autoConnect: false });
    await page.goto("/");

    // Click Connect wallet in header
    const headerBtn = page.locator("header").getByRole("button", { name: "Connect wallet" });
    await expect(headerBtn).toBeVisible();
    await headerBtn.click();
    await page.getByRole("button", { name: /Institutional Mock Wallet/i }).click();

    // It redirects to /dashboard
    await page.waitForURL("**/dashboard", { timeout: 20000 });
    expect(page.url()).toContain("/dashboard");
    await expect(page.getByRole("heading", { name: "Execution" })).toBeVisible();

    // Navigate back to "/" to verify returning connected state
    await page.goto("/");
    await expect(page.getByText("You set the boundary.")).toBeVisible();

    const openDashboardLink = page.locator("main").getByRole("link", { name: /open dashboard/i });
    await expect(openDashboardLink).toBeVisible();
    await expect(openDashboardLink).toHaveAttribute("href", "/dashboard");

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "proof2-landing-connected-open-dashboard.png"), fullPage: true });
  });

  // PROOF 3: Hero Connect wallet while on landing redirects to /dashboard
  test("Proof 3: Hero Connect wallet while on landing redirects to /dashboard", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await injectMockWallet(page, { autoConnect: false });
    await page.goto("/");

    // User explicitly clicks Connect wallet in the landing hero
    const heroBtn = page.locator("main").getByRole("button", { name: "Connect wallet" });
    await heroBtn.click();

    // Select wallet
    const mockOption = page.getByRole("button", { name: /Institutional Mock Wallet/i });
    await expect(mockOption).toBeVisible();
    await mockOption.click();

    // Verify redirected to /dashboard
    await page.waitForURL("**/dashboard", { timeout: 10000 });
    expect(page.url()).toContain("/dashboard");
    await expect(page.getByRole("heading", { name: "Execution" })).toBeVisible();

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "proof3-explicit-connection-redirect.png"), fullPage: true });
  });

  // PROOF 4: Wallet auto-connect/hydration does NOT force navigation away from landing
  test("Proof 4: Wallet auto-connect/hydration does NOT force navigation away from landing", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await injectMockWallet(page, { autoConnect: false });

    // Connect wallet on dashboard first to simulate existing connected session in browser localStorage
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Connect wallet" }).first().click();
    await page.getByRole("button", { name: /Institutional Mock Wallet/i }).click();
    await expect(page.getByRole("heading", { name: "Execution" })).toBeVisible();

    // Returning user now visits the landing page "/" with wallet session active
    await page.goto("/");

    // Wait 2 seconds to ensure no redirect fires
    await page.waitForTimeout(2000);

    // URL must remain landing "/"
    expect(new URL(page.url()).pathname).toBe("/");

    // Hero shows "Open dashboard" instead of forcing away
    const openDashboardLink = page.getByRole("link", { name: /open dashboard/i });
    await expect(openDashboardLink).toBeVisible();
    await expect(openDashboardLink).toHaveAttribute("href", "/dashboard");

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "proof4-autoconnect-stays-on-landing.png"), fullPage: true });
  });

  // PROOF 5: /dashboard disconnected shows ONLY the connection gate with no execution form
  test("Proof 5: /dashboard disconnected shows ONLY the connection gate with no execution form", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/dashboard");

    // Title and description
    await expect(page.getByRole("heading", { name: "Connect wallet to continue" })).toBeVisible();
    await expect(
      page.getByText("Connect your wallet to check and enforce your execution boundary.")
    ).toBeVisible();

    // Connect wallet CTA button is present
    const connectBtn = page.getByRole("button", { name: "Connect wallet" });
    await expect(connectBtn.first()).toBeVisible();

    // Execution form is NOT rendered
    await expect(page.getByRole("heading", { name: "Execution" })).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "Buy" })).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "Sell" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Check boundary" })).toHaveCount(0);
    await expect(page.getByPlaceholder("0.00")).toHaveCount(0);

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "proof5-dashboard-disconnected-gate.png"), fullPage: true });
  });

  // PROOF 6: /dashboard connected renders full execution workspace
  test("Proof 6: /dashboard connected renders full execution workspace", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await injectMockWallet(page, { autoConnect: false });
    await setupMockMarkets(page);

    await page.goto("/dashboard");

    // Disconnected gate shown first
    await expect(page.getByRole("heading", { name: "Connect wallet to continue" })).toBeVisible();

    // Connect wallet
    await page.getByRole("button", { name: "Connect wallet" }).first().click();
    await page.getByRole("button", { name: /Institutional Mock Wallet/i }).click();

    // Now execution workspace is rendered
    await expect(page.getByRole("heading", { name: "Execution" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Buy" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Sell" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Check boundary" })).toBeVisible();
    await expect(page.getByPlaceholder("0.00")).toBeVisible();

    // Disconnected gate is removed
    await expect(page.getByRole("heading", { name: "Connect wallet to continue" })).toHaveCount(0);

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "proof6-dashboard-connected-workspace.png"), fullPage: true });
  });

  // PROOF 7: Landing illustrative Boundary Capacity card contains no green/emerald styling
  test("Proof 7: Landing illustrative Boundary Capacity card contains no green/emerald styling", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    // Verify illustrative card text
    await expect(page.getByText("Illustrative example")).toBeVisible();
    await expect(page.getByText("Within boundary")).toBeVisible();
    await expect(page.getByText("Boundary Capacity Verified")).toBeVisible();

    // Inspect the illustrative card wrapper HTML
    const illustrativeCard = page.locator("text=Within boundary").locator("..").locator("..");
    const cardHtml = await illustrativeCard.innerHTML();

    expect(cardHtml).not.toContain("emerald");
    expect(cardHtml).not.toContain("bg-sieveGreen");
    expect(cardHtml).not.toContain("text-sieveGreen");
    expect(cardHtml).not.toContain("border-sieveGreen");
    expect(cardHtml).not.toContain("bg-green");
    expect(cardHtml).not.toContain("text-green");

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "proof7-landing-illustrative-no-green.png"), fullPage: true });
  });

  // PROOF 8: Dashboard within boundary and capacity states contain no green/emerald styling
  test("Proof 8: Dashboard within boundary and capacity states contain no green/emerald styling", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await injectMockWallet(page, { autoConnect: false });
    await setupMockMarkets(page);
    await setupMockBuyCapacity(page);

    await page.goto("/dashboard");

    // Connect wallet
    await page.getByRole("button", { name: "Connect wallet" }).first().click();
    await page.getByRole("button", { name: /Institutional Mock Wallet/i }).click();

    // Fill amount and check boundary
    await page.getByPlaceholder("0.00").fill("100");
    await page.getByRole("button", { name: "Check boundary" }).click();

    // Boundary capacity verified card appears
    await expect(page.getByText("Within boundary")).toBeVisible();
    await expect(page.getByText("Boundary Capacity Verified")).toBeVisible();
    await expect(page.getByText("Prepare transaction")).toBeVisible();

    // Inspect the result region for absence of green/emerald
    const resultRegion = page.locator('[data-testid="boundary-capacity-result"]');
    const resultHtml = await resultRegion.innerHTML();

    expect(resultHtml).not.toContain("emerald");
    expect(resultHtml).not.toContain("bg-sieveGreen");
    expect(resultHtml).not.toContain("text-sieveGreen");
    expect(resultHtml).not.toContain("border-sieveGreen");

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "proof8-dashboard-within-boundary-no-green.png"), fullPage: true });
  });

  // PROOF 9: Mobile responsiveness — no horizontal overflow on landing and dashboard
  test("Proof 9: Mobile responsiveness — no horizontal overflow on landing and dashboard", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await injectMockWallet(page, { autoConnect: false });
    await setupMockMarkets(page);

    // 1. Landing Mobile Check
    await page.goto("/");
    let scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    let clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "proof9-mobile-landing.png"), fullPage: true });

    // 2. Dashboard Mobile Disconnected Check
    await page.goto("/dashboard");
    scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
    await expect(page.getByRole("heading", { name: "Connect wallet to continue" })).toBeVisible();

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "proof9-mobile-dashboard-disconnected.png"), fullPage: true });

    // 3. Connect wallet on mobile
    await page.getByRole("button", { name: "Connect wallet" }).first().click();
    await page.getByRole("button", { name: /Institutional Mock Wallet/i }).click();

    // Dashboard Mobile Connected Check
    await expect(page.getByRole("heading", { name: "Execution" })).toBeVisible();
    scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "proof9-mobile-dashboard-connected.png"), fullPage: true });
  });

  // PROOF 10: Explicit Disconnect from wallet dropdown redirects to /
  test("Proof 10: Explicit Disconnect from wallet dropdown redirects to /", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await injectMockWallet(page, { autoConnect: false });
    await setupMockMarkets(page);

    // Connect wallet on dashboard
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Connect wallet" }).first().click();
    await page.getByRole("button", { name: /Institutional Mock Wallet/i }).click();
    await expect(page.getByRole("heading", { name: "Execution" })).toBeVisible();

    // Click wallet button in header to open dropdown
    await page.getByRole("button", { name: /9wzd/i }).click();
    await expect(page.getByRole("menuitem", { name: /disconnect/i })).toBeVisible();

    // Click Disconnect
    await page.getByRole("menuitem", { name: /disconnect/i }).click();

    // Must redirect to "/" and render in disconnected state
    await page.waitForURL("/");
    expect(new URL(page.url()).pathname).toBe("/");
    await expect(page.getByRole("button", { name: "Connect wallet" }).first()).toBeVisible();

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "proof10-logout-redirect.png"), fullPage: true });
  });

  // PROOF 11: /buy route redirects to /dashboard preserving deep link search params
  test("Proof 11: /buy route redirects to /dashboard preserving deep link search params", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await injectMockWallet(page, { autoConnect: false });

    // Navigate to legacy /buy deep link with params
    await page.goto("/buy?mint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
    await page.waitForURL("**/dashboard?mint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

    const currentUrl = new URL(page.url());
    expect(currentUrl.pathname).toBe("/dashboard");
    expect(currentUrl.searchParams.get("mint")).toBe("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "proof11-buy-redirect-dashboard.png"), fullPage: true });
  });

  // PROOF 12: History desktop shows segmented control filters, neutral columns, and human-readable USDC
  test("Proof 12: History desktop shows segmented control filters, neutral columns, and human-readable USDC", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await injectMockWallet(page, { autoConnect: false });
    await setupMockHistory(page);

    await page.goto("/history");

    // Connect wallet
    await page.getByRole("button", { name: "Connect wallet" }).first().click();
    await page.getByRole("button", { name: /Institutional Mock Wallet/i }).click();

    await expect(page.getByRole("heading", { name: "Execution History" })).toBeVisible();

    // Verify segmented control tabs
    const tablist = page.getByRole("tablist", { name: "History filters" });
    await expect(tablist).toBeVisible();
    await expect(page.getByRole("tab", { name: "All" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Executions" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Boundary checks" })).toBeVisible();

    // Verify neutral column headers
    await expect(page.getByRole("columnheader", { name: "Status" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Asset" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Side" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Amount" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Execution Price" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Boundary" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Time" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Transaction" })).toBeVisible();

    // Verify human-readable USDC (50.00 USDC, not 50.000000000000000000)
    await expect(page.getByText("50.00 USDC").first()).toBeVisible();
    expect(await page.locator("table").innerText()).not.toContain("50.000000000000000000");

    // Check-only row does NOT say 'Transaction reconciliation unavailable'
    await expect(page.getByText("Check only — no transaction prepared").first()).toBeVisible();

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "proof12-history-desktop.png"), fullPage: true });
  });

  // PROOF 13: History mobile has no horizontal overflow
  test("Proof 13: History mobile has no horizontal overflow and renders stacked cards", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await injectMockWallet(page, { autoConnect: false });
    await setupMockHistory(page);

    await page.goto("/history");

    // Connect wallet on mobile
    await page.getByRole("button", { name: "Connect wallet" }).first().click();
    await page.getByRole("button", { name: /Institutional Mock Wallet/i }).click();

    await expect(page.getByRole("heading", { name: "Execution History" })).toBeVisible();

    // Check no horizontal overflow
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);

    // Verify mobile stacked cards render
    await expect(page.locator(".sm\\:hidden").getByText("OPENAI").first()).toBeVisible();
    await expect(page.locator(".sm\\:hidden").getByText("50.00 USDC").first()).toBeVisible();

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "proof13-history-mobile.png"), fullPage: true });
  });
});
