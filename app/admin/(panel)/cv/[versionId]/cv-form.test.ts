import { expect, test } from "bun:test";

import {
  createItemId,
  emptyTextToNull,
  moveItem,
  removeAt,
  replaceAt,
} from "@/app/admin/(panel)/cv/[versionId]/cv-form";

test("replaceAt patches one item and leaves the others untouched", () => {
  const items = [{ name: "a", level: 1 }, { name: "b", level: 2 }];
  const next = replaceAt(items, 1, { level: 3 });
  expect(next).toEqual([{ name: "a", level: 1 }, { name: "b", level: 3 }]);
  expect(next[0]).toBe(items[0]);
  expect(items[1]?.level).toBe(2);
});

test("removeAt drops one index and ignores an index out of range", () => {
  expect(removeAt(["a", "b", "c"], 1)).toEqual(["a", "c"]);
  expect(removeAt(["a"], 4)).toEqual(["a"]);
});

test("moveItem swaps neighbors and leaves the ends in place", () => {
  expect(moveItem(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
  expect(moveItem(["a", "b", "c"], 0, -1)).toEqual(["a", "b", "c"]);
  expect(moveItem(["a", "b", "c"], 2, 1)).toEqual(["a", "b", "c"]);
});

test("emptyTextToNull keeps a typed value and clears an empty field", () => {
  expect(emptyTextToNull("")).toBeNull();
  expect(emptyTextToNull("2021-04")).toBe("2021-04");
});

test("createItemId keeps the section prefix", () => {
  expect(createItemId("experience").startsWith("experience-")).toBe(true);
});
