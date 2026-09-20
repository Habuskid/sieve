"use client";

import React from "react";
import { RotateCcw } from "lucide-react";

interface RefreshMarkProps {
  loading?: boolean;
}

export function RefreshMark({ loading = false }: RefreshMarkProps) {
  return (
    <span
      className="sieve-refresh-mark"
      data-loading={loading ? "true" : "false"}
      aria-hidden="true"
    >
      <RotateCcw className="sieve-refresh-mark-icon" />
    </span>
  );
}
