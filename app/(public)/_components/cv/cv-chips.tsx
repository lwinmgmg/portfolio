export function CvChips({ items, label }: { items: readonly string[]; label: string }) {
  if (items.length === 0) return null;
  return (
    <ul aria-label={label} className="flex flex-wrap gap-1.5">
      {items.map((item, index) => (
        <li
          key={`${index}-${item}`}
          className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-300 print:border print:border-black"
        >
          {item}
        </li>
      ))}
    </ul>
  );
}
