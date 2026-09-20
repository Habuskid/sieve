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
  const [amount, setAmount] = useState<string>("");
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
  const parsedReference = selectedMarket
    ? Number.parseFloat(selectedMarket.referencePriceUsd)
    : Number.NaN;
  const refPrice = Number.isFinite(parsedReference) ? parsedReference : null;
  const currentBuyPrice = checkResult?.price.currentBuyUsd
    ? parseFloat(checkResult.price.currentBuyUsd)
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

  // Practice Mode: Direct Simulated Execution (Never prompts wallet signing)
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

  // If receipt is active, show the completed receipt view
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

  const showAuxiliaryState = !["IDLE", "GOOD_TO_GO", "PRICE_TOO_HIGH"].includes(bannerState);

  return (
    <div className="mx-auto max-w-7xl px-5 py-6 sm:px-8 sm:py-10 lg:px-10 lg:py-14">
      {network === "testnet" && (
        <p className="mb-7 flex items-center gap-2 text-sm text-secondaryText sm:mb-9">
          <span className="size-1.5 rounded-full bg-sieveAmber" aria-hidden="true" />
          Practice mode. Simulated data. No wallet signature or funds used.
        </p>
      )}

      <div className="max-w-3xl">
        <h1 className="text-balance text-4xl font-semibold leading-tight text-primaryText sm:text-5xl">
          Buy {selectedMarket ? selectedMarket.name : "a PreStocks asset"}
        </h1>
        <p className="mt-3 max-w-2xl text-pretty text-base leading-7 text-secondaryText">
          Enter an amount, set your price limit, and check the route.
        </p>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-10 border-t border-borderBase pt-8 sm:mt-10 sm:pt-10 lg:grid-cols-12 lg:gap-0">
        <section className="space-y-6 sm:space-y-8 lg:col-span-4 lg:pr-10" aria-labelledby="order-heading">
          <h2 id="order-heading" className="text-lg font-medium text-primaryText">Buy details</h2>

          <div>
            <label htmlFor="target-asset" className="mb-2 block text-sm font-medium text-secondaryText">Asset to buy</label>
            <select
              id="target-asset"
              value={selectedMint}
              onChange={(event) => setSelectedMint(event.target.value)}
              className="min-h-12 w-full border border-borderStrong bg-surface px-4 py-3 text-sm font-medium text-primaryText focus:border-sieveBlue focus:outline-none focus:ring-1 focus:ring-sieveBlue"
            >
              {markets.map((market) => (
                <option key={market.mint} value={market.mint} className="bg-surface text-primaryText">
                  {market.name} ({market.symbol})
                </option>
              ))}
            </select>
          </div>

          <AmountInput
            value={amount}
            onChange={setAmount}
            asset={fundingAsset}
            error={errorMessage}
          />

          <FundingSelector selected={fundingAsset} onChange={setFundingAsset} />
        </section>

        <section className="lg:col-span-8 lg:border-l lg:border-borderBase lg:pl-10" aria-label="Price limit and route status">
          <PriceRail
            referencePriceUsd={refPrice}
            currentBuyPriceUsd={currentBuyPrice}
            userLimitPct={userLimitPct}
            onLimitChange={setUserLimitPct}
          />

          {showAuxiliaryState && (
            <div className="mt-8">
              <StateBanner
                state={bannerState}
                title={checkResult?.display.title}
                message={checkResult?.display.message}
                premiumPct={checkResult?.price.premiumPct}
                limitPct={userLimitPct.toFixed(2)}
                onRefresh={handleCheckPrice}
              />
            </div>
          )}

          <div className="mt-8 flex justify-end border-t border-borderBase pt-6">
            {bannerState === "GOOD_TO_GO" && checkResult ? (
              <button
                type="button"
                onClick={handleStartReview}
                className="inline-flex min-h-11 items-center justify-center gap-2 bg-sieveBlue px-6 py-3 text-sm font-semibold text-slate-950 transition-colors duration-150 hover:bg-sieveBlue-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sieveBlue"
              >
                Review buy
                <ArrowRight className="size-4" aria-hidden="true" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleCheckPrice}
                disabled={checking}
                className="inline-flex min-h-11 items-center justify-center gap-2 bg-primaryText px-6 py-3 text-sm font-semibold text-background transition-colors duration-150 hover:bg-white disabled:cursor-wait disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sieveBlue"
              >
                {checking && <RefreshCw className="size-4 animate-spin" aria-hidden="true" />}
                {checking ? "Checking today's price…" : "Check today's price"}
              </button>
            )}
          </div>
        </section>
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
