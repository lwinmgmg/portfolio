"use server";

import { revalidatePath } from "next/cache";

import type { RagActionState } from "@/app/admin/(panel)/rag/rag-action-state";
import { EMAIL_ADMIN_PATH } from "@/server/email/gmail-oauth";
import { withAdmin } from "@/server/services/auth-service";
import { getEmail } from "@/server/services/email-runtime";

async function disconnectGmail(): Promise<RagActionState> {
  let result;
  try {
    result = await getEmail().disconnect();
  } catch (error) {
    console.error("Could not disconnect Gmail.", error);
    return { status: "error", message: "Could not disconnect Gmail." };
  }
  revalidatePath(EMAIL_ADMIN_PATH);
  if (!result.removed) return { status: "saved", message: "Gmail was not connected." };
  return {
    status: "saved",
    message: result.revoked
      ? "Gmail disconnected and its access revoked."
      : "Gmail disconnected. Google did not confirm the revocation; remove the app at myaccount.google.com/permissions.",
  };
}

async function sendTestEmail(): Promise<RagActionState> {
  try {
    const result = await getEmail().sendTest();
    return result.ok
      ? { status: "saved", message: `Test email sent to ${result.to}.` }
      : { status: "error", message: result.message };
  } catch (error) {
    console.error("Could not send the test email.", error);
    return { status: "error", message: "The test email could not be sent." };
  }
}

export const disconnectGmailAction = withAdmin(disconnectGmail);
export const sendTestEmailAction = withAdmin(sendTestEmail);
