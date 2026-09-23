export type LoginState = {
  status: "idle" | "error";
  message: string | null;
  fieldErrors?: {
    username?: string[];
    password?: string[];
  };
};
