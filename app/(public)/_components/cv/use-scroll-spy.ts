"use client";

import { useEffect, useEffectEvent, useState } from "react";

// A section is "current" while it crosses a thin band near the top of the viewport.
// Between sections the last match stays active, so the highlight never flickers off.
const ACTIVE_BAND = "-20% 0px -75% 0px";

// onChange hears each new current section as the observer reports it, not the initial guess, so a
// caller can react to the visitor actually reaching a section.
export function useScrollSpy(
  ids: readonly string[],
  onChange?: (id: string) => void,
): string | null {
  const [activeId, setActiveId] = useState<string | null>(ids[0] ?? null);
  const idKey = ids.join("\n");
  const reportChange = useEffectEvent((id: string) => onChange?.(id));

  useEffect(() => {
    const order = idKey ? idKey.split("\n") : [];
    const elements = order
      .map((id) => document.getElementById(id))
      .filter((element): element is HTMLElement => element !== null);
    if (elements.length === 0) return;

    const visible = new Set<string>();
    let reported: string | null = null;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        const current = order.find((id) => visible.has(id));
        if (!current) return;
        setActiveId(current);
        if (current !== reported) {
          reported = current;
          reportChange(current);
        }
      },
      { rootMargin: ACTIVE_BAND },
    );
    for (const element of elements) observer.observe(element);
    return () => observer.disconnect();
  }, [idKey]);

  return activeId;
}
