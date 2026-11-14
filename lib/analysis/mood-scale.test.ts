import assert from "node:assert/strict";
import { test } from "node:test";
import { moodFromScore } from "@/lib/config";

test("converts scores to five mood labels at their existing boundaries", () => {
  assert.deepEqual(
    [-100, -61, -60, -21, -20, 19, 20, 59, 60, 100].map(moodFromScore),
    ["매우 안 좋음", "매우 안 좋음", "안 좋음", "안 좋음", "보통", "보통", "좋음", "좋음", "매우 좋음", "매우 좋음"],
  );
});
