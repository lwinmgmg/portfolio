import { describe, expect, test } from "bun:test";

import { EnglishTextAnalyzer } from "@/server/rag/search/english-text-analyzer";
import { lightStem } from "@/server/rag/search/light-stemmer";
import { ENGLISH_STOPWORDS } from "@/server/rag/search/stopwords";

const analyzer = new EnglishTextAnalyzer();

describe("EnglishTextAnalyzer", () => {
  test("text is NFKC normalized and lowercased", () => {
    expect(analyzer.analyze("ＴｙｐｅＳｃｒｉｐｔ KOTLIN")).toEqual(["typescript", "kotlin"]);
  });

  test("language and framework names survive tokenization", () => {
    expect(analyzer.analyze("C++, C#, F# and Go")).toEqual(["c++", "c#", "f#", "go"]);
  });

  test("dotted tokens are kept and also emitted as their parts", () => {
    expect(analyzer.analyze("Node.js, Next.js and ASP.NET.")).toEqual([
      "node.js",
      "node",
      "js",
      "next.js",
      "next",
      "js",
      "asp.net",
      "asp",
      "net",
    ]);
  });

  test("punctuation splits tokens and trailing dots are dropped", () => {
    expect(analyzer.analyze("(React/Vue) - Kafka; Redis!")).toEqual(["react", "vue", "kafka", "redi"]);
  });

  test("stopwords are dropped", () => {
    expect(analyzer.analyze("What is the role of the team in this project?")).toEqual([
      "role",
      "team",
      "project",
    ]);
  });

  test("stopword parts of a dotted token are dropped, the token is kept", () => {
    expect(analyzer.analyze("i.e")).toEqual(["i.e", "e"]);
  });

  test("terms are stemmed and counted once per occurrence", () => {
    expect(analyzer.analyze("Built services, building databases")).toEqual([
      "built",
      "service",
      "build",
      "database",
    ]);
    expect(analyzer.analyze("api APIs api")).toEqual(["api", "api", "api"]);
  });

  test("the stopword list has about 120 words and no tech names", () => {
    expect(ENGLISH_STOPWORDS.size >= 110 && ENGLISH_STOPWORDS.size <= 140).toBe(true);
    for (const name of ["go", "c", "r", "net", "js"]) {
      expect(ENGLISH_STOPWORDS.has(name)).toBe(false);
    }
  });
});

describe("lightStem", () => {
  test("ies becomes y", () => {
    expect(lightStem("technologies")).toBe("technology");
    expect(lightStem("cities")).toBe("city");
  });

  test("es is removed after a sibilant", () => {
    expect(lightStem("processes")).toBe("process");
    expect(lightStem("boxes")).toBe("box");
    expect(lightStem("matches")).toBe("match");
    expect(lightStem("pushes")).toBe("push");
  });

  test("other es endings only lose the s", () => {
    expect(lightStem("databases")).toBe("database");
    expect(lightStem("services")).toBe("service");
  });

  test("s is removed, but not from ss or us", () => {
    expect(lightStem("apis")).toBe("api");
    expect(lightStem("engineers")).toBe("engineer");
    expect(lightStem("class")).toBe("class");
    expect(lightStem("status")).toBe("status");
  });

  test("ing and ed are removed", () => {
    expect(lightStem("building")).toBe("build");
    expect(lightStem("deployed")).toBe("deploy");
  });

  test("a stem shorter than 3 characters is never produced", () => {
    expect(lightStem("ties")).toBe("tie");
    expect(lightStem("aws")).toBe("aws");
    expect(lightStem("js")).toBe("js");
    expect(lightStem("king")).toBe("king");
    expect(lightStem("led")).toBe("led");
  });

  test("tokens with . + or # are not stemmed", () => {
    expect(lightStem("node.js")).toBe("node.js");
    expect(lightStem("services.net")).toBe("services.net");
    expect(lightStem("notepad++")).toBe("notepad++");
    expect(lightStem("fs#")).toBe("fs#");
  });

  test("words without a known suffix are unchanged", () => {
    expect(lightStem("kubernetes")).toBe("kubernete");
    expect(lightStem("python")).toBe("python");
  });
});
