import { flattenError, z } from "zod";

const MAX_FIELD_LENGTH = 1024;

// Username is trimmed. The password is kept exactly as entered so it matches the stored hash.
export const LoginSchema = z.object({
  username: z
    .string({ error: "Username is required." })
    .trim()
    .min(1, { error: "Username is required." })
    .max(MAX_FIELD_LENGTH, { error: "Username is too long." }),
  password: z
    .string({ error: "Password is required." })
    .min(1, { error: "Password is required." })
    .max(MAX_FIELD_LENGTH, { error: "Password is too long." }),
});

export type LoginCredentials = z.infer<typeof LoginSchema>;

export type LoginFieldErrors = {
  username?: string[];
  password?: string[];
};

export type ParsedLogin =
  | { success: true; data: LoginCredentials }
  | { success: false; fieldErrors: LoginFieldErrors };

export function parseLoginForm(input: unknown): ParsedLogin {
  const parsed = LoginSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      fieldErrors: flattenError(parsed.error).fieldErrors,
    };
  }
  return { success: true, data: parsed.data };
}
