"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import type { NetworkMode } from "@/core/domain/types";

interface NetworkContextValue {
  network: NetworkMode;
  setNetwork: (network: NetworkMode) => void;
}

const NetworkContext = createContext<NetworkContextValue>({
  network: "testnet",
  setNetwork: () => {},
});

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const [network, setNetworkState] = useState<NetworkMode>("testnet");

  useEffect(() => {
    try {
      const stored = localStorage.getItem("sieve_network") as NetworkMode;
      if (stored === "mainnet" || stored === "testnet") {
        setNetworkState(stored);
      }
    } catch {
      // ignore
    }
  }, []);

  const setNetwork = (mode: NetworkMode) => {
    setNetworkState(mode);
    try {
      localStorage.setItem("sieve_network", mode);
    } catch {
      // ignore
    }
  };

  return (
    <NetworkContext.Provider value={{ network, setNetwork }}>
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetwork() {
  return useContext(NetworkContext);
}
