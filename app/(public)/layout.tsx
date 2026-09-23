import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { QueryProvider } from "@/client/query/query-provider";
import { readPublicSessionPresence } from "@/server/http/public-session-cookie";

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headerList = await headers();
  const prefetch =
    headerList.get("next-router-prefetch") === "1" ||
    headerList.get("purpose")?.toLowerCase() === "prefetch";
  const presence = await readPublicSessionPresence();

  if (!prefetch && !presence.hasSession && !presence.onHold) {
    redirect("/api/public/session/issue?next=/");
  }

  return <QueryProvider>{children}</QueryProvider>;
}
