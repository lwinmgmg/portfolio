import { expect, test } from "bun:test";

import { PublicSessionLimiter } from "@/server/http/public-session-limiter";

test("allows 30 global issues in a minute and blocks the next", () => {
  let now = 1_000_000;
  const limiter = new PublicSessionLimiter({ now: () => now });

  for (let attempt = 0; attempt < 30; attempt += 1) {
    expect(limiter.allowIssue(null)).toBe(true);
  }
  expect(limiter.allowIssue(null)).toBe(false);

  now += 60_000;
  expect(limiter.allowIssue(null)).toBe(true);
});

test("the 11th issue for one IP is blocked while another IP still fits", () => {
  const limiter = new PublicSessionLimiter({
    now: () => 1_000_000,
    ipIssueLimit: 10,
    globalIssueLimit: 11,
  });

  for (let attempt = 0; attempt < 10; attempt += 1) {
    expect(limiter.allowIssue("203.0.113.5")).toBe(true);
  }
  expect(limiter.allowIssue("203.0.113.5")).toBe(false);
  expect(limiter.allowIssue("203.0.113.6")).toBe(true);
});

test("the IP map stops growing after 1024 keys and the global ceiling still blocks", () => {
  const limiter = new PublicSessionLimiter({
    now: () => 1_000_000,
    maxTrackedIps: 1024,
    globalIssueLimit: 1025,
    ipIssueLimit: 10,
  });

  for (let index = 0; index < 1024; index += 1) {
    expect(limiter.allowIssue(`203.0.113.${index}`)).toBe(true);
  }
  expect(limiter.trackedIssueIpCount()).toBe(1024);

  expect(limiter.allowIssue("198.51.100.1")).toBe(true);
  expect(limiter.trackedIssueIpCount()).toBe(1024);
  expect(limiter.allowIssue("198.51.100.2")).toBe(false);
  expect(limiter.trackedIssueIpCount()).toBe(1024);
});

test("failed lookups saturate per IP and for the whole site", () => {
  let now = 1_000_000;
  const limiter = new PublicSessionLimiter({ now: () => now });

  for (let attempt = 0; attempt < 60; attempt += 1) {
    expect(limiter.isLookupSaturated("203.0.113.5")).toBe(false);
    limiter.recordFailure("203.0.113.5");
  }
  expect(limiter.isLookupSaturated("203.0.113.5")).toBe(true);
  expect(limiter.isLookupSaturated("203.0.113.6")).toBe(false);

  now += 60_000;
  expect(limiter.isLookupSaturated("203.0.113.5")).toBe(false);

  const global = new PublicSessionLimiter({
    now: () => 1_000_000,
    globalFailureLimit: 300,
    ipFailureLimit: 1000,
  });
  for (let attempt = 0; attempt < 300; attempt += 1) {
    expect(global.isLookupSaturated(null)).toBe(false);
    global.recordFailure(null);
  }
  expect(global.isLookupSaturated(null)).toBe(true);
});
