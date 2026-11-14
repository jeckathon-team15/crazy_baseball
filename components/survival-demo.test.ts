import assert from "node:assert/strict";
import test from "node:test";
import { initialDemo, playDemoTurn } from "./survival-demo";

test("a risky baseball remark records an out and explaining the snack calms the character without erasing it", () => {
  const risky = playDemoTurn(initialDemo, "홈런볼 드실래요?");
  assert.equal(risky.outs, 1);
  assert.equal(risky.emotion, "annoyed");
  const recovery = playDemoTurn(risky, "야구 말고 과자 이야기였어요. 커피랑 드세요.");
  assert.equal(recovery.outs, 1);
  assert.ok(recovery.tension < risky.tension);
  assert.equal(recovery.last.out, false);
});

test("three outs end the conversation, further messages cannot change it", () => {
  let state = initialDemo;
  for (let i = 0; i < 3; i++) state = playDemoTurn(state, "홈런볼 드실래요?");
  assert.equal(state.outs, 3);
  assert.equal(state.ended, true);
  assert.deepEqual(playDemoTurn(state, "죄송해요"), state);
});

test("ordinary conversation and empty submissions are not arbitrary outs", () => {
  assert.deepEqual(playDemoTurn(initialDemo, "   "), initialDemo);
  const lunch = playDemoTurn(initialDemo, "점심 뭐 드시고 싶으세요?");
  assert.equal(lunch.outs, 0);
  assert.equal(lunch.last.out, false);
  assert.ok(lunch.tension < initialDemo.tension);
});
