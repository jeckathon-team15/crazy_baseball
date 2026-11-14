import type { FanPost, PostClassification, Sentiment, Topic } from "./fan-posts";
import { getTeamAliases, normalizeTeam } from "./game-results";

// A deliberately small, inspectable vocabulary. Ambiguous text is not counted as neutral.
const positive = /잘(?:했|하|한|\s*(?:던졌|막았|쳤|뛰었|맞았))|좋(?:다|았|아|네)|최고|훌륭|든든|멋(?:지|졌)|기쁘|짜릿|만족|완벽|대단|승리|이겼|호수비|수고했/;
const negative = /아쉽|못(?:했|하|\s*(?:던졌|막았|쳤|이겼|뛰었))|불안|걱정|실망|답답|최악|짜증|화나|패배|연패|(?:^|[^가-힣])졌(?:다|네|어)|무너|실책|실수|아팠|나쁘/;
const neutral = /경기\s*(?:종료|결과|기록)|\d+\s*(?:대|:)\s*\d+/;
const unrelated = /티켓.{0,15}(?:양도|판매)|(?:양도|판매).{0,15}티켓|트레이드|이적설|광고|홍보/;

function topicOf(text: string): Topic {
  if (/감독|교체|작전|운용|라인업/.test(text)) return "감독 운용";
  if (/불펜|마무리|구원/.test(text)) return "불펜";
  if (/선발/.test(text)) return "선발";
  if (/수비|실책|호수비/.test(text)) return "수비";
  if (/타격|타선|타자|안타|홈런|득점|찬스/.test(text)) return "타격";
  return "기타";
}

function mentionsOpponent(text: string, opponent: string): boolean {
  if (/상대팀|상대\s*(?:선발|불펜|투수|타자)/.test(text)) return true;
  return getTeamAliases(opponent).some((name) => {
    if (/^[a-z]+$/.test(name)) {
      return new RegExp(`(^|[^a-z])${name}([^a-z]|$)`, "i").test(text);
    }
    return text.includes(name);
  });
}

function classifySentiment(text: string): Sentiment {
  if (/(?:패배|연패|실망|아쉽|실책)(?:하)?(?:지|진)\s*않|안\s*(?:아쉽|실망)/.test(text)) {
    return "uncertain";
  }
  let hasPositive = false;
  let hasNegative = false;
  let rest = text;
  const replace = (pattern: RegExp, sentiment: "positive" | "negative") => {
    rest = rest.replace(pattern, () => {
      if (sentiment === "positive") hasPositive = true;
      else hasNegative = true;
      return " ";
    });
  };

  replace(/나쁘(?:지|지는)\s*않(?:았|아|다|네|는)?/g, "positive");
  replace(/안\s*좋(?:았|아|다|은|네|지)/g, "negative");
  replace(/안\s*잘(?:했|하|한|\s*(?:던졌|막았|쳤|뛰었|맞았))/g, "negative");
  replace(/좋(?:지|지는)\s*않(?:았|아|다|네|는)?/g, "negative");
  replace(/잘(?:하|했|해)(?:지|진)?\s*(?:못했|못하|않았|않)/g, "negative");
  hasPositive ||= positive.test(rest);
  hasNegative ||= negative.test(rest);

  if (hasPositive && hasNegative) return "uncertain";
  if (hasPositive) return "positive";
  if (hasNegative) return "negative";
  return neutral.test(rest) ? "neutral" : "uncertain";
}

export function classifyFanPostsByRules(
  posts: FanPost[],
  context: { team: string; opponent: string },
): PostClassification[] {
  return posts.map((post) => {
    const text = `${post.title}\n${post.text}`.normalize("NFKC").toLowerCase();
    const relevant = !unrelated.test(text);
    const team = normalizeTeam(context.team);
    const opponent = normalizeTeam(context.opponent);
    return {
      source: post.source,
      postId: post.postId,
      relevant,
      sentiment: !relevant || !team || !opponent || team === opponent || mentionsOpponent(text, opponent)
        ? "uncertain" : classifySentiment(text),
      topic: topicOf(text),
    };
  });
}
