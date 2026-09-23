"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

import { makeQueryClient } from "@/client/query/query-client";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  // One client per browser session; lazy init keeps it stable across renders.
  const [queryClient] = useState(makeQueryClient);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
