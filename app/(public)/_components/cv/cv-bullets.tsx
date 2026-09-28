import { bodyText } from "@/app/(public)/_components/cv/cv-styles";

export function CvBullets({ items }: { items: readonly string[] }) {
  if (items.length === 0) return null;
  return (
    <ul className={`list-disc space-y-1.5 pl-5 marker:text-zinc-400 ${bodyText}`}>
      {items.map((item, index) => (
        <li key={`${index}-${item}`}>{item}</li>
      ))}
    </ul>
  );
}
