"""Analyze supplied community posts by their team tag, without network access."""

import argparse
import csv
import json
import re
import sys
import unicodedata
from collections import Counter
from datetime import datetime
from pathlib import Path


TEAMS = [
    ("한화 이글스", ["한화", "이글스", "한화이글스", "hanwha", "hanwhaeagles"]),
    ("삼성 라이온즈", ["삼성", "라이온즈", "삼성라이온즈", "samsung", "samsunglions"]),
    ("KIA 타이거즈", ["kia", "기아", "타이거즈", "기아타이거즈", "kiatigers"]),
    ("LG 트윈스", ["lg", "엘지", "트윈스", "엘지트윈스", "lgtwins"]),
    ("두산 베어스", ["두산", "베어스", "두산베어스", "doosan", "doosanbears"]),
    ("롯데 자이언츠", ["롯데", "자이언츠", "롯데자이언츠", "lotte", "lottegiants"]),
    ("SSG 랜더스", ["ssg", "쓱", "랜더스", "ssg랜더스", "ssglanders"]),
    ("NC 다이노스", ["nc", "엔씨", "다이노스", "nc다이노스", "ncdinos"]),
    ("KT 위즈", ["kt", "케이티", "위즈", "kt위즈", "ktwiz"]),
    ("키움 히어로즈", ["키움", "히어로즈", "키움히어로즈", "kiwoom", "kiwoomheroes"]),
]

# The vocabulary follows the project's TypeScript classifier. This offline
# grouping also holds posts that name any other team, not just the opponent.
POSITIVE = re.compile(r"잘(?:했|하|한|\s*(?:던졌|막았|쳤|뛰었|맞았))|좋(?:다|았|아|네)|최고|훌륭|든든|멋(?:지|졌)|기쁘|짜릿|만족|완벽|대단|승리|이겼|호수비|수고했")
NEGATIVE = re.compile(r"아쉽|못(?:했|하|\s*(?:던졌|막았|쳤|이겼|뛰었))|불안|걱정|실망|답답|최악|짜증|화나|패배|연패|(?:^|[^가-힣])졌(?:다|네|어)|무너|실책|실수|아팠|나쁘")
NEUTRAL = re.compile(r"경기\s*(?:종료|결과|기록)|\d+\s*(?:대|:)\s*\d+")
UNRELATED = re.compile(r"티켓.{0,15}(?:양도|판매)|(?:양도|판매).{0,15}티켓|트레이드|이적설|광고|홍보")
AMBIGUOUS_NEGATION = re.compile(r"(?:패배|연패|실망|아쉽|실책)(?:하)?(?:지|진)\s*않|안\s*(?:아쉽|실망)")
NEGATIONS = [
    (re.compile(r"나쁘(?:지|지는)\s*않(?:았|아|다|네|는)?"), "positive"),
    (re.compile(r"안\s*좋(?:았|아|다|은|네|지)"), "negative"),
    (re.compile(r"안\s*잘(?:했|하|한|\s*(?:던졌|막았|쳤|뛰었|맞았))"), "negative"),
    (re.compile(r"좋(?:지|지는)\s*않(?:았|아|다|네|는)?"), "negative"),
    (re.compile(r"잘(?:하|했|해)(?:지|진)?\s*(?:못했|못하|않았|않)"), "negative"),
]
TOPICS = [
    ("감독 운용", re.compile(r"감독|교체|작전|운용|라인업")),
    ("불펜", re.compile(r"불펜|마무리|구원")),
    ("선발", re.compile(r"선발")),
    ("수비", re.compile(r"수비|실책|호수비")),
    ("타격", re.compile(r"타격|타선|타자|안타|홈런|득점|찬스")),
]
FIELDS = {
    "teamTag": ("teamTag", "team_tag", "category", "말머리", "머리글", "카테고리"),
    "title": ("title", "제목"),
    "text": ("text", "본문"),
    "source": ("source", "출처"),
    "postId": ("postId", "post_id", "id", "글번호"),
    "gameId": ("gameId", "game_id", "경기ID"),
    "publishedAt": ("publishedAt", "published_at", "작성시각"),
}


def tag_key(value):
    return "".join(unicodedata.normalize("NFKC", value).strip().strip("[]()【】<> ").casefold().split())


def normalize_team_tag(value):
    key = tag_key(value or "")
    for name, aliases in TEAMS:
        if key == tag_key(name) or key in aliases:
            return name
    return None


