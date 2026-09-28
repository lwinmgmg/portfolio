import type { IndexConfig } from "@/server/domain/rag";

const integerFormat = new Intl.NumberFormat("en-US");

export function formatCount(value: number): string {
  return integerFormat.format(value);
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} min ${Math.round(seconds - minutes * 60)} s`;
}

// Index builds cost fractions of a cent, so small amounts keep more digits.
export function formatCost(usd: number | null): string {
  if (usd === null) return "—";
  if (usd === 0) return "$0";
  if (usd < 0.01) return `$${usd.toPrecision(2)}`;
  return `$${usd.toFixed(2)}`;
}

export function contextSummary(config: IndexConfig): string {
  return config.contextualize && config.contextModel ? `Yes (${config.contextModel})` : "No";
}
