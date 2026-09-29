export type Point = { x: number; y: number };

// How far the pointer must be for the pupils to reach their limit; closer, they move less, so
// they settle instead of snapping when the pointer passes over the robot.
export const EYE_REACH_PX = 240;

// Where the pupils look: toward the pointer, at most `maxPx` from the centre. The result is in
// the same units as `maxPx`, whatever the pointer and centre are measured in.
export function eyeOffset(pointer: Point, eyeCentre: Point, maxPx: number): Point {
  const dx = pointer.x - eyeCentre.x;
  const dy = pointer.y - eyeCentre.y;
  const distance = Math.hypot(dx, dy);
  if (distance === 0) return { x: 0, y: 0 };
  const length = maxPx * Math.min(1, distance / EYE_REACH_PX);
  return { x: (dx / distance) * length, y: (dy / distance) * length };
}
