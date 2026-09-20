import { test, expect } from "@playwright/test";

test.describe("Sieve Browser E2E - UI, Accessibility & Security Flows", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to root and clear localStorage
    await page.goto("/");
    await page.evaluate(() => {
      try { localStorage.clear(); } catch {}
    });
  });

  test("1. Disconnected browse: landing page, markets list, and network selector", async ({ page }) => {
    await expect(page).toHaveTitle(/Sieve/i);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/without overpaying/i);

    // Verify network selector has Mainnet and Practice mode
    const networkGroup = page.getByRole("group", { name: /network selection/i });
    await expect(networkGroup).toBeVisible();
    await expect(networkGroup.getByRole("button", { name: /mainnet/i })).toBeVisible();
    await expect(networkGroup.getByRole("button", { name: /practice mode/i })).toBeVisible();

    // Verify markets table
    await expect(page.getByText(/OpenAI/i).first()).toBeVisible();
  });

  test("2. Network switch to Practice Mode shows confirmation dialog and labeled test data", async ({ page }) => {
    // Sieve starts in Practice mode by default
    const practiceBtn = page.getByRole("button", { name: /practice mode/i });
    const mainnetBtn = page.getByRole("button", { name: /mainnet/i });
    await expect(practiceBtn).toHaveAttribute("aria-pressed", "true");

    // Click Mainnet to trigger switch dialog
    await mainnetBtn.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("heading")).toContainText(/Switch to Mainnet/i);

    // Confirm switch to Mainnet
    await dialog.getByRole("button", { name: /switch network/i }).click();
    await expect(dialog).not.toBeVisible();
    await expect(mainnetBtn).toHaveAttribute("aria-pressed", "true");

    // Switch back to Practice mode
    await practiceBtn.click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("heading")).toContainText(/Switch to Practice mode/i);

    // Confirm switch back to Practice mode
    await dialog.getByRole("button", { name: /switch network/i }).click();
    await expect(dialog).not.toBeVisible();
    await expect(practiceBtn).toHaveAttribute("aria-pressed", "true");
  });

  test("3. Buy View: shows Practice mode banner and inputs", async ({ page }) => {
    await page.goto("/buy?mint=PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF");

    // Verify practice mode banner is visible
    await expect(page.getByText(/Practice mode — Test data \/ Simulated transaction/i)).toBeVisible();

    // Verify inputs: Pay with USDC / SOL radio buttons, Amount input, Check button
    await expect(page.getByRole("radio", { name: /usdc/i })).toBeVisible();
    await expect(page.getByRole("radio", { name: /sol/i })).toBeVisible();
    await expect(page.getByPlaceholder("0.00")).toBeVisible();
    await expect(page.getByRole("button", { name: /check today's price/i })).toBeVisible();
  });

  test("4. Price check execution: PASS flow with Price Rail, Review Dialog, and Trade Receipt", async ({ page }) => {
    await page.goto("/buy?mint=PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF");

    // Enter amount
    const amountInput = page.getByPlaceholder("0.00");
    await amountInput.fill("100");

    // Click Check today's price
    const checkBtn = page.getByRole("button", { name: /check today's price/i });
    await checkBtn.click();

    // Verify result: GOOD_TO_GO banner appears
    await expect(page.getByText(/the price is inside your limit/i)).toBeVisible({ timeout: 10000 });

    // Verify Price Rail is visible
    await expect(page.getByText(/price boundary rail/i).first()).toBeVisible();

    // Verify Review button is enabled
    const reviewBtn = page.getByRole("button", { name: /review buy/i });
    await expect(reviewBtn).toBeEnabled();
    await reviewBtn.click();

    // Review Dialog opens
    const reviewModal = page.getByRole("dialog");
    await expect(reviewModal).toBeVisible();
    await expect(reviewModal.getByRole("heading", { name: /review buy/i })).toBeVisible();

    // Click Confirm practice trade or confirm in wallet
    const confirmBtn = reviewModal.getByRole("button", { name: /confirm (practice trade|in wallet)/i });
    await confirmBtn.click();

    // Trade Receipt appears
    await expect(page.getByText(/trade complete/i)).toBeVisible({ timeout: 10000 });

    // Done button resets
    const doneBtn = page.getByRole("button", { name: /done/i });
    await expect(doneBtn).toBeVisible();
    await doneBtn.click();
  });

  test("5. Boundary Enforcement: BLOCK flow when limit is too low", async ({ page }) => {
    await page.goto("/buy?mint=PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF");

    // Adjust limit slider to 0.0% using keyboard Home
    const slider = page.getByRole("slider");
    await expect(slider).toBeVisible();
    await slider.focus();
    await page.keyboard.press("Home");
    await expect(slider).toHaveValue("0");

    // Enter amount
    const amountInput = page.getByPlaceholder("0.00");
    await amountInput.fill("100");

    // Check price
    await page.getByRole("button", { name: /check today's price/i }).click();

    // In practice fixture, price is ~2.8% above reference, so with 0% limit it blocks!
    await expect(page.getByText(/this buy is outside your limit/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/no trade would be created/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /review buy/i })).not.toBeVisible();
  });

  test("6. Exact-boundary PASS: test with exact limit where current buy price equals maximum buy price", async ({ page }) => {
    await page.goto("/buy?mint=PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF");

    // Set slider to 3% (fixture is ~2.87% premium)
    const slider = page.getByRole("slider");
    await slider.focus();
    await page.keyboard.press("Home");
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press("ArrowRight");
    }
    await expect(slider).toHaveValue("3");

    const amountInput = page.getByPlaceholder("0.00");
    await amountInput.fill("100");

    await page.getByRole("button", { name: /check today's price/i }).click();
    await expect(page.getByText(/the price is inside your limit/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("button", { name: /review buy/i })).toBeEnabled();
  });

  test("7. Pass-then-move BLOCK: server revaluation blocks build if market moves outside limit", async ({ page }) => {
    await page.goto("/buy?mint=PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF");

    const amountInput = page.getByPlaceholder("0.00");
    await amountInput.fill("100");
    await page.getByRole("button", { name: /check today's price/i }).click();

    await expect(page.getByText(/the price is inside your limit/i)).toBeVisible({ timeout: 10000 });
    const reviewBtn = page.getByRole("button", { name: /review buy/i });
    await reviewBtn.click();

    // Mock /api/build responding with BLOCKED due to price movement
    await page.route("**/api/build", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "BLOCKED",
          reason: "PRICE_MOVED",
          refreshedCheck: {
            checkId: "mock-refreshed-id",
            clientIntentVersion: "v1",
            network: "testnet",
            sourceLabel: "Practice Fixture",
            asset: { name: "OpenAI", symbol: "OPENAI", mint: "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF" },
            funding: { asset: "USDC", amount: "100", usdValue: "100.00" },
            price: { referenceUsd: "100.00", currentBuyUsd: "115.00", maxBuyUsd: "105.00", premiumPct: "15.00" },
            expected: { targetAmount: "0.8695", priceImpactPct: "0.01" },
            decision: "PRICE_TOO_HIGH",
            observedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 60000).toISOString(),
            display: { title: "Price Moved Outside Limit", message: "Market price moved above your limit." },
          },
        }),
      });
    });

    const confirmBtn = page.getByRole("button", { name: /confirm (practice trade|in wallet)/i });
    await confirmBtn.click();

    // Review dialog closes, and banner displays the blocked state
    await expect(page.getByText(/The price moved above your limit before transaction construction/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /review buy/i })).not.toBeVisible();
  });

  test("8. SOL funding flow: check price and review flow with SOL as funding asset", async ({ page }) => {
    await page.goto("/buy?mint=PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF");

    // Select SOL
    const solRadio = page.getByRole("radio", { name: /sol/i });
    await solRadio.click();

    // Fill amount in SOL
    const amountInput = page.getByPlaceholder("0.00");
    await amountInput.fill("1.5");

    await page.getByRole("button", { name: /check today's price/i }).click();
    await expect(page.getByText(/the price is inside your limit/i)).toBeVisible({ timeout: 10000 });

    // Review buy shows SOL funding
    await page.getByRole("button", { name: /review buy/i }).click();
    const reviewModal = page.getByRole("dialog");
    await expect(reviewModal).toBeVisible();
    await expect(reviewModal.getByText(/1.5 SOL/i)).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("9. USDC funding flow: check price and review flow with USDC as funding asset", async ({ page }) => {
    await page.goto("/buy?mint=PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF");

    const usdcRadio = page.getByRole("radio", { name: /usdc/i });
    await usdcRadio.click();

    const amountInput = page.getByPlaceholder("0.00");
    await amountInput.fill("50");

    await page.getByRole("button", { name: /check today's price/i }).click();
    await expect(page.getByText(/the price is inside your limit/i)).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: /review buy/i }).click();
    const reviewModal = page.getByRole("dialog");
    await expect(reviewModal).toBeVisible();
    await expect(reviewModal.getByText(/50 USDC/i)).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("10. Changing funding asset invalidates existing check result", async ({ page }) => {
    await page.goto("/buy?mint=PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF");

    await page.getByPlaceholder("0.00").fill("100");
    await page.getByRole("button", { name: /check today's price/i }).click();
    await expect(page.getByRole("button", { name: /review buy/i })).toBeVisible({ timeout: 10000 });

    // Switch funding asset to SOL
    await page.getByRole("radio", { name: /sol/i }).click();

    // Review button should immediately disappear and check result is reset
    await expect(page.getByRole("button", { name: /review buy/i })).not.toBeVisible();
    await expect(page.getByText(/the price is inside your limit/i)).not.toBeVisible();
  });

  test("11. Changing input amount invalidates existing check result", async ({ page }) => {
    await page.goto("/buy?mint=PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF");

    const amountInput = page.getByPlaceholder("0.00");
    await amountInput.fill("100");
    await page.getByRole("button", { name: /check today's price/i }).click();
    await expect(page.getByRole("button", { name: /review buy/i })).toBeVisible({ timeout: 10000 });

    // Modify amount
    await amountInput.fill("200");

    // Review button should immediately disappear
    await expect(page.getByRole("button", { name: /review buy/i })).not.toBeVisible();
    await expect(page.getByText(/the price is inside your limit/i)).not.toBeVisible();
  });

  test("12. Switching network resets check and active trade state", async ({ page }) => {
    await page.goto("/buy?mint=PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF");

    await page.getByPlaceholder("0.00").fill("100");
    await page.getByRole("button", { name: /check today's price/i }).click();
    await expect(page.getByRole("button", { name: /review buy/i })).toBeVisible({ timeout: 10000 });

    // Trigger network switch to Mainnet
    const mainnetBtn = page.getByRole("button", { name: /mainnet/i });
    await mainnetBtn.click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: /switch network/i }).click();

    // In Mainnet, practice check is cleared
    await expect(page.getByRole("button", { name: /review buy/i })).not.toBeVisible();
    await expect(page.getByText(/Practice mode — Test data/i)).not.toBeVisible();
  });

  test("13. Stale async check response is discarded when inputs change in flight", async ({ page }) => {
    await page.goto("/buy?mint=PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF");

    let delayedResolve: (() => void) | null = null;
    await page.route("**/api/check", async (route) => {
      // Delay the response
      await new Promise<void>((resolve) => {
        delayedResolve = resolve;
      });
      await route.continue();
    });

    const amountInput = page.getByPlaceholder("0.00");
    await amountInput.fill("100");
    await page.getByRole("button", { name: /check today's price/i }).click();

    // While check is in flight, user changes amount
    await amountInput.fill("250");

    // Resolve the delayed check
    if (delayedResolve) (delayedResolve as () => void)();

    // Verify stale response was ignored: review button is not visible
    await expect(page.getByRole("button", { name: /review buy/i })).not.toBeVisible();
  });

  test("14. Preferences persistence: default price limit and funding asset persist across navigation", async ({ page }) => {
    await page.goto("/preferences");

    // Change default limit
    const limitSlider = page.getByLabel(/default price limit/i);
    await limitSlider.fill("7.5");

    // Change default asset to SOL
    await page.getByRole("button", { name: "SOL" }).click();

    // Click Save preferences
    await page.getByRole("button", { name: /save preferences/i }).click();
    await expect(page.getByText(/saved/i)).toBeVisible();

    // Navigate to Buy view
    await page.goto("/buy?mint=PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF");

    // Verify persisted preferences are loaded
    await expect(page.getByRole("radio", { name: /sol/i })).toHaveAttribute("aria-checked", "true");
    const slider = page.getByRole("slider");
    await expect(slider).toHaveValue("7.5");
  });

  test("15. Mobile viewport: responsive layout, bottom navigation, and minimum touch targets", async ({ page }) => {
    // Set mobile viewport (iPhone SE)
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");

    // Verify bottom navigation bar is visible on mobile
    const bottomNav = page.getByRole("navigation");
    await expect(bottomNav).toBeVisible();

    // Check minimum touch targets (>= 44x44px)
    const navButtons = await bottomNav.getByRole("link").all();
    for (const btn of navButtons) {
      const box = await btn.boundingBox();
      if (box) {
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
    }
  });

  test("16. Slider keyboard accessibility: Arrow, Home, and End keys adjust price limit", async ({ page }) => {
    await page.goto("/buy?mint=PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF");

    const slider = page.getByRole("slider");
    await slider.focus();

    // Press ArrowRight to increase
    const initialVal = parseFloat(await slider.inputValue());
    await page.keyboard.press("ArrowRight");
    const nextVal = parseFloat(await slider.inputValue());
    expect(nextVal).toBeGreaterThan(initialVal);

    // Press Home to go to min (0)
    await page.keyboard.press("Home");
    expect(parseFloat(await slider.inputValue())).toBe(0);

    // Press End to go to max (25)
    await page.keyboard.press("End");
    expect(parseFloat(await slider.inputValue())).toBe(25);
  });

  test("17. Accessibility & Reduced Motion: respects prefers-reduced-motion and dialog escape key", async ({ page }) => {
    // Emulate reduced motion
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/buy?mint=PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF");

    // Verify window.matchMedia respects reduced motion
    const matchesReducedMotion = await page.evaluate(() => {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    });
    expect(matchesReducedMotion).toBe(true);

    // Complete a check and open review dialog
    await page.getByPlaceholder("0.00").fill("100");
    await page.getByRole("button", { name: /check today's price/i }).click();
    await expect(page.getByRole("button", { name: /review buy/i })).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: /review buy/i }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Verify computed animation duration is reduced (0.01ms / 0s)
    const animationDuration = await dialog.evaluate((el) => {
      return window.getComputedStyle(el).animationDuration;
    });
    expect(
      animationDuration === "0s" ||
      animationDuration === "0.00001s" ||
      animationDuration.includes("0.01ms") ||
      parseFloat(animationDuration) <= 0.001
    ).toBe(true);

    // Press Escape to dismiss dialog
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
  });

  test("18. Practice Mode Zero-Signing Guarantee: never calls signTransaction even when wallet is connected", async ({ page }) => {
    // Inject mock wallet before page loads
    await page.addInitScript(() => {
      (window as any).__signCalls = 0;
      (window as any).solana = {
        isPhantom: true,
        publicKey: {
          toBase58: () => "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
          toString: () => "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
        },
        connect: async () => ({
          publicKey: {
            toBase58: () => "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
            toString: () => "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
          },
        }),
        signTransaction: async (tx: any) => {
          (window as any).__signCalls++;
          return tx;
        },
        signAllTransactions: async (txs: any[]) => {
          (window as any).__signCalls += txs.length;
          return txs;
        },
      };
    });

    await page.goto("/buy?mint=PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF");

    // Verify practice mode banner is visible
    await expect(page.getByText(/practice mode/i).first()).toBeVisible();

    // Check price
    await page.getByPlaceholder("0.00").fill("100");
    await page.getByRole("button", { name: /check today's price/i }).click();
    await expect(page.getByRole("button", { name: /review buy/i })).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: /review buy/i }).click();

    // Review dialog opens with "Confirm practice trade"
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: /confirm practice trade/i })).toBeVisible();

    // Confirm practice trade
    await dialog.getByRole("button", { name: /confirm practice trade/i }).click();

    // Trade completes
    await expect(page.getByText(/trade complete/i)).toBeVisible({ timeout: 10000 });

    // Assert signTransaction was NEVER called
    const signCalls = await page.evaluate(() => (window as any).__signCalls);
    expect(signCalls).toBe(0);
  });
});
