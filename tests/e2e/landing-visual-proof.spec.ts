import { test, expect } from "@playwright/test";

test.describe("TASK 11 — Landing Page Visual & Responsive Proof", () => {
  test("Desktop (1440x900) — Renders hero, Boundary Capacity, Buy/Sell, Architecture, and CTA", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    // Verify key headings and copy
    await expect(page.getByText("You set the boundary.")).toBeVisible();
    await expect(page.getByText("Sieve enforces it.", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Check a boundary" }).first()
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Explore PreStocks" })).toBeVisible();

    // Verify illustrative demo label
    await expect(page.getByText("Illustrative example")).toBeVisible();
    await expect(page.getByText("Not live market data")).toBeVisible();

    // Verify Boundary Capacity section
    await expect(
      page.getByText(
        "Boundary Capacity shows how much of your requested order was actually verified within your configured boundary."
      )
    ).toBeVisible();

    // Verify Buy and Sell sections
    await expect(page.getByText("Buy PreStocks")).toBeVisible();
    await expect(page.getByText("Sell PreStocks")).toBeVisible();

    // Verify Architecture roles
    await expect(page.getByText("Reference state", { exact: true })).toBeVisible();
    await expect(page.getByText("Executable liquidity", { exact: true })).toBeVisible();
    await expect(page.getByText("Token-2022 economic state", { exact: true })).toBeVisible();
    await expect(page.getByText("Execution policy", { exact: true })).toBeVisible();

    // Check no horizontal overflow
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);

    // Capture screenshot
    await page.screenshot({
      path: "scratch/screenshots/task11_landing_desktop_1440x900.png",
      fullPage: true,
    });
  });

  test("Mobile (390x844) — Renders cleanly, CTAs reachable, no horizontal overflow", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    await expect(page.getByText("You set the boundary.")).toBeVisible();
    await expect(page.getByText("Sieve enforces it.", { exact: true })).toBeVisible();

    const mobileCta = page.getByRole("link", { name: "Check a boundary" }).first();
    await expect(mobileCta).toBeVisible();

    // Check no horizontal overflow
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);

    // Capture screenshot
    await page.screenshot({
      path: "scratch/screenshots/task11_landing_mobile_390x844.png",
      fullPage: true,
    });
  });
});
