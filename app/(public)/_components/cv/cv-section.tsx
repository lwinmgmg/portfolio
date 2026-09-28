// Common frame for every CV section: an anchored landmark with a small tracked heading.
export function CvSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  const headingId = `${id}-heading`;
  return (
    <section id={id} aria-labelledby={headingId} className="scroll-mt-12">
      <h2
        id={headingId}
        className="mb-6 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-400"
      >
        {title}
      </h2>
      {children}
    </section>
  );
}
