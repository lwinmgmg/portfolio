"use client";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Could not load projects</h2>
      <p>The database request failed.</p>
      {error.digest ? (
        <p className="text-sm text-gray-500">Reference: {error.digest}</p>
      ) : null}
      <button type="button" className="underline" onClick={() => reset()}>
        Try again
      </button>
    </section>
  );
}
