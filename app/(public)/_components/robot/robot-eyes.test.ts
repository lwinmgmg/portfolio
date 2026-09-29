import { expect, test } from "bun:test";

import { EYE_REACH_PX, eyeOffset } from "@/app/(public)/_components/robot/robot-eyes";

const centre = { x: 100, y: 100 };

test("looks toward the pointer", () => {
  const right = eyeOffset({ x: 1000, y: 100 }, centre, 3);
  expect(right.x).toBeCloseTo(3);
  expect(right.y).toBeCloseTo(0);

  const upLeft = eyeOffset({ x: -900, y: -900 }, centre, 3);
  expect(upLeft.x).toBeLessThan(0);
  expect(upLeft.y).toBeLessThan(0);
  expect(upLeft.x).toBeCloseTo(upLeft.y);
});

test("never moves further than the limit", () => {
  for (const pointer of [
    { x: 5000, y: -3000 },
    { x: 100, y: 100 + EYE_REACH_PX * 10 },
    { x: -EYE_REACH_PX, y: 100 },
  ]) {
    const { x, y } = eyeOffset(pointer, centre, 3);
    expect(Math.hypot(x, y)).toBeLessThanOrEqual(3 + 1e-9);
  }
  const far = eyeOffset({ x: 5000, y: -3000 }, centre, 3);
  expect(Math.hypot(far.x, far.y)).toBeCloseTo(3);
});

test("moves less when the pointer is close", () => {
  const near = eyeOffset({ x: 100 + EYE_REACH_PX / 4, y: 100 }, centre, 4);
  expect(near.x).toBeCloseTo(1);
  expect(near.y).toBeCloseTo(0);
});

test("a pointer on the centre looks straight ahead", () => {
  expect(eyeOffset(centre, centre, 3)).toEqual({ x: 0, y: 0 });
});
