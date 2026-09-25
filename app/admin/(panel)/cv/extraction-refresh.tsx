"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const REFRESH_MS = 3000;

export function CvExtractionRefresh() {
  const router = useRouter();

  useEffect(() => {
    const timer = window.setInterval(() => {
      router.refresh();
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [router]);

  return (
    <p role="status" aria-live="polite">
      Extraction is in progress. This page refreshes every 3 seconds.
    </p>
  );
}
