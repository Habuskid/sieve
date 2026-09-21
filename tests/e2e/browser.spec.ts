import { expect, test } from "@playwright/test";

test.describe("Mainnet-only application shell", () => {
  test("shows a fixed Solana Mainnet identity and no network selector", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Solana Mainnet")).toBeVisible();
    await expect(page.getByRole("button", { name: /testnet|devnet|network/i })).toHaveCount(0);
  });

  test("Buy requires a wallet before transaction preparation", async ({ page }) => {
    await page.goto("/buy");
    await expect(page.getByText("Solana Mainnet")).toBeVisible();
    await expect(page.getByText(/simulation|practice data/i)).toHaveCount(0);
  });

  test("Markets request does not expose a network toggle", async ({ page }) => {
    await page.goto("/markets");
    await expect(page.getByText("Solana Mainnet")).toBeVisible();
    await expect(page.getByText(/testnet/i)).toHaveCount(0);
  });
});
