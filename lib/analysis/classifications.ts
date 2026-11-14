import type { FanPost, PostClassification, Sentiment, Topic } from "./fan-posts";

const sentiments = new Set<Sentiment>(["positive", "neutral", "negative", "uncertain"]);
const topics = new Set<Topic>(["타격", "선발", "불펜", "수비", "감독 운용", "기타"]);

export function parseClassifications(payload: unknown, posts: FanPost[]): PostClassification[] {
  const rows = payload && typeof payload === "object" && "posts" in payload && Array.isArray(payload.posts)
    ? payload.posts : [];
  const byId = new Map<string, unknown>();
  for (const row of rows) {
    if (!row || typeof row !== "object" || !("source" in row) || !("postId" in row) ||
        typeof row.source !== "string" || typeof row.postId !== "string") continue;
    const key = JSON.stringify([row.source, row.postId]);
    byId.set(key, byId.has(key) ? null : row);
  }

  return posts.map((post) => {
    const uncertain: PostClassification = {
      source: post.source, postId: post.postId, relevant: true, sentiment: "uncertain", topic: "기타",
    };
    const row = byId.get(JSON.stringify([post.source, post.postId]));
    if (!row || typeof row !== "object" || !("relevant" in row) ||
        !("sentiment" in row) || !("topic" in row) ||
        typeof row.relevant !== "boolean" ||
        typeof row.sentiment !== "string" || !sentiments.has(row.sentiment as Sentiment) ||
        typeof row.topic !== "string" || !topics.has(row.topic as Topic)) {
      return uncertain;
    }
    return {
      source: post.source,
      postId: post.postId,
      relevant: row.relevant,
      sentiment: row.sentiment as Sentiment,
      topic: row.topic as Topic,
    };
  });
}
