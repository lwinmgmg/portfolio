import type { TraceView } from "@/server/rag/pipeline/trace-reader";

export type PlaygroundState = {
  status: "idle" | "done" | "error";
  message: string | null;
  // The run's trace. Present after a failed stage too, so the admin sees where it failed.
  view: TraceView | null;
};

export const idlePlaygroundState: PlaygroundState = { status: "idle", message: null, view: null };
