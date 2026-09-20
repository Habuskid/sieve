"use client";

import React, { useState, useEffect } from "react";
import type { FundingAsset } from "@/core/domain/types";
import { Check } from "lucide-react";

export function PreferencesView() {
  const [defaultLimit, setDefaultLimit] = useState<number>(5.0);
  const [defaultAsset, setDefaultAsset] = useState<FundingAsset>("USDC");
  const [saved, setSaved] = useState(false);

  const limitInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const storedLimit = localStorage.getItem("sieve_default_limit");
      const storedAsset = localStorage.getItem("sieve_default_asset");
      if (storedLimit) setDefaultLimit(parseFloat(storedLimit));
      if (storedAsset === "SOL" || storedAsset === "USDC") setDefaultAsset(storedAsset);
    } catch {
      // localStorage may not be available in private mode
    }
  }, []);

  const handleSave = () => {
    try {
      const currentLimit = limitInputRef.current
        ? parseFloat(limitInputRef.current.value) || defaultLimit
        : defaultLimit;
      localStorage.setItem("sieve_default_limit", currentLimit.toString());
      localStorage.setItem("sieve_default_asset", defaultAsset);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleClearLocalData = () => {
    if (confirm("Are you sure you want to clear your local preferences and history cache?")) {
      try {
        localStorage.clear();
        setDefaultLimit(5.0);
        setDefaultAsset("USDC");
        alert("Local preferences reset.");
      } catch {
        // ignore
      }
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-6">
      {/* Page Header */}
      <div className="pb-4 mb-6 border-b border-borderBase">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-primaryText">
          Trading Preferences
        </h1>
        <p className="text-xs text-secondaryText mt-0.5">
          Configure default boundary parameters for new order tickets.
        </p>
      </div>

      <div className="rounded-panel bg-surface border border-borderBase divide-y divide-borderBase shadow-xs">
        {/* Section: Default Limit */}
        <div className="p-5 sm:p-6 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <label htmlFor="pref-limit" className="text-xs font-bold text-primaryText block">
                Default Price Limit
              </label>
              <p className="text-[11px] text-secondaryText mt-0.5">
                Maximum acceptable premium over official reference valuation when opening a trade.
              </p>
            </div>
            <span className="font-mono font-bold text-sieveBlue text-sm tabular-nums">
              +{defaultLimit.toFixed(1)}%
            </span>
          </div>

          <div className="pt-2">
            <input
              ref={limitInputRef}
              id="pref-limit"
              type="range"
              min={0}
              max={20}
              step={0.5}
              value={defaultLimit}
              onChange={(e) => setDefaultLimit(parseFloat(e.target.value))}
              onInput={(e) => setDefaultLimit(parseFloat(e.currentTarget.value))}
              className="w-full h-1.5 bg-surface-subtle border border-borderBase rounded-[2px] appearance-none cursor-pointer accent-sieveBlue focus:outline-none focus:ring-1 focus:ring-sieveBlue"
            />
            <div className="flex justify-between text-[10px] font-mono text-mutedText mt-1">
              <span>+0% (At reference)</span>
              <span>+20%</span>
            </div>
          </div>
        </div>

        {/* Section: Default Funding Asset */}
        <div className="p-5 sm:p-6 space-y-3">
          <div>
            <label className="text-xs font-bold text-primaryText block">
              Default Funding Asset
            </label>
            <p className="text-[11px] text-secondaryText mt-0.5">
              Preferred capital token preselected in the buy workstation.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 max-w-xs">
            <button
              type="button"
              onClick={() => setDefaultAsset("USDC")}
              className={`flex items-center justify-center gap-2 rounded-[4px] py-2 px-3 text-xs font-semibold transition-colors border min-h-[38px] ${
                defaultAsset === "USDC"
                  ? "bg-surface text-primaryText border-borderStrong shadow-2xs font-bold"
                  : "bg-surface-subtle text-secondaryText border-borderBase hover:text-primaryText"
              }`}
            >
              <span className="font-mono text-sieveBlue font-bold">$</span>
              <span>USDC</span>
            </button>
            <button
              type="button"
              onClick={() => setDefaultAsset("SOL")}
              className={`flex items-center justify-center gap-2 rounded-[4px] py-2 px-3 text-xs font-semibold transition-colors border min-h-[38px] ${
                defaultAsset === "SOL"
                  ? "bg-surface text-primaryText border-borderStrong shadow-2xs font-bold"
                  : "bg-surface-subtle text-secondaryText border-borderBase hover:text-primaryText"
              }`}
            >
              <span className="font-mono text-secondaryText font-bold">◎</span>
              <span>SOL</span>
            </button>
          </div>
        </div>

        {/* Action Controls */}
        <div className="p-5 sm:p-6 bg-surface-subtle/50 flex items-center justify-between">
          <button
            type="button"
            onClick={handleClearLocalData}
            className="text-xs text-sieveRed hover:underline font-medium min-h-[38px]"
          >
            Reset preferences
          </button>

          <button
            type="button"
            onClick={handleSave}
            className="sieve-control-primary"
          >
            {saved ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                <span>Saved</span>
              </>
            ) : (
              <span>Save preferences</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
