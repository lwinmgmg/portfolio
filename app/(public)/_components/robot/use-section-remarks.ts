"use client";

import { useCallback, useState } from "react";

import {
  browserSessionStorage,
  readGreeted,
  readRemarked,
  writeRemarked,
} from "@/app/(public)/_components/chat/chat-storage";
import { useScrollSpy } from "@/app/(public)/_components/cv/use-scroll-spy";
import type { RemarkSection, SectionRemark } from "@/app/(public)/_components/robot/robot-remarks";

// The robot says one line the first time the visitor reaches a section, once per section per tab.
// The line stays while its section is current and closes when another one is, so no timer takes it
// away from a slow reader.
export function useSectionRemarks({
  sectionIds,
  remarks,
  blocked,
  holdsFocus,
}: {
  // Every section the page renders, in page order, so leaving a remark's section is noticed.
  sectionIds: readonly string[];
  remarks: readonly SectionRemark[];
  // The panel, the greeting or an answer preview has the robot's attention.
  blocked: boolean;
  // Focus is inside the bubble: the visitor is acting on it, so scrolling must not remove it.
  holdsFocus: () => boolean;
}): {
  remark: SectionRemark | null;
  dismiss: () => void;
  // The section was shown another way (the greeting's link), so it needs no remark.
  markSeen: (section: RemarkSection) => void;
} {
  const [remark, setRemark] = useState<SectionRemark | null>(null);

  useScrollSpy(sectionIds, (id) => {
    if (holdsFocus()) return;
    const next = remarks.find((candidate) => candidate.anchor === id);
    const storage = browserSessionStorage();
    // Before the greeting has had its turn in this tab, a remark would be replaced by it.
    if (!next || blocked || !readGreeted(storage) || readRemarked(storage).includes(next.section)) {
      setRemark(null);
      return;
    }
    // Written as the line appears, so a reload in this tab does not say it again.
    writeRemarked(storage, next.section);
    setRemark(next);
  });

  const dismiss = useCallback(() => setRemark(null), []);
  const markSeen = useCallback((section: RemarkSection) => {
    writeRemarked(browserSessionStorage(), section);
  }, []);

  return { remark, dismiss, markSeen };
}
