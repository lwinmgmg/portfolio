import { headers } from "next/headers";

import { formatWhen } from "@/app/admin/(panel)/_components/format-when";
import { DisconnectForm, TestEmailForm } from "@/app/admin/(panel)/email/email-forms";
import { callbackUri, connectBanner } from "@/app/admin/(panel)/email/email-text";
import { card, errorText, note, primaryButton } from "@/app/admin/(panel)/rag/rag-styles";
import { GMAIL_CALLBACK_PATH, GMAIL_CONNECT_PATH } from "@/server/email/gmail-oauth";
import { requireAdmin } from "@/server/services/auth-service";
import { getEmail } from "@/server/services/email-runtime";

type SearchParams = Promise<{ connected?: string | string[]; error?: string | string[] }>;

export default async function EmailAdminPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();

  const [status, params, requestHeaders] = await Promise.all([
    getEmail().status(),
    searchParams,
    headers(),
  ]);
  const banner = connectBanner(params);
  const redirectUri = callbackUri(
    requestHeaders.get("host"),
    requestHeaders.get("x-forwarded-proto"),
    GMAIL_CALLBACK_PATH,
  );

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <h2 className="text-lg font-semibold">Email</h2>
      <p className={note}>
        The chat can draft a message to you when a visitor asks. The visitor presses Send, and it
        goes from your Gmail to the address below. The chat offers this only while Gmail is
        connected.
      </p>

      {banner ? (
        <p role="status" className={banner.status === "error" ? errorText : "text-sm text-green-700 dark:text-green-400"}>
          {banner.message}
        </p>
      ) : null}

      {status.kind === "unconfigured" ? (
        <Setup missing={status.missing} redirectUri={redirectUri} />
      ) : (
        <>
          <section className={`space-y-4 ${card}`}>
            <h3 className="font-semibold">Gmail</h3>
            {status.account ? (
              <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
                <dt className="font-medium">Account</dt>
                <dd className="break-all">{status.account.email ?? "Connected (address not shared)"}</dd>
                <dt className="font-medium">Connected</dt>
                <dd>{formatWhen(status.account.connectedAt)}</dd>
              </dl>
            ) : (
              <p className="text-sm">Not connected. The chat does not offer to email you.</p>
            )}
            <div className="flex flex-wrap items-start gap-3">
              {/* A plain link: the connect route redirects to Google, so it must not be prefetched. */}
              <a href={GMAIL_CONNECT_PATH} className={primaryButton}>
                {status.account ? "Reconnect Gmail" : "Connect Gmail"}
              </a>
              {status.account ? <DisconnectForm /> : null}
            </div>
            <p className={note}>
              Google asks you to allow sending email as you. The app gets no access to read your
              mail.
            </p>
          </section>

          {status.account ? (
            <section className={`space-y-3 ${card}`}>
              <h3 className="font-semibold">Test email</h3>
              <p className={note}>Sends one email to {status.to} from the connected account.</p>
              <TestEmailForm />
            </section>
          ) : null}

          <section className={`space-y-3 ${card}`}>
            <h3 className="font-semibold">Settings</h3>
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
              <dt className="font-medium">Recipient</dt>
              <dd className="break-all">{status.to}</dd>
              <dt className="font-medium">Daily limit</dt>
              <dd>{status.dailyLimit} emails per UTC day</dd>
              <dt className="font-medium">Per visitor</dt>
              <dd>{status.sessionLimit} emails per session</dd>
              <dt className="font-medium">Redirect URI</dt>
              <dd className="break-all font-mono text-xs leading-5">{redirectUri ?? GMAIL_CALLBACK_PATH}</dd>
            </dl>
            <p className={note}>
              These come from <code className="font-mono">.env.local</code> and the Vercel project.
              The redirect URI must be listed on the Google OAuth client for each site address you
              connect from.
            </p>
          </section>
        </>
      )}
    </div>
  );
}

function Setup({ missing, redirectUri }: { missing: string[]; redirectUri: string | null }) {
  return (
    <section className={`space-y-3 ${card}`}>
      <h3 className="font-semibold">Set up</h3>
      <p className="text-sm">
        Missing or invalid:{" "}
        {missing.map((name, index) => (
          <span key={name}>
            {index > 0 ? ", " : null}
            <code className="font-mono">{name}</code>
          </span>
        ))}
        .
      </p>
      <ol className="list-decimal space-y-2 pl-5 text-sm">
        <li>In Google Cloud, enable the Gmail API.</li>
        <li>
          On the OAuth consent screen, set the publishing status to <strong>In production</strong>.
          In Testing, Google ends the connection after 7 days.
        </li>
        <li>
          Create an OAuth client of type <strong>Web application</strong> and add this authorized
          redirect URI (and the same path on your production address):
          <span className="mt-1 block break-all font-mono text-xs">
            {redirectUri ?? GMAIL_CALLBACK_PATH}
          </span>
        </li>
        <li>
          Put <code className="font-mono">GMAIL_CLIENT_ID</code>,{" "}
          <code className="font-mono">GMAIL_CLIENT_SECRET</code> and{" "}
          <code className="font-mono">CONTACT_EMAIL_TO</code> in{" "}
          <code className="font-mono">.env.local</code> and on Vercel, then restart the server and
          connect Gmail here.
        </li>
      </ol>
    </section>
  );
}
