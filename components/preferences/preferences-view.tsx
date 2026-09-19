"use client";

import React, { useState, useEffect } from "react";
import type { FundingAsset } from "@/core/domain/types";
import { Check, Trash2 } from "lucide-react";

export function PreferencesView() {
  const [defaultLimit, setDefaultLimit] = useState<number>(5.0);
  const [defaultAsset, setDefaultAsset] = useState<FundingAsset>("USDC");
  const [saved, setSaved] = useState(false);

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
      localStorage.setItem("sieve_default_limit", defaultLimit.toString());
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
    <div className="mx-auto max-w-2xl px-4 sm:px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-primaryText">
          Preferences
        </h1>
        <p className="text-sm text-secondaryText mt-1">
          Configure your default price limit and preferred funding asset.
        </p>
      </div>

      <div className="rounded-panel bg-surface border border-borderBase p-6 sm:p-8 shadow-xs space-y-6">
        {/* Default Limit Slider */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label htmlFor="pref-limit" className="text-xs font-semibold uppercase tracking-wider text-secondaryText">
              Default Price Limit
            </label>
            <span className="font-mono font-bold text-sieveBlue text-sm tabular-nums">
              +{defaultLimit.toFixed(1)}%
            </span>
          </div>
          <input
            id="pref-limit"
            type="range"
            min={0}
            max={20}
            step={0.5}
            value={defaultLimit}
            onChange={(e) => setDefaultLimit(parseFloat(e.target.value))}
            className="w-full h-2 bg-surface-subtle border border-borderBase rounded-lg appearance-none cursor-pointer accent-sieveBlue focus:outline-none focus:ring-2 focus:ring-sieveBlue"
          />
          <p className="mt-1 text-xs text-mutedText">
            The initial price limit applied when you open a token buy page.
          </p>
        </div>

        {/* Default Funding Asset */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-secondaryText mb-2">
            Default Funding Asset
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setDefaultAsset("USDC")}
              className={`flex items-center justify-center gap-2 rounded-btn py-3 px-4 text-xs font-semibold transition-colors border min-h-[44px] ${
                defaultAsset === "USDC"
                  ? "bg-surface text-primaryText border-borderStrong shadow-xs"
                  : "bg-surface-subtle text-secondaryText border-borderBase hover:text-primaryText"
              }`}
            >
              <span>USDC</span>
            </button>
            <button
              type="button"
              onClick={() => setDefaultAsset("SOL")}
              className={`flex items-center justify-center gap-2 rounded-btn py-3 px-4 text-xs font-semibold transition-colors border min-h-[44px] ${
                defaultAsset === "SOL"
                  ? "bg-surface text-primaryText border-borderStrong shadow-xs"
                  : "bg-surface-subtle text-secondaryText border-borderBase hover:text-primaryText"
              }`}
            >
              <span>SOL</span>
            </button>
          </div>
        </div>

        {/* Save Button */}
        <div className="pt-4 border-t border-borderBase flex items-center justify-between">
          <button
            type="button"
            onClick={handleClearLocalData}
            className="inline-flex items-center gap-1.5 text-xs text-sieveRed hover:underline font-medium min-h-[44px]"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Reset preferences</span>
          </button>

          <button
            type="button"
            onClick={handleSave}
            className="inline-flex items-center gap-2 rounded-btn bg-primaryText px-5 py-2.5 text-xs font-semibold text-white hover:bg-primaryText/90 transition-colors shadow-xs min-h-[44px]"
          >
            {saved ? (
              <>
                <Check className="h-4 w-4 text-emerald-400" aria-hidden="true" />
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
