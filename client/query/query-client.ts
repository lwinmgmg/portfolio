"use client";

import { QueryClient } from "@tanstack/react-query";

import { PublicApiError } from "@/client/api/public-http";

const MAX_NETWORK_RETRIES = 2;

// Each public request spends session quota, so only retry transport failures
// (no response reached us); an HTTP answer is final.
function shouldRetry(failureCount: number, error: Error): boolean {
  if (error instanceof PublicApiError) return false;
  return failureCount < MAX_NETWORK_RETRIES;
}

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        retry: shouldRetry,
      },
    },
  });
}
