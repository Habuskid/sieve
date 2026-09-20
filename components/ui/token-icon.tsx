"use client";

import React from "react";
import type { FundingAsset } from "@/core/domain/types";

interface TokenIconProps {
  asset: FundingAsset;
  size?: number;
  className?: string;
}

const TOKEN_ICON_SRC: Record<FundingAsset, string> = {
  USDC: "/icons/usdc.svg",
  SOL: "/icons/solana.svg",
};

export function TokenIcon({
  asset,
  size = 18,
  className = "",
}: TokenIconProps) {
  return (
    <img
      src={TOKEN_ICON_SRC[asset]}
      alt=""
      width={size}
      height={size}
      className={`shrink-0 object-contain ${className}`}
      aria-hidden="true"
    />
  );
}
