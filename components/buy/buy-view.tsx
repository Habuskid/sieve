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
import type { NetworkMode, FundingAsset, TradeReceipt } from "@/core/domain/types";
import type { CheckResponseDto } from "@/server/services/check-service";
import type { MarketItem } from "../markets/market-row";
import { ArrowRight, RefreshCw } from "lucide-react";

interface BuildData {
  buildIntentId: string;
  serializedTransaction: string;
  lastValidBlockHeight?: string;
  expiresAt: string;
  summary: BuildSummaryDto;
}

interface BuyViewProps {
  network: NetworkMode;
}

export function BuyView({ network }: BuyViewProps) {
  const searchParams = useSearchParams();
  const mintFromUrl = searchParams.get("mint");

  const { publicKey, signTransaction, connected } = useWallet();
  const { setVisible: setWalletModalVisible } = useWalletModal();

  // State
  const [markets, setMarkets] = useState<MarketItem[]>([]);
  const [selectedMint, setSelectedMint] = useState<string>(mintFromUrl || "");
  const [fundingAsset, setFundingAsset] = useState<FundingAsset>("USDC");
  const [amount, setAmount] = useState<string>("100");
  const [userLimitPct, setUserLimitPct] = useState<number>(5.0);

  const [checking, setChecking] = useState<boolean>(false);
  const [checkResult, setCheckResult] = useState<CheckResponseDto | null>(null);
  const [bannerState, setBannerState] = useState<BannerState>("IDLE");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Dialog & Flow States
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [isBuilding, setIsBuilding] = useState(false);
  const [isWaitingForWallet, setIsWaitingForWallet] = useState(false);
  const [buildData, setBuildData] = useState<BuildData | null>(null);
  const [receipt, setReceipt] = useState<TradeReceipt | null>(null);

  // Intent Versioning to discard stale async responses
  const intentVersionRef = useRef<number>(0);

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
        const res = await fetch(`/api/markets?network=${network}`);
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
  }, [network]);

  // Reset check when inputs change and bump intent version
  useEffect(() => {
    intentVersionRef.current += 1;
    setCheckResult(null);
    setBannerState("IDLE");
    setErrorMessage(null);
  }, [selectedMint, fundingAsset, amount, userLimitPct, network]);

  const selectedMarket = markets.find((m) => m.mint === selectedMint) || markets[0];
  const refPrice = selectedMarket ? parseFloat(selectedMarket.referencePriceUsd) : 100;
  const currentBuyPrice = checkResult?.price.currentBuyUsd
    ? parseFloat(checkResult.price.currentBuyUsd)
    : selectedMarket?.sourceTokenPriceUsd
    ? parseFloat(selectedMarket.sourceTokenPriceUsd)
    : null;

  // Execute Price Check
  const handleCheckPrice = async () => {
    if (!selectedMint || !amount || parseFloat(amount) <= 0) {
      setErrorMessage("Please enter a valid amount to spend");
      return;
    }

    const currentVersion = `v${++intentVersionRef.current}`;
    setChecking(true);
    setBannerState("CHECKING");
    setErrorMessage(null);

    try {
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          network,
          targetMint: selectedMint,
          fundingAsset,
          amount,
          maxPremiumPct: userLimitPct.toString(),
          wallet: publicKey?.toBase58() || null,
          clientIntentVersion: currentVersion,
        }),
      });

      const data = await res.json();

      // Discard stale responses if user changed inputs while in flight
      if (currentVersion !== `v${intentVersionRef.current}`) {
        return;
      }

      if (!res.ok) {
        setBannerState("ERROR");
        setErrorMessage(data.error?.message || "Failed to check price");
        return;
      }

      setCheckResult(data);

      if (data.decision === "GOOD_TO_GO") {
        setBannerState("GOOD_TO_GO");
      } else if (data.decision === "PRICE_TOO_HIGH") {
        setBannerState("PRICE_TOO_HIGH");
      } else if (data.decision === "STALE_DATA") {
        setBannerState("STALE_DATA");
      } else if (data.decision === "NO_ROUTE") {
        setBannerState("NO_ROUTE");
      } else {
        setBannerState("ERROR");
      }
    } catch (err) {
      if (currentVersion !== `v${intentVersionRef.current}`) return;
      setBannerState("ERROR");
      setErrorMessage(err instanceof Error ? err.message : "Price check failed");
    } finally {
      if (currentVersion === `v${intentVersionRef.current}`) {
        setChecking(false);
      }
    }
  };

  // Start Buy / Open Review
  const handleStartReview = () => {
    if (!connected && network === "mainnet") {
      setWalletModalVisible(true);
      return;
    }
    setBuildData(null);
    setIsReviewOpen(true);
  };

  // Mainnet Step 1: Prepare Transaction & Fresh Revalidation
  const handlePrepareTransaction = async () => {
    if (!checkResult) return;
    const walletAddress = publicKey?.toBase58();
    if (!walletAddress) {
      setWalletModalVisible(true);
      return;
    }

    setIsBuilding(true);
    try {
      const buildRes = await fetch("/api/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checkId: checkResult.checkId,
          wallet: walletAddress,
        }),
      });

      const data = await buildRes.json();
      setIsBuilding(false);

      if (!buildRes.ok || data.status === "BLOCKED") {
        setIsReviewOpen(false);
        if (data.status === "BLOCKED") {
          setBannerState("PRICE_TOO_HIGH");
          setErrorMessage("The price moved above your limit before transaction construction.");
          if (data.refreshedCheck) {
            setCheckResult(data.refreshedCheck);
          }
        } else {
          setBannerState("ERROR");
          setErrorMessage(data.error?.message || "Failed to prepare transaction");
        }
        return;
      }

      setBuildData(data);
    } catch (err) {
      setIsBuilding(false);
      setIsReviewOpen(false);
      setBannerState("ERROR");
      setErrorMessage(err instanceof Error ? err.message : "Failed to prepare transaction");
    }
  };

  // Mainnet Step 2: Confirm in Wallet -> Sign & Execute
  const handleConfirmInWallet = async () => {
    if (!checkResult || !buildData) return;
    const walletAddress = publicKey?.toBase58();
    if (!walletAddress) {
      setWalletModalVisible(true);
      return;
    }

    setIsReviewOpen(false);
    setIsWaitingForWallet(true);

    try {
      let signedTxBase64: string | undefined;
      if (signTransaction) {
        const txBuffer = Buffer.from(buildData.serializedTransaction, "base64");
        const transaction = VersionedTransaction.deserialize(txBuffer);
        const signedTx = await signTransaction(transaction);
        signedTxBase64 = Buffer.from(signedTx.serialize()).toString("base64");
      } else {
        throw new Error("Wallet does not support transaction signing");
      }

      const confirmRes = await fetch("/api/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buildIntentId: buildData.buildIntentId,
          signedTransaction: signedTxBase64,
          wallet: walletAddress,
          network: "mainnet",
        }),
      });

      const confirmData = await confirmRes.json();
      setIsWaitingForWallet(false);

      if (confirmData.status === "CONFIRMED" && confirmData.receipt) {
        setReceipt(confirmData.receipt);
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

  // Practice Mode: Direct Simulated Execution (Never calls signTransaction or WalletWaiting)
  const handleConfirmPractice = async () => {
    if (!checkResult) return;
    setIsBuilding(true);

    try {
      const walletAddress = publicKey?.toBase58() || "PracticeWallet1111111111111111111111111111";

      // 1. Build practice intent
      const buildRes = await fetch("/api/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checkId: checkResult.checkId,
          wallet: walletAddress,
        }),
      });

      const data = await buildRes.json();
      if (!buildRes.ok || data.status === "BLOCKED") {
        setIsReviewOpen(false);
        setIsBuilding(false);
        if (data.status === "BLOCKED") {
          setBannerState("PRICE_TOO_HIGH");
          setErrorMessage("The price moved above your limit before transaction construction.");
          if (data.refreshedCheck) {
            setCheckResult(data.refreshedCheck);
          }
        } else {
          setBannerState("ERROR");
          setErrorMessage(data.error?.message || "Practice execution failed");
        }
        return;
      }

      // 2. Simulated confirmation (never prompts wallet)
      const mockSig = `sim-practice-tx-${Date.now()}-${Math.random().toString(36).slice(2, 10).padEnd(8, "0")}`;
      const confirmRes = await fetch("/api/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buildIntentId: data.buildIntentId,
          signature: mockSig,
          wallet: walletAddress,
          network: "testnet",
        }),
      });

      const confirmData = await confirmRes.json();
      setIsBuilding(false);
      setIsReviewOpen(false);

      if (confirmData.status === "CONFIRMED" && confirmData.receipt) {
        setReceipt(confirmData.receipt);
      } else {
        setBannerState("ERROR");
        setErrorMessage(confirmData.error?.message || "Practice trade failed");
      }
    } catch (err) {
      setIsBuilding(false);
      setIsReviewOpen(false);
      setBannerState("ERROR");
      setErrorMessage(err instanceof Error ? err.message : "Practice trade failed");
    }
  };

  // If receipt is active, show the completed view
  if (receipt) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <TradeReceiptView
          receipt={receipt}
          onDone={() => {
            setReceipt(null);
            setCheckResult(null);
            setBannerState("IDLE");
          }}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1240px] px-4 sm:px-6 lg:px-8 py-6">
      {/* Environment Notice for Practice Mode */}
      {network === "testnet" && (
        <div className="mb-4 rounded-[4px] border border-amber-300 bg-sieveAmber-soft px-3.5 py-1.5 text-xs text-amber-900 flex items-center justify-between">
          <span className="font-mono text-[11px] font-semibold tracking-wider">
            Practice mode — Test data / Simulated transaction
          </span>
          <span className="text-[11px] text-amber-800 hidden sm:inline">
            Zero real funds or wallet signatures required.
          </span>
        </div>
      )}

      {/* Page Title Toolbar */}
      <div className="flex items-center justify-between pb-3 mb-6 border-b border-borderBase">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-primaryText">
            Execution Workstation — {selectedMarket ? selectedMarket.name : "Asset"}
          </h1>
          <p className="text-xs text-secondaryText mt-0.5">
            Configure order parameters on the left. Sieve validates the live Solana execution route on the right.
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-2 font-mono text-xs text-secondaryText">
          <span>STATUS:</span>
          <span className="font-bold text-primaryText uppercase">{bannerState}</span>
        </div>
      </div>

      {/* Split Workstation Layout: 42% Left (Config) / 58% Right (Protection Rail) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Order Configuration (5 of 12 cols = ~42%) */}
        <div className="lg:col-span-5 rounded-panel bg-surface border border-borderBase p-5 sm:p-6 shadow-xs space-y-5">
          <div className="pb-3 border-b border-borderBase">
            <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-secondaryText">
              ORDER CONFIGURATION
            </span>
          </div>

          {/* Asset Selector */}
          <div>
            <label className="block text-[11px] font-mono uppercase tracking-wider text-secondaryText mb-1.5">
              Asset
            </label>
            <select
              value={selectedMint}
              onChange={(e) => setSelectedMint(e.target.value)}
              className="w-full rounded-btn bg-surface border border-borderBase px-3 py-2 text-xs font-semibold text-primaryText shadow-2xs focus:outline-none focus:ring-1 focus:ring-primaryText min-h-[40px]"
            >
              {markets.map((m) => (
                <option key={m.mint} value={m.mint}>
                  {m.name} ({m.symbol}) — Ref: ${parseFloat(m.referencePriceUsd).toFixed(2)}
                </option>
              ))}
            </select>
          </div>

          {/* Funding Asset */}
          <FundingSelector
            selected={fundingAsset}
            onChange={setFundingAsset}
            disabled={false}
          />

          {/* Amount */}
          <AmountInput
            value={amount}
            onChange={setAmount}
            asset={fundingAsset}
            disabled={false}
            error={errorMessage}
          />

          {/* Action Trigger in Configuration Surface */}
          <div className="pt-2 border-t border-borderBase space-y-2">
            {bannerState === "GOOD_TO_GO" && checkResult ? (
              <button
                type="button"
                onClick={handleStartReview}
                className="flex w-full items-center justify-center gap-2 rounded-btn bg-sieveBlue py-3 px-5 text-xs font-bold text-white hover:bg-sieveBlue-hover transition-colors shadow-xs min-h-[44px]"
              >
                <span>Review buy</span>
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleCheckPrice}
                disabled={checking}
                className="flex w-full items-center justify-center gap-2 rounded-btn bg-primaryText py-3 px-5 text-xs font-bold text-white hover:bg-primaryText/90 transition-colors shadow-xs min-h-[44px] disabled:opacity-50"
              >
                {checking ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    <span>Checking today&apos;s price...</span>
                  </>
                ) : (
                  <span>Check today&apos;s price</span>
                )}
              </button>
            )}
            <p className="text-center text-[11px] text-mutedText">
              Zero transaction signing on this step.
            </p>
          </div>
        </div>

        {/* RIGHT COLUMN: Sieve Protection / Signature Panel (7 of 12 cols = ~58%) */}
        <div className="lg:col-span-7 space-y-5">
          {/* Dominant Numerical Hierarchy */}
          <div className="grid grid-cols-3 gap-3">
            {/* Reference */}
            <div className="p-3.5 rounded-panel border border-borderBase bg-surface shadow-2xs">
              <span className="text-[10px] font-mono uppercase tracking-wider text-secondaryText block mb-1">
                REFERENCE
              </span>
              <span className="text-base sm:text-lg font-bold font-mono text-primaryText tabular-nums block">
                {checkResult?.price.referenceUsd
                  ? `$${checkResult.price.referenceUsd}`
                  : selectedMarket
                  ? `$${parseFloat(selectedMarket.referencePriceUsd).toFixed(2)}`
                  : "—"}
              </span>
              <span className="text-[10px] text-mutedText mt-0.5 block">Official valuation</span>
            </div>

            {/* Max Allowed */}
            <div className="p-3.5 rounded-panel border border-borderBase bg-surface shadow-2xs">
              <span className="text-[10px] font-mono uppercase tracking-wider text-sieveBlue block mb-1">
                MAX ALLOWED
              </span>
              <span className="text-base sm:text-lg font-bold font-mono text-sieveBlue tabular-nums block">
                {checkResult?.price.maxBuyUsd
                  ? `$${checkResult.price.maxBuyUsd}`
                  : refPrice
                  ? `$${(refPrice * (1 + userLimitPct / 100)).toFixed(2)}`
                  : "—"}
              </span>
              <span className="text-[10px] text-sieveBlue/80 mt-0.5 block">+{userLimitPct.toFixed(1)}% ceiling</span>
            </div>

            {/* Live Buy Price */}
            <div className="p-3.5 rounded-panel border border-borderBase bg-surface shadow-2xs">
              <span className="text-[10px] font-mono uppercase tracking-wider text-secondaryText block mb-1">
                LIVE BUY PRICE
              </span>
              <span
                className={`text-base sm:text-lg font-bold font-mono tabular-nums block ${
                  checkResult?.price.currentBuyUsd
                    ? bannerState === "GOOD_TO_GO"
                      ? "text-sieveGreen"
                      : "text-sieveRed"
                    : "text-secondaryText"
                }`}
              >
                {checkResult?.price.currentBuyUsd
                  ? `$${checkResult.price.currentBuyUsd}`
                  : "—"}
              </span>
              <span className="text-[10px] text-mutedText mt-0.5 block">
                {checkResult?.price.premiumPct
                  ? `${parseFloat(checkResult.price.premiumPct) >= 0 ? "+" : ""}${checkResult.price.premiumPct}% premium`
                  : "Awaiting check"}
              </span>
            </div>
          </div>

          {/* Sieve Core Signature: Price Boundary Rail */}
          <PriceRail
            referencePriceUsd={refPrice}
            currentBuyPriceUsd={currentBuyPrice}
            userLimitPct={userLimitPct}
            onLimitChange={setUserLimitPct}
            interactive={true}
          />

          {/* Analytical Decision State Banner */}
          <StateBanner
            state={bannerState}
            title={checkResult?.display.title}
            message={checkResult?.display.message}
            premiumPct={checkResult?.price.premiumPct}
            limitPct={userLimitPct.toFixed(2)}
            onRefresh={handleCheckPrice}
          />
        </div>
      </div>

      {/* Review Dialog */}
      {checkResult && (
        <ReviewDialog
          isOpen={isReviewOpen}
          onClose={() => {
            setIsReviewOpen(false);
            setBuildData(null);
          }}
          network={network}
          check={checkResult}
          wallet={publicKey?.toBase58()}
          buildSummary={buildData?.summary}
          expiresAt={buildData?.expiresAt}
          isBuilding={isBuilding}
          onPrepareTransaction={handlePrepareTransaction}
          onConfirmInWallet={handleConfirmInWallet}
          onConfirmPractice={handleConfirmPractice}
        />
      )}

      {/* Wallet Waiting Modal */}
      {isWaitingForWallet && (
        <WalletWaiting onCancel={() => setIsWaitingForWallet(false)} />
      )}
    </div>
  );
}
