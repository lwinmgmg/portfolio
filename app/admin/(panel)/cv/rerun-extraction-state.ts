export type RerunExtractionState = {
  status: "idle" | "saved" | "error";
  message: string | null;
};
