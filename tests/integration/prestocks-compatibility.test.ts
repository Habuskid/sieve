import { describe, it, expect, vi } from "vitest";
import { auditPreStocksMarkets } from "../../scripts/lib/prestocks-compatibility.mjs";
import { Keypair } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";

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

    const adapter = { resolveMintMetadata: vi.fn().mockImplementation(async (mint) => {
      const keyStr = mint.toString();
      if (keyStr === cleanSplMint.toBase58()) {
        return { programOwner: TOKEN_PROGRAM_ID.toBase58(), decimals: 6, extensions: [], transferFeeBasisPoints: 0, scaledUiAmount: null };
      }
      if (keyStr === blockedExtMint.toBase58()) {
        throw new Error("Unsupported Token-2022 mint extensions: NonTransferable");
      }
      if (keyStr === cleanToken2022Mint.toBase58()) {
        return { programOwner: TOKEN_2022_PROGRAM_ID.toBase58(), decimals: 9, extensions: [], transferFeeBasisPoints: 0, scaledUiAmount: null };
      }
      return null;
    }) };

    try {
      const results = await auditPreStocksMarkets(mockMarkets, adapter);

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
      vi.unstubAllGlobals();
    }
  });
});
