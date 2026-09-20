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
import { ArrowRight, ShieldCheck, RefreshCw } from "lucide-react";

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
    <div className="mx-auto max-w-2xl px-4 sm:px-6 py-8">
      {/* Practice Mode Banner */}
      {network === "testnet" && (
        <div className="mb-4 rounded-card border border-warning/30 bg-warning-soft px-4 py-2 text-xs font-semibold text-warning text-center">
          Practice mode — Test data / Simulated transaction
        </div>
      )}

      {/* Page Title */}
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-primaryText">
          Buy {selectedMarket ? selectedMarket.name : "Company"}
        </h1>
        <p className="text-sm text-secondaryText mt-1">
          Set your limit first. Sieve will check the live price before you sign.
        </p>
      </div>

      <div className="rounded-panel bg-surface border border-borderBase p-6 sm:p-8 shadow-xs space-y-6">
        {/* Company Selector (if multiple) */}
        {markets.length > 1 && (
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-secondaryText mb-2">
              Select company
            </label>
            <select
              value={selectedMint}
              onChange={(e) => setSelectedMint(e.target.value)}
              className="w-full rounded-btn bg-surface border border-borderBase px-4 py-2.5 text-sm font-semibold text-primaryText shadow-2xs focus:outline-none focus:ring-2 focus:ring-sieveBlue min-h-[44px]"
            >
              {markets.map((m) => (
                <option key={m.mint} value={m.mint}>
                  {m.name} ({m.symbol}) — Ref: ${parseFloat(m.referencePriceUsd).toFixed(2)}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* 1. Pay with SOL / USDC */}
        <FundingSelector
          selected={fundingAsset}
          onChange={setFundingAsset}
          disabled={false}
        />

        {/* 2. How much? */}
        <AmountInput
          value={amount}
          onChange={setAmount}
          asset={fundingAsset}
          disabled={false}
          error={errorMessage}
        />

        {/* 3. Your price limit (Signature Visual Rail) */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-secondaryText mb-2">
            Your price limit
          </label>
          <PriceRail
            referencePriceUsd={refPrice}
            currentBuyPriceUsd={currentBuyPrice}
            userLimitPct={userLimitPct}
            onLimitChange={setUserLimitPct}
            interactive={true}
          />
          <p className="mt-1.5 text-xs text-mutedText">
            We&apos;ll stop the buy if the live price moves past this.
          </p>
        </div>

        {/* State Banner */}
        <StateBanner
          state={bannerState}
          title={checkResult?.display.title}
          message={checkResult?.display.message}
          premiumPct={checkResult?.price.premiumPct}
          limitPct={userLimitPct.toFixed(2)}
          onRefresh={handleCheckPrice}
        />

        {/* Action Buttons */}
        <div className="pt-2">
          {bannerState === "GOOD_TO_GO" && checkResult ? (
            <button
              type="button"
              onClick={handleStartReview}
              className="flex w-full items-center justify-center gap-2 rounded-btn bg-sieveBlue py-3.5 px-6 text-sm font-bold text-white hover:bg-sieveBlue-hover transition-colors shadow-md min-h-[52px]"
            >
              <span>Review buy</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleCheckPrice}
              disabled={checking}
              className="flex w-full items-center justify-center gap-2 rounded-btn bg-primaryText py-3.5 px-6 text-sm font-bold text-white hover:bg-primaryText/90 transition-colors shadow-md min-h-[52px] disabled:opacity-50"
            >
              {checking ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
                  <span>Checking today&apos;s price...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                  <span>Check today&apos;s price</span>
                </>
              )}
            </button>
          )}
          <p className="mt-2 text-center text-xs text-mutedText">
            You won&apos;t sign anything on this step.
          </p>
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
