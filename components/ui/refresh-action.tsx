"use client";

import React from "react";
import { RefreshMark } from "@/components/ui/refresh-mark";

interface RefreshActionProps {
  onClick: () => void;
  label: string;
  loadingLabel?: string;
  loading?: boolean;
  disabled?: boolean;
  type?: "button" | "submit";
}

export function RefreshAction({
  onClick,
  label,
  loadingLabel,
  loading = false,
  disabled = false,
  type = "button",
}: RefreshActionProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className="sieve-refresh-action"
    >
      <RefreshMark loading={loading} />
      <span>{loading ? loadingLabel || label : label}</span>
    </button>
  );
}
