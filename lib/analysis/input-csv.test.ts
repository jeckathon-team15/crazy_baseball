import assert from "node:assert/strict";
import { test } from "node:test";
import { parseGameRecords, parseFanPosts, parsePlayerRecords } from "./input-csv";

test("accepts a completed game with zero scores and rejects a missing time zone", () => {
  const header = "gameId,date,homeTeam,awayTeam,homeScore,awayScore,status,startsAt,endsAt";
  const row = "g1,2026-10-01,한화,삼성,0,0,finished,2026-10-01T18:30:00+09:00,2026-10-01T21:30:00+09:00";
  const games = parseGameRecords(`${header}\n${row}\n`);
  assert.equal(games[0].homeScore, 0);
  assert.equal(games[0].awayScore, 0);
  assert.throws(() => parseGameRecords(`${header}\n${row.replace("21:30:00+09:00", "21:30:00")}\n`), /시각/);
  assert.throws(() => parseGameRecords(`${header}\n${row.replace("2026-10-01,", "2026-99-01,")}\n`), /날짜/);
  assert.throws(() => parseGameRecords(`${header}\n${row.replace("2026-10-01,", "2026-10-02,")}\n`), /날짜/);
});

test("requires a valid team and explicit game identifier for a fan post", () => {
  const header = "source,postId,gameId,team,teamTag,publishedAt,title,text,url";
  const row = "mlbpark,1,g1,한화,한화,2026-10-01T22:00:00+09:00,반응,오늘은 아쉽다,";
  assert.equal(parseFanPosts(`${header}\n${row}\n`)[0].gameId, "g1");
  assert.throws(() => parseFanPosts(`${header}\n${row.replace(",g1,", ",,")}\n`), /gameId/);
  assert.throws(() => parseFanPosts(`${header}\n${row.replace("2026-10-01T22", "2026-02-30T22")}\n`), /시각/);
});

test("accepts a team tag surrounded by common bulletin-board brackets", () => {
  const header = "source,postId,gameId,team,teamTag,publishedAt,title,text,url";
  const row = "community,1,g1,삼성,[삼성],2026-10-01T22:00:00+09:00,반응,오늘은 좋았다,";
  assert.equal(parseFanPosts(`${header}\n${row}\n`)[0].teamTag, "삼성 라이온즈");
});

test("rejects a player rating outside the existing contract", () => {
  const csv = "team,player,date,role,summary,rating\n한화,선수,2026-10-01,hitter,4타수 0안타,-3\n";
  assert.throws(() => parsePlayerRecords(csv), /rating/);
});
