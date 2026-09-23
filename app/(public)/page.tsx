import { ProjectList } from "@/app/project-list";
import { readPublicSessionPresence } from "@/server/http/public-session-cookie";

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string | string[] }>;
}) {
  const sessionState = firstParam((await searchParams).session);
  const presence = await readPublicSessionPresence();
  const unavailable = sessionState === "unavailable";
  const limited = sessionState === "limited" || presence.onHold;

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-3xl flex-1 flex-col px-6 py-16 sm:px-16 sm:py-32">
        <ProjectList
          issuanceBlocked={!presence.hasSession && limited}
          unavailable={unavailable}
        />
      </main>
    </div>
  );
}
