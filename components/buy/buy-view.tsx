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
  const selectedMarketDisplayName = selectedMarket
    ? selectedMarket.name.replace(/\s*\(Practice\)\s*$/i, "")
    : "Choose an asset";
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
          setErrorMessage(data.error?.message || "Testnet simulation failed");
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
        setErrorMessage(confirmData.error?.message || "Testnet simulation failed");
      }
    } catch (err) {
      setIsBuilding(false);
      setIsReviewOpen(false);
      setBannerState("ERROR");
      setErrorMessage(err instanceof Error ? err.message : "Testnet simulation failed");
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
    <div className="mx-auto max-w-7xl px-5 py-7 sm:px-8 sm:py-10 lg:px-10 lg:py-12">
      <div className="flex flex-col gap-6 border-b border-borderBase pb-7 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-mutedText">Buy PreStocks</p>
          <h1 className="mt-2 text-balance text-4xl font-semibold leading-tight text-primaryText sm:text-5xl">
            {selectedMarketDisplayName}
          </h1>
          <p className="mt-3 max-w-2xl text-pretty text-sm leading-6 text-secondaryText sm:text-base">
            Set your amount and limit. Sieve checks the executable route before any transaction is prepared.
          </p>
        </div>
      </div>

      <section className="py-8 sm:py-10" aria-labelledby="order-heading">
        <div className="mb-6 flex items-center justify-between gap-4">
          <h2 id="order-heading" className="text-lg font-medium text-primaryText">Order</h2>
          <span className="text-xs uppercase tracking-[0.12em] text-mutedText">{fundingAsset} funding</span>
        </div>

        <div className="grid gap-7 lg:grid-cols-3 lg:gap-10">
          <div>
            <label htmlFor="target-asset" className="mb-2 block text-sm font-medium text-secondaryText">
              Asset
            </label>
            <select
              id="target-asset"
              value={selectedMint}
              onChange={(event) => setSelectedMint(event.target.value)}
              className="min-h-14 w-full border-0 border-b border-borderStrong bg-transparent px-0 py-3 text-base font-medium text-primaryText focus:border-sieveBlue focus:outline-none focus:ring-0"
            >
              {markets.map((market) => (
                <option key={market.mint} value={market.mint} className="bg-surface text-primaryText">
                  {market.name.replace(/\s*\(Practice\)\s*$/i, "")} ({market.symbol})
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
        </div>
      </section>

      <section className="border-t border-borderBase py-8 sm:py-10" aria-label="Execution boundary">
        <PriceRail
          referencePriceUsd={refPrice}
          currentBuyPriceUsd={currentBuyPrice}
          userLimitPct={userLimitPct}
          onLimitChange={setUserLimitPct}
        />

        {showAuxiliaryState && (
          <div className="mt-7">
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
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-btn bg-sieveBlue px-6 py-3 text-sm font-semibold text-slate-950 transition-colors duration-150 hover:bg-sieveBlue-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sieveBlue"
            >
              Review buy
              <ArrowRight className="size-4" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleCheckPrice}
              disabled={checking}
              className="sieve-control-primary min-h-11 px-6 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sieveBlue"
            >
              {checking && <RefreshCw className="size-4 animate-spin" aria-hidden="true" />}
              {checking ? "Checking today's price…" : "Check today's price"}
            </button>
          )}
        </div>
      </section>

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

      {isWaitingForWallet && (
        <WalletWaiting onCancel={() => setIsWaitingForWallet(false)} />
      )}
    </div>
  );
}
