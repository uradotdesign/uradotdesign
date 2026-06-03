import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateReadingTime } from "../src/lib/reading-time.ts";

test("calculateReadingTime: returns 0 for empty / nullish input", () => {
  assert.equal(calculateReadingTime(""), 0);
  assert.equal(calculateReadingTime("   "), 0);
  assert.equal(calculateReadingTime(null), 0);
  assert.equal(calculateReadingTime(undefined), 0);
});

test("calculateReadingTime: floors at 1 minute for short text", () => {
  assert.equal(calculateReadingTime("hello world"), 1);
});

test("calculateReadingTime: strips HTML before counting words", () => {
  const words = Array.from({ length: 200 }, () => "word").join(" ");
  // 200 words wrapped in markup should still read as exactly 1 minute.
  assert.equal(calculateReadingTime(`<p class="x">${words}</p>`), 1);
});

test("calculateReadingTime: scales at ~200 wpm", () => {
  const text = Array.from({ length: 600 }, () => "word").join(" ");
  assert.equal(calculateReadingTime(text), 3);
});
