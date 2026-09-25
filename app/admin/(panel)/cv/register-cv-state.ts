export type RegisterCvUploadState = {
  status: "idle" | "saved" | "invalid" | "error";
  message: string | null;
};
