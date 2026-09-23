export type CreateProjectState = {
  status: "idle" | "saved" | "error";
  message: string | null;
};
