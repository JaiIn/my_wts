"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import { shouldRetryMarketQuery } from "./market-query";

export function MarketQueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: shouldRetryMarketQuery,
            refetchOnWindowFocus: true,
            gcTime: 21_600_000,
          },
          mutations: { retry: false },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
