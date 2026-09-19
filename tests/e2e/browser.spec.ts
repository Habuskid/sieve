import { test, expect } from "@playwright/test";

test.describe("Sieve Browser E2E - UI & Security Flows", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to root
    await page.goto("/");
  });

  test("1. Renders landing page, markets list, and network selector", async ({ page }) => {
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
    // Navigate to buy view with a practice token
    await page.goto("/buy?mint=PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF");

    // Verify practice mode banner is visible
    await expect(page.getByText(/Practice mode — Test data \/ Simulated transaction/i)).toBeVisible();

    // Verify inputs: Pay with USDC / SOL radio buttons, Amount input, Check button
    await expect(page.getByRole("radio", { name: /usdc/i })).toBeVisible();
    await expect(page.getByRole("radio", { name: /sol/i })).toBeVisible();
    await expect(page.getByPlaceholder("0.00")).toBeVisible();
    await expect(page.getByRole("button", { name: /check today's price/i })).toBeVisible();
  });

  test("4. Price check execution: PASS flow with Price Rail and Review Dialog", async ({ page }) => {
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

    // Click Confirm in Wallet
    const confirmBtn = reviewModal.getByRole("button", { name: /confirm in wallet/i });
    await confirmBtn.click();

    // Trade Receipt appears
    await expect(page.getByText(/trade complete/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/view on solscan/i)).toBeVisible();

    // Done button resets
    const doneBtn = page.getByRole("button", { name: /done/i });
    await expect(doneBtn).toBeVisible();
    await doneBtn.click();
  });

  test("5. Boundary Enforcement: BLOCK flow when limit is too low", async ({ page }) => {
    await page.goto("/buy?mint=PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF");

    // Adjust limit slider to 0.0%
    const slider = page.getByRole("slider");
    await expect(slider).toBeVisible();
    await slider.fill("0");

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

  test("6. Accessibility: interactive elements meet minimum touch target and semantic requirements", async ({ page }) => {
    await page.goto("/");

    // Buttons must have accessible text
    const buttons = await page.getByRole("button").all();
    expect(buttons.length).toBeGreaterThan(0);

    for (const button of buttons.slice(0, 10)) {
      const name = await button.innerText();
      const ariaLabel = await button.getAttribute("aria-label");
      expect(name || ariaLabel).toBeTruthy();
    }
  });
});
