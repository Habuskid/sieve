import { expect, test } from "@playwright/test";
const wallet = "11111111111111111111111111111111";
test("history is private without wallet authentication", async ({ request }) => {
  const response = await request.get(`/api/history?wallet=${wallet}`);
  expect(response.status()).toBe(401);
  expect((await response.json()).items).toBeUndefined();
});
test("HTTP responses prevent framing and MIME sniffing", async ({ request }) => {
  const response = await request.get("/");
  expect(response.headers()["x-frame-options"]).toBe("DENY");
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
});
test("build rejects intent overrides without contacting providers", async ({ request }) => {
  const response = await request.post("/api/build", { data: { checkId: "11111111-1111-4111-8111-111111111111", wallet, amount: "99999999" } });
  expect(response.status()).toBe(400);
  expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
});
test("capacity quota cannot be reset by forwarding header rotation", async ({ request }) => {
  let status = 0;
  for (let i = 0; i < 7; i++) {
    status = (await request.post("/api/capacity/buy", { headers: { "x-forwarded-for": `10.0.0.${i}` }, data: {} })).status();
  }
  expect(status).toBe(429);
});
