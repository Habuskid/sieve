import { AddressLookupTableAccount, AddressLookupTableProgram, ComputeBudgetProgram, PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction, type Connection } from "@solana/web3.js";
import { JupiterBuildResponseSchema } from "./schema";
import type { JupiterBuildParams } from "./adapter";
import { messageHash } from "../security/transaction-binding";
import { verifySwapTransaction } from "../security/swap-semantics";
import { positiveRawSchema, publicKeySchema } from "../security/validation";
import { rawToDisplay } from "../../core/money/decimal";
import { SieveAppError } from "../services/errors";

export async function buildVerifiedSwap(params: JupiterBuildParams, apiBase: string, fetchOrder: (url: string) => Promise<Response>, rpc: Connection) {
  positiveRawSchema.parse(params.amount.toString());
  publicKeySchema.parse(params.taker);
  publicKeySchema.parse(params.inputMint);
  publicKeySchema.parse(params.outputMint);
  if (!params.minimumNetOutputRaw || !params.side) throw new SieveAppError("ROUTE_RISK", "Missing evaluated boundary intent");
  const url = new URL(`${apiBase}/swap/v2/build`);
  for (const [key, value] of Object.entries({ inputMint: params.inputMint, outputMint: params.outputMint, amount: params.amount.toString(), taker: params.taker, slippageBps: params.slippageBps.toString(), dexes: "Meteora DLMM", maxAccounts: "32", onlyDirectRoutes: "true", instructionVersion: "V2", blockhashSlotsToExpiry: "50" })) url.searchParams.set(key, value);
  const response = await fetchOrder(url.toString());
  if (!response.ok) throw new SieveAppError("TRANSACTION_BUILD_FAILED");
  const data = JupiterBuildResponseSchema.parse(await response.json());
  if (data.inputMint !== params.inputMint || data.outputMint !== params.outputMint || data.inAmount !== params.amount.toString() || data.slippageBps !== params.slippageBps || data.error || data.errorCode != null || data.errorMessage || data.platformFee?.amount && data.platformFee.amount !== "0" || data.feeBps || data.platformFee?.feeBps) throw new SieveAppError("ROUTE_RISK", "Structured swap differs from intent");
  if (data.cleanupInstruction || data.tipInstruction || data.otherInstructions.length) throw new SieveAppError("ROUTE_RISK", "Unexpected supplemental swap instructions");
  if (data.routePlan.length !== 1 || data.routePlan[0].swapInfo.inputMint !== params.inputMint || data.routePlan[0].swapInfo.outputMint !== params.outputMint) throw new SieveAppError("ROUTE_RISK", "Only direct verified routes are supported");
  const instruction = (ix: typeof data.swapInstruction) => new TransactionInstruction({ programId: new PublicKey(ix.programId), keys: ix.accounts.map((a) => ({ pubkey: new PublicKey(a.pubkey), isSigner: a.isSigner, isWritable: a.isWritable })), data: Buffer.from(ix.data, "base64") });
  // Ignore API-provided table CONTENTS. Resolve the actual owned account data.
  const tables: AddressLookupTableAccount[] = [];
  const tableAddresses = Object.keys(data.addressesByLookupTableAddress ?? {});
  if (tableAddresses.length > 4) throw new SieveAppError("ROUTE_RISK", "Too many lookup tables");
  for (const address of tableAddresses) {
    const key = new PublicKey(address), account = await rpc.getAccountInfo(key, "confirmed");
    if (!account?.owner.equals(AddressLookupTableProgram.programId)) throw new SieveAppError("ROUTE_RISK", "Lookup-table owner mismatch");
    const state = AddressLookupTableAccount.deserialize(account.data);
    if (state.deactivationSlot !== 18446744073709551615n) throw new SieveAppError("ROUTE_RISK", "Inactive lookup table");
    tables.push(new AddressLookupTableAccount({ key, state }));
  }
  // This is the documented custom-build path: Sieve selects the lifetime and
  // compute ceiling itself, then verifies the final compiled bytes.
  const latest = await rpc.getLatestBlockhash("confirmed");
  const transaction = new VersionedTransaction(new TransactionMessage({ payerKey: new PublicKey(params.taker), recentBlockhash: latest.blockhash, instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }), ...data.computeBudgetInstructions.map(instruction), ...data.setupInstructions.map(instruction), instruction(data.swapInstruction)] }).compileToV0Message(tables));
  const transactionBase64 = Buffer.from(transaction.serialize()).toString("base64");
  const verification = await verifySwapTransaction(transactionBase64, { wallet: params.taker, inputMint: params.inputMint, outputMint: params.outputMint, inputRaw: BigInt(params.amount), minimumNetOutputRaw: params.minimumNetOutputRaw, side: params.side }, rpc);
  const [height, validity] = await Promise.all([rpc.getBlockHeight("confirmed"), rpc.isBlockhashValid(latest.blockhash, { commitment: "confirmed" })]);
  if (!validity.value || !Number.isSafeInteger(latest.lastValidBlockHeight) || height >= latest.lastValidBlockHeight) throw new SieveAppError("TRANSACTION_EXPIRED");
  const requestId = `sieve-rpc:${messageHash(transactionBase64)}`;
  const observedAt = new Date().toISOString();
  const rawResponse = { ...data, requestId, otherAmountThreshold: verification.minimumGrossOutputRaw.toString() };
  return { transactionBase64, requestId, lastValidBlockHeight: latest.lastValidBlockHeight.toString(), otherAmountThreshold: verification.minimumGrossOutputRaw.toString(),
    signatureFeeLamports: 5000, signatureFeePayer: params.taker, prioritizationFeeLamports: verification.networkFeeLamports - 5000, prioritizationFeePayer: params.taker, rentFeeLamports: verification.maximumRentLamports, rentFeePayer: params.taker, gasless: false, feeMint: null, feeBps: 0, platformFee: null,
    verification: { ...verification, minimumGrossOutputRaw: verification.minimumGrossOutputRaw.toString(), minimumNetOutputRaw: verification.minimumNetOutputRaw.toString(), verifiedAt: observedAt, blockhash: latest.blockhash, lastValidBlockHeight: latest.lastValidBlockHeight },
    quote: { provider: "JUPITER" as const, inputMint: params.inputMint, outputMint: params.outputMint, inputRaw: BigInt(data.inAmount), outputRaw: BigInt(data.outAmount), outputDecimals: params.outputDecimals, expectedTargetAmount: rawToDisplay(BigInt(data.outAmount), params.outputDecimals).toString(), priceImpactPct: data.priceImpactPct ?? null, observedAt, expiresAt: null, routeFingerprint: requestId, providerPayloadRef: requestId }, rawResponse };
}
