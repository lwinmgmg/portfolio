export type RegisterCvUploadState = {
  status: "idle" | "saved" | "error";
  message: string | null;
};
