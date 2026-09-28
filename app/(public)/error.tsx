"use client";

export default function PublicError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto w-full max-w-3xl space-y-3 px-6 py-24">
      <h1 className="text-lg font-semibold">This page could not be loaded</h1>
      <p className="text-zinc-600 dark:text-zinc-400">Please try again in a moment.</p>
      {error.digest ? (
        <p className="text-sm text-zinc-500">Reference: {error.digest}</p>
      ) : null}
      <button
        type="button"
        className="rounded-sm underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        onClick={() => reset()}
      >
        Try again
      </button>
    </main>
  );
}
