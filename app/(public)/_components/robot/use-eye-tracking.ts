"use client";

import { useEffect, type RefObject } from "react";

import { eyeOffset, type Point } from "@/app/(public)/_components/robot/robot-eyes";

// A mouse or trackpad, and a visitor who has not asked for less motion. A phone never tracks.
const TRACKING_QUERY = "(pointer: fine) and (prefers-reduced-motion: no-preference)";

// In the robot's 100-unit drawing, about 2 px at launcher size: the pupils stay on the screen.
const MAX_OFFSET = 3;

// Where the eyes sit in the drawing, as a share of its width and height.
const EYES_AT = { x: 0.5, y: 0.42 };

// Points the robot's pupils at the pointer. It writes --eye-x / --eye-y on the SVG element (the
// stylesheet moves `pupil` by them), so pointer moves never re-render React.
export function useEyeTracking(robot: RefObject<SVGSVGElement | null>, enabled: boolean): void {
  useEffect(() => {
    const svg = robot.current;
    if (!enabled || !svg) return;
    const query = window.matchMedia(TRACKING_QUERY);
    let pointer: Point | null = null;
    let frame = 0;
    let listening = false;

    const look = () => {
      frame = 0;
      if (!pointer) return;
      const box = svg.getBoundingClientRect();
      const centre = { x: box.left + box.width * EYES_AT.x, y: box.top + box.height * EYES_AT.y };
      const { x, y } = eyeOffset(pointer, centre, MAX_OFFSET);
      svg.style.setProperty("--eye-x", `${x.toFixed(2)}px`);
      svg.style.setProperty("--eye-y", `${y.toFixed(2)}px`);
    };

    const onPointerMove = (event: PointerEvent) => {
      pointer = { x: event.clientX, y: event.clientY };
      if (frame === 0) frame = requestAnimationFrame(look);
    };

    const start = () => {
      if (listening) return;
      listening = true;
      window.addEventListener("pointermove", onPointerMove, { passive: true });
    };

    const stop = () => {
      if (!listening) return;
      listening = false;
      window.removeEventListener("pointermove", onPointerMove);
      cancelAnimationFrame(frame);
      frame = 0;
      svg.style.removeProperty("--eye-x");
      svg.style.removeProperty("--eye-y");
    };

    // The query can change while the page is open (reduced motion turned on, a mouse plugged in).
    const sync = () => {
      if (query.matches) start();
      else stop();
    };

    sync();
    query.addEventListener("change", sync);
    return () => {
      query.removeEventListener("change", sync);
      stop();
    };
  }, [robot, enabled]);
}
