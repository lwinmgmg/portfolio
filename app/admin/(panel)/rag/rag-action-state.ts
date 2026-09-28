export type RagActionState = {
  status: "idle" | "saved" | "error";
  message: string | null;
};

export const idleRagActionState: RagActionState = { status: "idle", message: null };
