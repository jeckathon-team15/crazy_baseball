import { SCORE_RANGE } from "@/lib/config";
import { normalizeTeam, timestamp, type GameRecord } from "./game-results";

export type FanPost = {
  source: string;
  postId: string;
  gameId: string;
  team: string;
  teamTag: string;
  publishedAt: string;
  title: string;
  text: string;
  url: string;
};

export type Sentiment = "positive" | "neutral" | "negative" | "uncertain";
export type Topic = "타격" | "선발" | "불펜" | "수비" | "감독 운용" | "기타";

export type PostClassification = {
  source: string;
  postId: string;
  relevant: boolean;
  sentiment: Sentiment;
  topic: Topic;
};

export type SentimentSummary = {
  validCount: number;
  positive: number;
  neutral: number;
  negative: number;
  uncertain: number;
  score: number | null;
  topTopic: Topic | null;
  negativeTopTopic: Topic | null;
};

const sentiments = new Set<Sentiment>(["positive", "neutral", "negative", "uncertain"]);
const topics = new Set<Topic>(["타격", "선발", "불펜", "수비", "감독 운용", "기타"]);

export function selectGamePosts(
  posts: FanPost[],
  game: GameRecord,
  allGames: GameRecord[],
  team: string,
  asOf: string,
  options: { windowHours: number; maxPosts: number },
): FanPost[] {
  const target = normalizeTeam(team);
  const end = game.endsAt ? timestamp(game.endsAt) : null;
  const cutoff = timestamp(asOf);
  if (
    !target || game.status !== "finished" || end === null || cutoff === null ||
    ![normalizeTeam(game.homeTeam), normalizeTeam(game.awayTeam)].includes(target) ||
    !Number.isFinite(options.windowHours) || options.windowHours <= 0 ||
    !Number.isInteger(options.maxPosts) || options.maxPosts < 1
  ) {
    return [];
  }

  const nextStart = allGames
    .filter((next) =>
      next.gameId !== game.gameId && next.status !== "cancelled" &&
      [normalizeTeam(next.homeTeam), normalizeTeam(next.awayTeam)].includes(target),
    )
    .map((next) => timestamp(next.startsAt))
    .filter((start): start is number => start !== null && start >= end)
    .sort((a, b) => a - b)[0] ?? Infinity;
  const windowEnd = Math.min(end + options.windowHours * 60 * 60 * 1000, nextStart);

  const ordered = posts.filter((post) => {
    const published = timestamp(post.publishedAt);
    return (
      post.source.trim().length > 0 && post.postId.trim().length > 0 &&
      post.gameId === game.gameId && normalizeTeam(post.team) === target &&
      normalizeTeam(post.teamTag) === target && published !== null &&
      published >= end && published < windowEnd && published <= cutoff &&
      (post.title.trim().length > 0 || post.text.trim().length > 0)
    );
  }).sort((a, b) =>
    Date.parse(a.publishedAt) - Date.parse(b.publishedAt) ||
    a.source.localeCompare(b.source) || a.postId.localeCompare(b.postId),
  );

  const ids = new Set<string>();
  const texts = new Set<string>();
  const unique = ordered.filter((post) => {
    const id = JSON.stringify([post.source, post.postId]);
    const content = (post.text.trim() || post.title.trim())
      .normalize("NFKC").replace(/\s+/g, " ").toLowerCase();
    if (ids.has(id) || texts.has(content)) return false;
    ids.add(id);
    texts.add(content);
    return true;
  });

  if (unique.length <= options.maxPosts) return unique;
  const effectiveEnd = Math.min(windowEnd, cutoff + 1);
  const buckets = new Map<number, FanPost[]>();
  for (const post of unique) {
    const bucket = Math.floor(
      (Date.parse(post.publishedAt) - end) / (effectiveEnd - end) * options.maxPosts,
    );
    const items = buckets.get(bucket) ?? [];
    items.push(post);
    buckets.set(bucket, items);
  }
  const sampled: FanPost[] = [];
  const groups = [...buckets.values()];
  for (let index = 0; sampled.length < options.maxPosts; index++) {
    let added = false;
    for (const group of groups) {
      if (group[index]) {
        sampled.push(group[index]);
        added = true;
      }
      if (sampled.length === options.maxPosts) break;
    }
    if (!added) break;
  }
  return sampled.sort((a, b) => Date.parse(a.publishedAt) - Date.parse(b.publishedAt));
}

export function summarizeSentiment(
  posts: FanPost[],
  classifications: PostClassification[],
  minimumPosts: number,
): SentimentSummary {
  const byId = new Map<string, PostClassification | null>();
  for (const item of classifications) {
    const key = JSON.stringify([item.source, item.postId]);
    if (byId.has(key)) {
      byId.set(key, null);
    } else {
      byId.set(key, item);
    }
  }

  const counts = { positive: 0, neutral: 0, negative: 0, uncertain: 0 };
  const topicCounts = new Map<Topic, number>();
  const negativeTopicCounts = new Map<Topic, number>();
  for (const post of posts) {
    const item = byId.get(JSON.stringify([post.source, post.postId]));
    if (!item || typeof item.relevant !== "boolean" || !sentiments.has(item.sentiment) || !topics.has(item.topic)) {
      counts.uncertain += 1;
      continue;
    }
    if (!item.relevant) continue;
    counts[item.sentiment] += 1;
    if (item.sentiment === "uncertain") continue;
    topicCounts.set(item.topic, (topicCounts.get(item.topic) ?? 0) + 1);
    if (item.sentiment === "negative") {
      negativeTopicCounts.set(item.topic, (negativeTopicCounts.get(item.topic) ?? 0) + 1);
    }
  }
  const validCount = counts.positive + counts.neutral + counts.negative;
  const top = (countsByTopic: Map<Topic, number>) =>
    [...countsByTopic.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
  return {
    ...counts,
    validCount,
    score: validCount >= minimumPosts && validCount > 0
      ? SCORE_RANGE.max * (counts.positive - counts.negative) / validCount
      : null,
    topTopic: top(topicCounts),
    negativeTopTopic: top(negativeTopicCounts),
  };
}