def field(row, name):
    for key in FIELDS[name]:
        value = row.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def parse_time(value):
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (TypeError, ValueError) as error:
        raise ValueError("시각은 시간대가 포함된 ISO 형식이어야 합니다.") from error
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ValueError("시각에는 시간대가 필요합니다.")
    return parsed


def mentions_another_team(text, team):
    if re.search(r"상대팀|상대\s*(?:선발|불펜|투수|타자)", text):
        return True
    for name, aliases in TEAMS:
        if name == team:
            continue
        for alias in set(aliases + name.casefold().split()):
            if alias.isascii() and alias.isalpha():
                if re.search(r"(?<![a-z])" + re.escape(alias) + r"(?![a-z])", text):
                    return True
            elif alias in text:
                return True
    return False


def classify_post(title, text, team):
    content = unicodedata.normalize("NFKC", f"{title}\n{text}").casefold()
    topic = next((name for name, pattern in TOPICS if pattern.search(content)), "기타")
    relevant = not bool(UNRELATED.search(content))
    team = normalize_team_tag(team)
    if not relevant or not team or mentions_another_team(content, team):
        return {"relevant": relevant, "sentiment": "uncertain", "topic": topic}
    if AMBIGUOUS_NEGATION.search(content):
        return {"relevant": True, "sentiment": "uncertain", "topic": topic}

    sentiments = set()
    rest = content
    for pattern, polarity in NEGATIONS:
        rest, count = pattern.subn(" ", rest)
        if count:
            sentiments.add(polarity)
    if POSITIVE.search(rest):
        sentiments.add("positive")
    if NEGATIVE.search(rest):
        sentiments.add("negative")
    if len(sentiments) > 1:
        sentiment = "uncertain"
    elif sentiments:
        sentiment = next(iter(sentiments))
    elif NEUTRAL.search(rest):
        sentiment = "neutral"
    else:
        sentiment = "uncertain"
    return {"relevant": True, "sentiment": sentiment, "topic": topic}


def analyze_rows(rows, minimum_posts=10, game_id=None, since=None, until=None):
    if not isinstance(minimum_posts, int) or minimum_posts < 1:
        raise ValueError("최소 게시글 수는 1 이상의 정수여야 합니다.")
    if since and until and since >= until:
        raise ValueError("시작 시각은 종료 시각보다 빨라야 합니다.")
    report = {
        "inputRows": 0, "skippedUnknownTag": 0, "skippedDuplicate": 0,
        "skippedFilter": 0, "skippedEmpty": 0, "minimumPosts": minimum_posts, "teams": {},
    }
    labels = []
    seen_ids = set()
    seen_texts = set()
    topics = {}
    negative_topics = {}

    for line, row in enumerate(rows, start=2):
        report["inputRows"] += 1
        team = normalize_team_tag(field(row, "teamTag"))
        if not team:
            report["skippedUnknownTag"] += 1
            continue
        if game_id:
            item_game_id = field(row, "gameId")
            if not item_game_id:
                raise ValueError(f"CSV {line}행에 경기 ID가 없습니다.")
            if item_game_id != game_id:
                report["skippedFilter"] += 1
                continue
        if since or until:
            raw_time = field(row, "publishedAt")
            if not raw_time:
                raise ValueError(f"CSV {line}행에 작성 시각이 없습니다.")
            written = parse_time(raw_time)
            if (since and written < since) or (until and written >= until):
                report["skippedFilter"] += 1
                continue
        title, text = field(row, "title"), field(row, "text")
        if not title and not text:
            report["skippedEmpty"] += 1
            continue
        source, post_id = field(row, "source"), field(row, "postId")
        identity = (source, post_id) if source and post_id else None
        content = " ".join(unicodedata.normalize("NFKC", text or title).casefold().split())
        content_key = (team, field(row, "gameId"), content)
        if identity and identity in seen_ids:
            report["skippedDuplicate"] += 1
            continue
        if identity:
            seen_ids.add(identity)
        classification = classify_post(title, text, team)
        # Preserve labels for identical posts with different IDs: the app
        # filters by match and time before applying its own deduplication.
        labels.append({"source": source, "postId": post_id, **classification})
        if content_key in seen_texts:
            report["skippedDuplicate"] += 1
            continue
        seen_texts.add(content_key)
        stats = report["teams"].setdefault(team, {
            "total": 0, "positive": 0, "neutral": 0, "negative": 0,
            "uncertain": 0, "excluded": 0,
        })
        stats["total"] += 1
        if not classification["relevant"]:
            stats["excluded"] += 1
        else:
            sentiment = classification["sentiment"]
            stats[sentiment] += 1
            if sentiment != "uncertain":
                topics.setdefault(team, Counter())[classification["topic"]] += 1
                if sentiment == "negative":
                    negative_topics.setdefault(team, Counter())[classification["topic"]] += 1

    def top(counter):
        return min(counter, key=lambda topic: (-counter[topic], topic)) if counter else None

    for team, stats in report["teams"].items():
        valid_count = stats["positive"] + stats["neutral"] + stats["negative"]
        stats["validCount"] = valid_count
        stats["score"] = 100 * (stats["positive"] - stats["negative"]) / valid_count if valid_count >= minimum_posts else None
        stats["topTopic"] = top(topics.get(team, {}))
        stats["negativeTopTopic"] = top(negative_topics.get(team, {}))
    report["teams"] = dict(sorted(report["teams"].items()))
    return report, labels


