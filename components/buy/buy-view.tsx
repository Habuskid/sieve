"use client";

import React, { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { VersionedTransaction } from "@solana/web3.js";
import { FundingSelector } from "./funding-selector";
import { AmountInput } from "./amount-input";
import { PriceRail } from "./price-rail";
import { StateBanner, type BannerState } from "./state-banner";
import { ReviewDialog, type BuildSummaryDto } from "../receipt/review-dialog";
import { WalletWaiting } from "../receipt/wallet-waiting";
import { TradeReceiptView } from "../receipt/trade-receipt-view";
import { TokenIcon } from "@/components/ui/token-icon";
import type { FundingAsset, TradeReceipt } from "@/core/domain/types";
import type { SellTradeReceipt } from "@/core/domain/sell-types";
import type { BuyCapacityResponseDto } from "@/server/services/buy-capacity-service";
import type { SellCapacityResponseDto } from "@/server/services/sell-capacity-service";
import type { MarketItem } from "../markets/market-row";
import { ArrowRight } from "lucide-react";
import { RefreshMark } from "@/components/ui/refresh-mark";
import { WalletButton } from "../app-shell/wallet-button";
import { walletFetch } from "@/lib/wallet-fetch";
import { cn } from "@/lib/utils";

interface BuildData {
  wallet: string;
  side: "BUY" | "SELL";
  intentVersion: number;
  buildIntentId: string;
  serializedTransaction: string;
  lastValidBlockHeight?: string;
  expiresAt: string;
  summary: BuildSummaryDto;
}

interface BuyViewProps {
  isDashboard?: boolean;
}

export function BuyView({ isDashboard = false }: BuyViewProps = {}) {
  const searchParams = useSearchParams();
  const mintFromUrl = searchParams.get("mint");

  const { publicKey, signTransaction, signMessage, connected } = useWallet();
  const { setVisible: setWalletModalVisible } = useWalletModal();

  // Mode state
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");

  // Market & input states
  const [markets, setMarkets] = useState<MarketItem[]>([]);
  const [selectedMint, setSelectedMint] = useState<string>(mintFromUrl || "");
  const [fundingAsset, setFundingAsset] = useState<FundingAsset>("USDC");
  const [amount, setAmount] = useState<string>("");
  const [userLimitPct, setUserLimitPct] = useState<number>(5.0);

  // Boundary Capacity states
  const [checking, setChecking] = useState<boolean>(false);
  const [checkResult, setCheckResult] = useState<BuyCapacityResponseDto | SellCapacityResponseDto | null>(null);
  const [selectedVerifiedCheck, setSelectedVerifiedCheck] = useState<string | null>(null);
  const [bannerState, setBannerState] = useState<BannerState>("IDLE");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Dialog & Flow States
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [isBuilding, setIsBuilding] = useState(false);
  const [isWaitingForWallet, setIsWaitingForWallet] = useState(false);
  const [buildData, setBuildData] = useState<BuildData | null>(null);
  const [receipt, setReceipt] = useState<TradeReceipt | SellTradeReceipt | null>(null);

  // Intent Versioning & Wallet Ref
  const intentVersionRef = useRef<number>(0);
  const previousWalletRef = useRef<string | null>(null);

  // Load preferences from localStorage on mount
  useEffect(() => {
    try {
      const storedLimit = localStorage.getItem("sieve_default_limit");
      const storedAsset = localStorage.getItem("sieve_default_asset");
      if (storedLimit) {
        const parsed = parseFloat(storedLimit);
        if (!isNaN(parsed)) setUserLimitPct(parsed);
      }
      if (storedAsset === "SOL" || storedAsset === "USDC") {
        setFundingAsset(storedAsset);
      }
    } catch {
      // localStorage may not be available
    }
  }, []);

  // Load markets
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/markets");
        if (res.ok) {
          const data = await res.json();
          setMarkets(data.markets || []);
          if (data.markets?.length > 0) {
            setSelectedMint((curr) => curr || data.markets[0].mint);
          }
        }
      } catch (err) {
        console.error("Failed to load markets for buy view", err);
      }
    }
    load();
  }, []);

  // Invalidate when inputs or side change
  useEffect(() => {
    intentVersionRef.current += 1;
    setCheckResult(null);
    setSelectedVerifiedCheck(null);
    setBuildData(null);
    setIsBuilding(false);
    setIsReviewOpen(false);
    setBannerState("IDLE");
    setErrorMessage(null);
  }, [selectedMint, fundingAsset, amount, userLimitPct, side]);

  // Invalidate when wallet disconnects or changes address
  const walletAddress = publicKey?.toBase58() || null;
  useEffect(() => {
    if (walletAddress !== previousWalletRef.current) {
      previousWalletRef.current = walletAddress;
      intentVersionRef.current += 1;
      setCheckResult(null);
      setSelectedVerifiedCheck(null);
      setBuildData(null);
      setIsBuilding(false);
      setIsReviewOpen(false);
      setBannerState("IDLE");
      setErrorMessage(null);
    }
  }, [walletAddress]);

  const selectedMarket = markets.find((m) => m.mint === selectedMint) || markets[0];
  const selectedMarketDisplayName = selectedMarket
    ? selectedMarket.name
    : "Choose an asset";
  const parsedReference = selectedMarket
    ? Number.parseFloat(selectedMarket.referencePriceUsd)
    : Number.NaN;
  const refPrice = Number.isFinite(parsedReference) ? parsedReference : null;

  // Derive boundary & route prices from server response (zero client financial calculation)
  const boundaryPriceUsd = checkResult
    ? side === "SELL"
      ? (checkResult as SellCapacityResponseDto).minimumSellPriceUsd
        ? Number((checkResult as SellCapacityResponseDto).minimumSellPriceUsd)
        : null
      : (checkResult as BuyCapacityResponseDto).maximumBuyPriceUsd
        ? Number((checkResult as BuyCapacityResponseDto).maximumBuyPriceUsd)
        : null
    : null;

  const currentPriceUsd = checkResult?.verifiedCapacity
    ? side === "SELL"
      ? (checkResult as SellCapacityResponseDto).verifiedCapacity?.effectiveSellPriceUsd
        ? Number((checkResult as SellCapacityResponseDto).verifiedCapacity?.effectiveSellPriceUsd)
        : null
      : (checkResult as BuyCapacityResponseDto).verifiedCapacity?.effectiveBuyPriceUsd
        ? Number((checkResult as BuyCapacityResponseDto).verifiedCapacity?.effectiveBuyPriceUsd)
        : null
    : null;

  // Execute Boundary Capacity Check
  const handleCheckBoundary = async () => {
    const currentWallet = publicKey?.toBase58();
    if (!connected || !currentWallet) {
      setWalletModalVisible(true);
      return;
    }

    if (!selectedMint || !amount || parseFloat(amount) <= 0) {
      setErrorMessage(side === "BUY" ? "Please enter a valid amount to spend" : "Please enter a valid amount to sell");
      return;
    }

    const currentVersion = `v${++intentVersionRef.current}`;
    setChecking(true);
    setBannerState("CHECKING");
    setErrorMessage(null);
    setCheckResult(null);
    setSelectedVerifiedCheck(null);
    setBuildData(null);

    try {
      const endpoint = side === "BUY" ? "/api/capacity/buy" : "/api/capacity/sell";
      const payload =
        side === "BUY"
          ? {
              targetMint: selectedMint,
              fundingAsset,
              amount,
              maxPremiumPct: userLimitPct.toString(),
              wallet: currentWallet,
              clientIntentVersion: currentVersion,
            }
          : {
              targetMint: selectedMint,
              amount,
              maxDiscountPct: userLimitPct.toString(),
              wallet: currentWallet,
              clientIntentVersion: currentVersion,
            };

      const res = await walletFetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }, currentWallet, signMessage);

      const data = await res.json();

      // Discard stale responses if user changed inputs while in flight
      if (currentVersion !== `v${intentVersionRef.current}`) {
        return;
      }

      if (!res.ok) {
        setBannerState("ERROR");
        setErrorMessage(data.error?.message || "Failed to check boundary capacity");
        return;
      }

      setCheckResult(data);

      if (data.status === "FULLY_WITHIN_BOUNDARY") {
        setBannerState("GOOD_TO_GO");
        setSelectedVerifiedCheck(data.checkId);
      } else if (data.status === "PARTIALLY_WITHIN_BOUNDARY") {
        setBannerState("GOOD_TO_GO");
        setSelectedVerifiedCheck(null); // User must explicitly choose to use boundary amount
      } else if (data.status === "NO_VERIFIED_CAPACITY") {
        setBannerState("PRICE_TOO_HIGH");
        setSelectedVerifiedCheck(null);
      } else {
        setBannerState("ERROR");
        setSelectedVerifiedCheck(null);
      }
    } catch (err) {
      if (currentVersion !== `v${intentVersionRef.current}`) return;
      setBannerState("ERROR");
      setErrorMessage(err instanceof Error ? err.message : "Boundary check failed");
    } finally {
      if (currentVersion === `v${intentVersionRef.current}`) {
        setChecking(false);
      }
    }
  };

  // Prepare Transaction with fresh server revalidation
  const handlePrepareTransaction = async () => {
    const checkIdToBuild = selectedVerifiedCheck || checkResult?.checkId;
    if (!checkIdToBuild) return;

    const currentWallet = publicKey?.toBase58();
    if (!currentWallet) {
      setWalletModalVisible(true);
      return;
    }

    const buildVersion = intentVersionRef.current;
    setIsBuilding(true);
    setErrorMessage(null);

    try {
      const buildEndpoint = side === "SELL" ? "/api/sell/build" : "/api/build";
      const buildRes = await walletFetch(buildEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checkId: checkIdToBuild,
          wallet: currentWallet,
        }),
      }, currentWallet, signMessage);

      const data = await buildRes.json();
      if (buildVersion !== intentVersionRef.current || previousWalletRef.current !== currentWallet) return;
      setIsBuilding(false);

      if (!buildRes.ok || data.status === "BLOCKED") {
        setIsReviewOpen(false);
        if (data.status === "BLOCKED") {
          setBannerState("PRICE_TOO_HIGH");
          setErrorMessage(
            data.reason === "PRICE_MOVED"
              ? "Boundary changed. Check again."
              : "Execution conditions moved outside your boundary before transaction construction."
          );
        } else {
          setBannerState("ERROR");
          setErrorMessage(data.error?.message || "Failed to prepare transaction");
        }
        return;
      }

      setBuildData({ ...data, wallet: currentWallet, side, intentVersion: buildVersion });
      setIsReviewOpen(true);
    } catch (err) {
      setIsBuilding(false);
      setIsReviewOpen(false);
      setBannerState("ERROR");
      setErrorMessage(err instanceof Error ? err.message : "Failed to prepare transaction");
    }
  };

  // Confirm in Wallet -> Sign & Execute
  const handleConfirmInWallet = async () => {
    if (!buildData) return;
    const currentWallet = publicKey?.toBase58();
    if (!currentWallet) {
      setWalletModalVisible(true);
      return;
    }

    setIsReviewOpen(false);
    setIsWaitingForWallet(true);

    try {
      if (buildData.wallet !== currentWallet || buildData.side !== side || buildData.intentVersion !== intentVersionRef.current || Date.parse(buildData.expiresAt) <= Date.now()) throw new Error("Prepared transaction expired or wallet/intent changed. Check again.");
      let signedTxBase64: string | undefined;
      if (signTransaction) {
        const txBuffer = Buffer.from(buildData.serializedTransaction, "base64");
        const transaction = VersionedTransaction.deserialize(txBuffer);
        const reviewedMessage = Buffer.from(transaction.message.serialize());
        const signedTx = await signTransaction(transaction);
        if (buildData.intentVersion !== intentVersionRef.current || previousWalletRef.current !== currentWallet || Date.parse(buildData.expiresAt) <= Date.now()) throw new Error("Wallet or intent changed while signing. Transaction was not submitted by Sieve.");
        if (!Buffer.from(signedTx.message.serialize()).equals(reviewedMessage)) throw new Error("Wallet changed transaction message.");
        signedTxBase64 = Buffer.from(signedTx.serialize()).toString("base64");
      } else {
        throw new Error("Wallet does not support transaction signing");
      }

      const confirmEndpoint = side === "SELL" ? "/api/sell/confirm" : "/api/confirm";
      const confirmRes = await walletFetch(confirmEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buildIntentId: buildData.buildIntentId,
          signedTransaction: signedTxBase64,
          wallet: currentWallet,
        }),
      }, currentWallet, signMessage);

      const confirmData = await confirmRes.json();
      setIsWaitingForWallet(false);

      if (confirmData.status === "CONFIRMED" && confirmData.receipt) {
        setReceipt(confirmData.receipt);
      } else if (confirmData.status === "PENDING") {
        setBannerState("ERROR");
        setErrorMessage("Transaction submitted; confirmation is pending. Check its signature on Solscan before creating another trade.");
      } else {
        setBannerState("ERROR");
        setErrorMessage(confirmData.error?.message || "Transaction could not be confirmed");
      }
    } catch (err) {
      setIsWaitingForWallet(false);
      const message = err instanceof Error ? err.message : "Wallet rejected transaction";
      setBannerState("ERROR");
      setErrorMessage(message.includes("User rejected") ? "You cancelled the transaction in your wallet." : message);
    }
  };

  // If receipt is active, show the completed receipt view
  if (receipt) {
    return (
      <div className={cn("mx-auto py-8", isDashboard ? "max-w-4xl px-4 sm:px-6" : "max-w-7xl px-4 sm:px-6 lg:px-8")}>
        <TradeReceiptView
          receipt={receipt}
          onDone={() => {
            setReceipt(null);
            setCheckResult(null);
            setSelectedVerifiedCheck(null);
            setBuildData(null);
            setBannerState("IDLE");
          }}
        />
      </div>
    );
  }

  // Gate disconnected dashboard: show only the connection gate, no interactive execution form underneath
  if (isDashboard && (!connected || !publicKey)) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="mx-auto max-w-lg rounded-panel border border-borderBase bg-surface p-8 text-center shadow-xs sm:p-10 space-y-6">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sieveBlue font-mono">
              Dashboard
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-primaryText sm:text-3xl">
              Connect wallet to continue
            </h1>
            <p className="text-xs sm:text-sm text-secondaryText leading-relaxed">
              Connect your wallet to check and enforce your execution boundary.
            </p>
          </div>

          <div className="pt-2 flex justify-center">
            <WalletButton />
          </div>
        </div>
      </div>
    );
  }

  const showAuxiliaryState = !["IDLE", "GOOD_TO_GO", "PRICE_TOO_HIGH"].includes(bannerState);

  return (
    <div
      className={cn(
        "mx-auto",
        isDashboard
          ? "max-w-4xl px-4 py-8 sm:px-6 sm:py-10"
          : "max-w-7xl px-5 py-7 sm:px-8 sm:py-10 lg:px-10 lg:py-12"
      )}
    >
      {/* Header */}
      {isDashboard ? (
        <div>
          <div className="flex flex-col gap-4 border-b border-borderBase pb-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sieveBlue">
                Dashboard
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-primaryText sm:text-3xl">
                Execution
              </h1>
              <p className="mt-1 text-xs text-secondaryText sm:text-sm">
                Configure trade side, asset, amount, and execution boundary. Sieve verifies route capacity before transaction preparation.
              </p>
            </div>

            {/* Segmented Buy / Sell Control */}
            <div
              className="flex items-center gap-1 rounded-panel border border-borderBase bg-surface p-1 shadow-xs"
              role="tablist"
              aria-label="Trade Side"
            >
              <button
                type="button"
                role="tab"
                aria-selected={side === "BUY"}
                onClick={() => setSide("BUY")}
                className={`min-h-9 rounded px-4 text-xs font-bold transition-colors ${
                  side === "BUY"
                    ? "bg-sieveBlue text-slate-950 shadow-xs"
                    : "text-secondaryText hover:text-primaryText"
                }`}
              >
                Buy
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={side === "SELL"}
                onClick={() => setSide("SELL")}
                className={`min-h-9 rounded px-4 text-xs font-bold transition-colors ${
                  side === "SELL"
                    ? "bg-sieveBlue text-slate-950 shadow-xs"
                    : "text-secondaryText hover:text-primaryText"
                }`}
              >
                Sell
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-6 border-b border-borderBase pb-7 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-mutedText">
              {side === "BUY" ? "Buy PreStocks" : "Sell PreStocks"}
            </p>
            <h1 className="mt-2 text-balance text-4xl font-semibold leading-tight text-primaryText sm:text-5xl">
              {selectedMarketDisplayName}
            </h1>
            <p className="mt-3 max-w-2xl text-pretty text-sm leading-6 text-secondaryText sm:text-base">
              Set your amount and limit. Sieve checks the executable route before any transaction is prepared.
            </p>

            {/* Side Toggle */}
            <div className="mt-4 flex items-center gap-2" role="tablist" aria-label="Trade Side">
              <button
                type="button"
                role="tab"
                aria-selected={side === "BUY"}
                onClick={() => setSide("BUY")}
                className={`rounded-btn px-4 py-2 text-xs font-bold transition-colors ${
                  side === "BUY"
                    ? "bg-sieveBlue text-slate-950"
                    : "border border-borderBase text-secondaryText hover:text-primaryText hover:bg-surface-subtle"
                }`}
              >
                BUY
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={side === "SELL"}
                onClick={() => setSide("SELL")}
                className={`rounded-btn px-4 py-2 text-xs font-bold transition-colors ${
                  side === "SELL"
                    ? "bg-sieveBlue text-slate-950"
                    : "border border-borderBase text-secondaryText hover:text-primaryText hover:bg-surface-subtle"
                }`}
              >
                SELL
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Order Inputs */}
      <section className="py-8 sm:py-10" aria-labelledby="order-heading">
        <div className="mb-6 flex items-center justify-between gap-4">
          <h2 id="order-heading" className="text-lg font-medium text-primaryText">Order</h2>
          <span className="text-xs uppercase tracking-[0.12em] text-mutedText">
            {side === "BUY" ? `${fundingAsset} funding` : "USDC output"}
          </span>
        </div>

        <div className={cn("grid gap-7", isDashboard ? "sm:grid-cols-2 lg:grid-cols-3 sm:gap-6" : "lg:grid-cols-3 lg:gap-10")}>
          {/* Asset Dropdown */}
          <div>
            <label htmlFor="target-asset" className="mb-2 block text-sm font-medium text-secondaryText">
              {isDashboard ? "PreStock" : "Asset"}
            </label>
            <select
              id="target-asset"
              value={selectedMint}
              onChange={(event) => setSelectedMint(event.target.value)}
              className="min-h-14 w-full border-0 border-b border-borderStrong bg-transparent px-0 py-3 text-base font-medium text-primaryText focus:border-sieveBlue focus:outline-none focus:ring-0"
            >
              {markets.map((market) => (
                <option key={market.mint} value={market.mint} className="bg-surface text-primaryText">
                  {market.name} ({market.symbol})
                </option>
              ))}
            </select>
          </div>

          {/* Amount Input */}
          <AmountInput
            value={amount}
            onChange={setAmount}
            asset={side === "BUY" ? fundingAsset : (selectedMarket?.symbol || "PreStock")}
            side={side}
            helperText={side === "BUY" ? "Amount to spend" : "Amount to sell"}
            error={errorMessage}
          />

          {/* Funding Selector (Buy) or Fixed USDC (Sell) */}
          {side === "BUY" ? (
            <FundingSelector selected={fundingAsset} onChange={setFundingAsset} />
          ) : (
            <div>
              <label className="mb-2 block text-sm font-medium text-secondaryText">
                Receive
              </label>
              <div className="flex min-h-14 items-center justify-between border-0 border-b border-borderStrong py-3">
                <span className="text-base font-medium text-primaryText">USDC (Fixed)</span>
                <TokenIcon asset="USDC" size={20} />
              </div>
              <p className="mt-2 text-xs text-mutedText">Sell proceeds are always paid in USDC.</p>
            </div>
          )}
        </div>
      </section>

      {/* Execution Boundary Section */}
      <section className="border-t border-borderBase py-8 sm:py-10" aria-label="Execution boundary">
        <PriceRail
          side={side}
          referencePriceUsd={refPrice}
          boundaryPriceUsd={boundaryPriceUsd}
          currentPriceUsd={currentPriceUsd}
          userLimitPct={userLimitPct}
          onLimitChange={setUserLimitPct}
        />

        {showAuxiliaryState && (
          <div className="mt-7">
            <StateBanner
              state={bannerState}
              title={checkResult?.display.title}
              message={checkResult?.display.message}
              onRefresh={handleCheckBoundary}
            />
          </div>
        )}

        {/* Boundary Capacity Result Region */}
        {checkResult && (
          <div className="mt-7" data-testid="boundary-capacity-result">
            {checkResult.status === "FULLY_WITHIN_BOUNDARY" && (
              <div className="p-4 rounded-[6px] text-xs font-mono space-y-2 bg-sky-500/[0.04] border border-sky-500/25 text-primaryText">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-sieveBlue">
                    Within boundary
                  </span>
                  <span className="text-secondaryText">Boundary Capacity Verified</span>
                </div>
                <p className="text-secondaryText">
                  {side === "BUY"
                    ? `The requested ${checkResult.requestedAmount} ${(checkResult as BuyCapacityResponseDto).fundingAsset} is fully verified within your execution boundary.`
                    : `The requested ${checkResult.requestedAmount} ${checkResult.asset.symbol} is fully verified within your execution boundary.`}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2 text-[11px] border-t border-sky-500/15">
                  <div>
                    <span className="text-mutedText block">Verified Amount</span>
                    <span className="font-bold">
                      {side === "BUY"
                        ? `${(checkResult as BuyCapacityResponseDto).verifiedCapacity?.fundingAmount} ${(checkResult as BuyCapacityResponseDto).fundingAsset}`
                        : `${(checkResult as SellCapacityResponseDto).verifiedCapacity?.economicAmount} ${checkResult.asset.symbol}`}
                    </span>
                  </div>
                  <div>
                    <span className="text-mutedText block">Effective Price</span>
                    <span className="font-bold">
                      ${side === "BUY"
                        ? (checkResult as BuyCapacityResponseDto).verifiedCapacity?.effectiveBuyPriceUsd
                        : (checkResult as SellCapacityResponseDto).verifiedCapacity?.effectiveSellPriceUsd}
                    </span>
                  </div>
                  <div>
                    <span className="text-mutedText block">Expected Output</span>
                    <span className="font-bold">
                      {side === "BUY"
                        ? `${(checkResult as BuyCapacityResponseDto).verifiedCapacity?.expectedTargetAmount} ${checkResult.asset.symbol}`
                        : `${(checkResult as SellCapacityResponseDto).verifiedCapacity?.expectedUsdcProceeds} USDC`}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {checkResult.status === "PARTIALLY_WITHIN_BOUNDARY" && (
              <div
                className={cn(
                  "p-4 rounded-[6px] text-xs font-mono space-y-3",
                  isDashboard
                    ? "bg-amber-500/[0.04] border border-amber-500/25 text-primaryText"
                    : "bg-sieveAmber-soft border border-amber-300 text-primaryText"
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-amber-900 text-sm">Partial capacity</span>
                  <span className="text-amber-800">Boundary Capacity</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                  <div>
                    <span className="text-amber-900/70 block">Requested Amount</span>
                    <span className="font-bold text-amber-950">
                      {side === "BUY"
                        ? `${checkResult.requestedAmount} ${(checkResult as BuyCapacityResponseDto).fundingAsset}`
                        : `${checkResult.requestedAmount} ${checkResult.asset.symbol}`}
                    </span>
                  </div>
                  <div>
                    <span className="text-amber-900/70 block">Boundary Capacity</span>
                    <span className="font-bold text-amber-950">
                      {side === "BUY"
                        ? `${(checkResult as BuyCapacityResponseDto).verifiedCapacity?.fundingAmount} ${(checkResult as BuyCapacityResponseDto).fundingAsset}`
                        : `${(checkResult as SellCapacityResponseDto).verifiedCapacity?.economicAmount} ${checkResult.asset.symbol}`}
                    </span>
                  </div>
                </div>
                <p className="text-amber-950 font-medium">
                  {side === "BUY"
                    ? `${(checkResult as BuyCapacityResponseDto).verifiedCapacity?.fundingAmount} ${(checkResult as BuyCapacityResponseDto).fundingAsset} of the requested ${checkResult.requestedAmount} ${(checkResult as BuyCapacityResponseDto).fundingAsset} is currently verified within your configured boundary.`
                    : `${(checkResult as SellCapacityResponseDto).verifiedCapacity?.economicAmount} ${checkResult.asset.symbol} of the requested ${checkResult.requestedAmount} ${checkResult.asset.symbol} is currently verified within your configured boundary.`}
                </p>
                <div className="flex items-center justify-between pt-2 border-t border-amber-200">
                  {selectedVerifiedCheck ? (
                    <span className="font-bold text-sieveBlue">
                      Using verified amount: {side === "BUY"
                        ? `${(checkResult as BuyCapacityResponseDto).verifiedCapacity?.fundingAmount} ${(checkResult as BuyCapacityResponseDto).fundingAsset}`
                        : `${(checkResult as SellCapacityResponseDto).verifiedCapacity?.economicAmount} ${checkResult.asset.symbol}`}
                    </span>
                  ) : (
                    <span className="text-amber-800 text-[11px]">
                      Select &quot;Use boundary amount&quot; below to proceed with the verified capacity.
                    </span>
                  )}
                </div>
              </div>
            )}

            {checkResult.status === "NO_VERIFIED_CAPACITY" && (
              <div
                className={cn(
                  "p-4 rounded-[6px] text-xs font-mono space-y-2",
                  isDashboard
                    ? "bg-surface-subtle border border-borderStrong text-primaryText"
                    : "bg-sieveRed-soft border border-rose-300 text-primaryText"
                )}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      "font-bold text-sm",
                      isDashboard ? "text-secondaryText" : "text-sieveRed"
                    )}
                  >
                    No verified capacity
                  </span>
                </div>
                <p
                  className={cn(
                    "font-medium",
                    isDashboard ? "text-secondaryText" : "text-sieveRed"
                  )}
                >
                  No verified capacity within this boundary.
                </p>
                <p className="text-secondaryText">
                  No executable capacity was verified within your configured boundary. You may adjust your boundary or check again.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Action Controls */}
        <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center sm:justify-end gap-3 border-t border-borderBase pt-6">
          {!connected || !publicKey ? (
            <button
              type="button"
              onClick={() => setWalletModalVisible(true)}
              className="sieve-control-primary min-h-11 px-6 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sieveBlue"
            >
              Connect wallet to check boundary
            </button>
          ) : checking ? (
            <button
              type="button"
              disabled
              className="sieve-control-primary min-h-11 px-6 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sieveBlue opacity-60"
            >
              <RefreshMark loading />
              <span>Checking boundary…</span>
            </button>
          ) : !checkResult ? (
            <button
              type="button"
              onClick={handleCheckBoundary}
              className="sieve-control-primary min-h-11 px-6 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sieveBlue"
            >
              Check boundary
            </button>
          ) : checkResult.status === "FULLY_WITHIN_BOUNDARY" ? (
            <button
              type="button"
              onClick={handlePrepareTransaction}
              disabled={isBuilding}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-btn bg-sieveBlue px-6 py-3 text-sm font-semibold text-slate-950 transition-colors duration-150 hover:bg-sieveBlue-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sieveBlue"
            >
              {isBuilding ? <span>Preparing transaction…</span> : <span>Prepare transaction</span>}
              <ArrowRight className="size-4" aria-hidden="true" />
            </button>
          ) : checkResult.status === "PARTIALLY_WITHIN_BOUNDARY" ? (
            !selectedVerifiedCheck ? (
              <button
                type="button"
                onClick={() => setSelectedVerifiedCheck(checkResult.checkId)}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-btn bg-amber-800 px-6 py-3 text-sm font-semibold text-white transition-colors duration-150 hover:bg-amber-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-800"
              >
                Use boundary amount
              </button>
            ) : (
              <button
                type="button"
                onClick={handlePrepareTransaction}
                disabled={isBuilding}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-btn bg-sieveBlue px-6 py-3 text-sm font-semibold text-slate-950 transition-colors duration-150 hover:bg-sieveBlue-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sieveBlue"
              >
                {isBuilding ? <span>Preparing transaction…</span> : <span>Prepare transaction</span>}
                <ArrowRight className="size-4" aria-hidden="true" />
              </button>
            )
          ) : (
            <button
              type="button"
              onClick={handleCheckBoundary}
              className="sieve-control-primary min-h-11 px-6 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sieveBlue"
            >
              Check again
            </button>
          )}
        </div>
      </section>

      {/* Review Dialog */}
      {checkResult && (
        <ReviewDialog
          isOpen={isReviewOpen}
          onClose={() => {
            setIsReviewOpen(false);
            setBuildData(null);
          }}
          check={checkResult}
          side={side}
          wallet={publicKey?.toBase58()}
          buildSummary={buildData?.summary}
          expiresAt={buildData?.expiresAt}
          isBuilding={isBuilding}
          onPrepareTransaction={handlePrepareTransaction}
          onConfirmInWallet={handleConfirmInWallet}
        />
      )}

      {/* Wallet Signing Waiting Overlay */}
      {isWaitingForWallet && (
        <WalletWaiting onCancel={() => setIsWaitingForWallet(false)} />
      )}
    </div>
  );
}
