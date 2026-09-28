"use client";

import type { CvNavItem } from "@/app/(public)/_components/cv/cv-sections";
import { focusRing } from "@/app/(public)/_components/cv/cv-styles";
import { useScrollSpy } from "@/app/(public)/_components/cv/use-scroll-spy";

// Desktop only. Mobile readers scroll a single column, so the nav would only take space.
export function CvSectionNav({ items }: { items: readonly CvNavItem[] }) {
  const activeId = useScrollSpy(items.map((item) => item.id));
  return (
    <nav aria-label="CV sections" className="sticky top-16 hidden self-start lg:block print:hidden">
      <ul className="space-y-1 border-l border-zinc-200 dark:border-zinc-800">
        {items.map((item) => {
          const active = item.id === activeId;
          return (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                aria-current={active ? "location" : undefined}
                className={`${focusRing} -ml-px block border-l-2 py-1 pl-4 text-sm transition-colors motion-reduce:transition-none ${
                  active
                    ? "border-accent font-medium text-zinc-950 dark:text-zinc-50"
                    : "border-transparent text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
                }`}
              >
                {item.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
