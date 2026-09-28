import { expect, test } from "bun:test";

import { createItemId, emptyTextToNull, moveItem } from "@/app/admin/(panel)/cv/[versionId]/cv-form";

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
