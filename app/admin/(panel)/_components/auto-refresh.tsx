"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const REFRESH_MS = 3000;

// Re-renders the page from the server every 3 seconds while background work runs.
// Render it only while that work is in progress.
export function AutoRefresh({ message }: { message: string }) {
  const router = useRouter();

  useEffect(() => {
    const timer = window.setInterval(() => {
      router.refresh();
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [router]);

  return (
    <p role="status" aria-live="polite">
      {message} This page refreshes every 3 seconds.
    </p>
  );
}
