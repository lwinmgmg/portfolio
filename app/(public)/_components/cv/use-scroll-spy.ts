"use client";

import { useEffect, useState } from "react";

// A section is "current" while it crosses a thin band near the top of the viewport.
// Between sections the last match stays active, so the highlight never flickers off.
const ACTIVE_BAND = "-20% 0px -75% 0px";

export function useScrollSpy(ids: readonly string[]): string | null {
  const [activeId, setActiveId] = useState<string | null>(ids[0] ?? null);
  const idKey = ids.join("\n");

  useEffect(() => {
    const order = idKey ? idKey.split("\n") : [];
    const elements = order
      .map((id) => document.getElementById(id))
      .filter((element): element is HTMLElement => element !== null);
    if (elements.length === 0) return;

    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        const current = order.find((id) => visible.has(id));
        if (current) setActiveId(current);
      },
      { rootMargin: ACTIVE_BAND },
    );
    for (const element of elements) observer.observe(element);
    return () => observer.disconnect();
  }, [idKey]);

  return activeId;
}
