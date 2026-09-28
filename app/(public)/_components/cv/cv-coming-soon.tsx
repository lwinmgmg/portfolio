export function CvComingSoon() {
  return (
    <section
      aria-labelledby="cv-coming-soon-heading"
      className="rounded-lg border border-dashed border-zinc-300 px-6 py-10 text-center dark:border-zinc-700"
    >
      <h1
        id="cv-coming-soon-heading"
        className="text-lg font-semibold text-zinc-950 dark:text-zinc-50"
      >
        CV coming soon
      </h1>
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
        The full CV will appear here once it is published.
      </p>
    </section>
  );
}
