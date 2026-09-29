// Makes the Gmail refresh token for the contact-email sender (Plan.md 4.2). Run by the owner:
//   bun run email:token
// It reads GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET from .env.local (a Google OAuth client of type
// "Desktop app"), opens a loopback server on a free port, prints the consent URL for the gmail.send
// scope, and prints GMAIL_REFRESH_TOKEN=... once you approve. The token goes to stdout, the rest
// to stderr.
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import {
  buildConsentUrl,
  createOAuthState,
  createPkcePair,
  GMAIL_SEND_SCOPE,
  GOOGLE_TOKEN_URL,
  readConsentCallback,
  readOAuthError,
} from "../server/email/gmail-oauth";

const LOOPBACK_HOST = "127.0.0.1";
const WAIT_MS = 5 * 60_000;

class SetupError extends Error {}

type Client = { id: string; secret: string };

async function main(): Promise<void> {
  const client = readClient();
  const pkce = createPkcePair();
  const state = createOAuthState();

  const consent = await new Promise<{ code: string; redirectUri: string }>((resolve, reject) => {
    let redirectUri = "";
    const server: Server = createServer((request, response) => {
      const url = new URL(request.url ?? "/", redirectUri);
      if (url.pathname !== "/") {
        response.writeHead(404).end();
        return;
      }
      const callback = readConsentCallback(url, state);
      const message =
        callback.kind === "code" ? "Signed in. Return to the terminal." : callback.message;
      response.writeHead(callback.kind === "code" ? 200 : 400, {
        "Content-Type": "text/plain; charset=utf-8",
      });
      response.end(message);
      clearTimeout(timer);
      server.close();
      if (callback.kind === "code") resolve({ code: callback.code, redirectUri });
      else reject(new SetupError(callback.message));
    });
    const timer = setTimeout(() => {
      server.close();
      reject(new SetupError("No sign-in within 5 minutes. Run the script again."));
    }, WAIT_MS);

    server.on("error", reject);
    // Port 0: the OS picks a free port, so this never takes the dev server's 3000.
    server.listen(0, LOOPBACK_HOST, () => {
      const { port } = server.address() as AddressInfo;
      redirectUri = `http://${LOOPBACK_HOST}:${port}`;
      console.error("Open this URL, sign in with the Gmail account that sends the email, and allow access:\n");
      console.error(
        `${buildConsentUrl({ clientId: client.id, redirectUri, challenge: pkce.challenge, state })}\n`,
      );
      console.error(`Waiting for Google to redirect to ${redirectUri} ...`);
    });
  });

  const refreshToken = await exchangeCode(client, consent.code, consent.redirectUri, pkce.verifier);
  console.error("\nAdd this line to .env.local and to the Vercel project's environment variables:\n");
  console.log(`GMAIL_REFRESH_TOKEN=${refreshToken}`);
}

function readClient(): Client {
  const id = process.env.GMAIL_CLIENT_ID?.trim();
  const secret = process.env.GMAIL_CLIENT_SECRET?.trim();
  if (!id || !secret) {
    throw new SetupError(
      "Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in .env.local first (a Google OAuth client of type Desktop app).",
    );
  }
  return { id, secret };
}

async function exchangeCode(
  client: Client,
  code: string,
  redirectUri: string,
  verifier: string,
): Promise<string> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: client.id,
      client_secret: client.secret,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const { error, description } = readOAuthError(payload);
    throw new SetupError(
      `Google refused the code exchange (${response.status}): ${description ?? error ?? "no details"}`,
    );
  }

  const record = (payload ?? {}) as { refresh_token?: unknown; scope?: unknown };
  const scopes = typeof record.scope === "string" ? record.scope.split(" ") : [];
  if (!scopes.includes(GMAIL_SEND_SCOPE)) {
    throw new SetupError(
      "Google did not grant the gmail.send scope. Run the script again and tick the Gmail permission.",
    );
  }
  if (typeof record.refresh_token !== "string" || record.refresh_token.length === 0) {
    throw new SetupError(
      "Google returned no refresh token. Remove this app at https://myaccount.google.com/permissions and run the script again.",
    );
  }
  return record.refresh_token;
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error(error instanceof SetupError ? error.message : error);
    process.exit(1);
  },
);
