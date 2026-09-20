import React from "react";

interface SieveLogoProps {
  className?: string;
  size?: number;
  color?: string;
}

/**
 * Geometric Sieve brand mark:
 * Three precise horizontal filter lines narrowing downward with a vertical price-boundary mark.
 * Flat, one-color, non-crypto, technical.
 */
export function SieveLogo({
  className = "h-5 w-5",
  size = 20,
  color = "currentColor",
}: SieveLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Precision filter lines */}
      <line x1="3" y1="5" x2="21" y2="5" stroke={color} strokeWidth="2" strokeLinecap="square" />
      <line x1="6" y1="11" x2="18" y2="11" stroke={color} strokeWidth="2" strokeLinecap="square" />
      <line x1="9" y1="17" x2="15" y2="17" stroke={color} strokeWidth="2" strokeLinecap="square" />
      {/* Boundary marker dot */}
      <circle cx="12" cy="21" r="1.25" fill={color} />
    </svg>
  );
}
