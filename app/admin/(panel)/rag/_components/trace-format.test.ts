import { expect, test } from "bun:test";

import {
  contributionLabel,
  formatMs,
  formatScore,
  timingBar,
} from "@/app/admin/(panel)/rag/_components/trace-format";

test("formatMs keeps a decimal for short stages and switches to seconds", () => {
  expect(formatMs(0.04)).toBe("0.0 ms");
  expect(formatMs(3.46)).toBe("3.5 ms");
  expect(formatMs(812.4)).toBe("812 ms");
  expect(formatMs(1534)).toBe("1.53 s");
});

test("formatScore shows four decimals and a dash for no score", () => {
  expect(formatScore(1 / 61)).toBe("0.0164");
  expect(formatScore(7.25)).toBe("7.2500");
  expect(formatScore(null)).toBe("—");
});

test("contributionLabel lists each list and rank", () => {
  expect(
    contributionLabel([
      { list: "vector:q0", rank: 3 },
      { list: "bm25:q0", rank: 1 },
    ]),
  ).toBe("vector:q0#3, bm25:q0#1");
  expect(contributionLabel([])).toBe("");
});

test("timingBar places a stage on the trace axis", () => {
  expect(timingBar({ startedAt: 250, durationMs: 500 }, 1000)).toEqual({
    leftPercent: 25,
    widthPercent: 50,
  });
});

test("timingBar keeps tiny stages visible and inside the axis", () => {
  expect(timingBar({ startedAt: 10, durationMs: 0.01 }, 1000)).toEqual({
    leftPercent: 1,
    widthPercent: 0.5,
  });
  const late = timingBar({ startedAt: 980, durationMs: 50 }, 1000);
  expect(late).toEqual({ leftPercent: 98, widthPercent: 2 });
  expect(timingBar({ startedAt: 0, durationMs: 0 }, 0)).toEqual({ leftPercent: 0, widthPercent: 0.5 });
});
