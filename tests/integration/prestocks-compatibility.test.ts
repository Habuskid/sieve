import { describe, it, expect, vi } from "vitest";
import { checkPreStocksCompatibility } from "../../scripts/check-prestocks-compatibility.mjs";
import { Keypair } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, ExtensionType } from "@solana/spl-token";

describe("PreStocks Compatibility Diagnostic (Read-Only)", () => {
  it("correctly audits a sample PreStocks market set in read-only mode", async () => {
    const cleanSplMint = Keypair.generate().publicKey;
    const blockedExtMint = Keypair.generate().publicKey;
    const cleanToken2022Mint = Keypair.generate().publicKey;

    const mockMarkets = [
      {
        name: "Clean SPL Asset",
        symbol: "CLEANSPL",
        contract_address: cleanSplMint.toBase58(),
      },
      {
        name: "NonTransferable Asset",
        symbol: "NONTRANS",
        contract_address: blockedExtMint.toBase58(),
      },
      {
        name: "Clean Token-2022 Asset",
        symbol: "CLEAN2022",
        contract_address: cleanToken2022Mint.toBase58(),
      },
      {
        name: "Missing Mint Asset",
        symbol: "MISSING",
        contract_address: null,
      },
    ];

    // Mock fetch for PreStocks API
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockMarkets,
    }));

    // Construct mock buffers
    const splData = Buffer.alloc(82);
    splData[44] = 6; // decimals
    splData[45] = 1;

    // NonTransferable buffer
    const nonTransData = Buffer.alloc(165 + 1 + 4);
    nonTransData[44] = 9;
    nonTransData[45] = 1;
    nonTransData[165] = 1;
    nonTransData.writeUInt16LE(ExtensionType.NonTransferable, 166);
    nonTransData.writeUInt16LE(0, 168);

    // Clean Token-2022 buffer
    const clean2022Data = Buffer.alloc(82);
    clean2022Data[44] = 9;
    clean2022Data[45] = 1;

    // Mock Connection prototype
    const { Connection } = await import("@solana/web3.js");
    const origGetAccountInfo = Connection.prototype.getAccountInfo;
    const origGetEpochInfo = Connection.prototype.getEpochInfo;

    Connection.prototype.getEpochInfo = vi.fn().mockResolvedValue({ epoch: 500 });
    Connection.prototype.getAccountInfo = vi.fn().mockImplementation(async (pubkey) => {
      const keyStr = pubkey.toBase58();
      if (keyStr === cleanSplMint.toBase58()) {
        return {
          owner: TOKEN_PROGRAM_ID,
          data: splData,
        };
      }
      if (keyStr === blockedExtMint.toBase58()) {
        return {
          owner: TOKEN_2022_PROGRAM_ID,
          data: nonTransData,
        };
      }
      if (keyStr === cleanToken2022Mint.toBase58()) {
        return {
          owner: TOKEN_2022_PROGRAM_ID,
          data: clean2022Data,
        };
      }
      return null;
    });

    try {
      const results = await checkPreStocksCompatibility();

      expect(results).toHaveLength(4);

      const cleanSpl = results.find((r) => r.symbol === "CLEANSPL");
      expect(cleanSpl?.status).toBe("PASS_SUPPORTED");
      expect(cleanSpl?.program).toBe("SPL-Token");

      const nonTrans = results.find((r) => r.symbol === "NONTRANS");
      expect(nonTrans?.status).toBe("BLOCKED_SAFE");
      expect(nonTrans?.reason).toMatch(/NonTransferable/);

      const clean2022 = results.find((r) => r.symbol === "CLEAN2022");
      expect(clean2022?.status).toBe("PASS_SUPPORTED");
      expect(clean2022?.program).toBe("Token-2022");

      const missing = results.find((r) => r.symbol === "MISSING");
      expect(missing?.status).toBe("BLOCKED_SAFE");
      expect(missing?.reason).toMatch(/Missing contract_address/);
    } finally {
      Connection.prototype.getAccountInfo = origGetAccountInfo;
      Connection.prototype.getEpochInfo = origGetEpochInfo;
      vi.unstubAllGlobals();
    }
  });
});