def load_csv(path):
    with path.open("r", encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(file)
        headers = reader.fieldnames
        if not headers or any(not name or not name.strip() for name in headers):
            raise ValueError("CSV 헤더가 없거나 중복되었습니다.")
        headers = [name.strip() for name in headers]
        if len(set(headers)) != len(headers):
            raise ValueError("CSV 헤더가 없거나 중복되었습니다.")
        reader.fieldnames = headers
        if not set(FIELDS["teamTag"]).intersection(headers):
            raise ValueError("CSV에 teamTag 또는 말머리 열이 필요합니다.")
        if not set(FIELDS["title"] + FIELDS["text"]).intersection(headers):
            raise ValueError("CSV에 제목 또는 본문 열이 필요합니다.")
        rows = list(reader)
        if any(None in row or any(value is None for value in row.values()) for row in rows):
            raise ValueError("CSV의 열 개수가 헤더와 다릅니다.")
        return rows


def main(argv=None):
    parser = argparse.ArgumentParser(description="CSV의 구단 말머리별 게시글 감성을 분석합니다.")
    parser.add_argument("--input", required=True, help="게시글 CSV 경로")
    parser.add_argument("--output", help="팀별 집계 JSON 저장 경로 (생략 시 표준 출력)")
    parser.add_argument("--labels-csv", help="기존 예보 파이프라인용 분류 CSV 경로")
    parser.add_argument("--minimum-posts", type=int, default=10, help="감성 점수를 계산할 최소 유효 글 수")
    parser.add_argument("--game-id", help="선택한 경기 ID의 글만 분석")
    parser.add_argument("--since", help="작성 시각 시작 (포함, 시간대 포함 ISO 형식)")
    parser.add_argument("--until", help="작성 시각 종료 (미포함, 시간대 포함 ISO 형식)")
    args = parser.parse_args(argv)
    source = Path(args.input).expanduser().resolve()
    output = Path(args.output).expanduser().resolve() if args.output else None
    labels_path = Path(args.labels_csv).expanduser().resolve() if args.labels_csv else None
    destinations = [path for path in (output, labels_path) if path is not None]
    if source in destinations or len(set(destinations)) != len(destinations):
        raise ValueError("입력 파일과 출력 파일의 경로는 서로 달라야 합니다.")
    since = parse_time(args.since) if args.since else None
    until = parse_time(args.until) if args.until else None
    report, labels = analyze_rows(load_csv(source), args.minimum_posts, args.game_id, since, until)
    if labels_path and any(not label["source"] or not label["postId"] for label in labels):
        raise ValueError("분류 CSV를 만들려면 모든 분석 대상 글에 source와 postId가 필요합니다.")
    content = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    if output:
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(content, encoding="utf-8")
    else:
        print(content, end="")
    if labels_path:
        labels_path.parent.mkdir(parents=True, exist_ok=True)
        with labels_path.open("w", encoding="utf-8", newline="") as file:
            writer = csv.DictWriter(file, fieldnames=["source", "postId", "relevant", "sentiment", "topic"])
            writer.writeheader()
            for label in labels:
                writer.writerow({**label, "relevant": str(label["relevant"]).lower()})


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, csv.Error) as error:
        print(f"분석 실패: {error}", file=sys.stderr)
        sys.exit(1)
