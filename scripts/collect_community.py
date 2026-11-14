"""Collect team-tagged posts from an authorized HTML board into the app's CSV format.

The board must expose a team tag, a stable post URL and a complete posting date
and time. The script never collects author profiles or comments.
"""

import argparse
import csv
import os
import re
import sys
import tempfile
import time
from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, parse_qsl, urlencode, urljoin, urlsplit, urlunsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener
from urllib.robotparser import RobotFileParser

try:
    from scripts.analyze_team_posts import normalize_team_tag, parse_time
except ModuleNotFoundError:
    from analyze_team_posts import normalize_team_tag, parse_time


USER_AGENT = "baseball-idiots-collector/1.0"
MAX_BYTES = 2 * 1024 * 1024
FIELDS = ["source", "postId", "gameId", "team", "teamTag", "publishedAt", "title", "text", "url"]
GAME_FIELDS = ["gameId", "date", "homeTeam", "awayTeam", "homeScore", "awayScore", "status", "startsAt", "endsAt"]
KST = timezone(timedelta(hours=9))


def absolute_post_time(value):
    """Accept full dates only; never guess the day of a time-only post."""
    value = value.strip()
    match = re.search(r"\b(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?(Z|[+-]\d{2}:\d{2})?", value)
    if not match:
        return None
    year, month, day, hour, minute, second, offset = match.groups()
    raw = f"{int(year):04d}-{int(month):02d}-{int(day):02d}T{int(hour):02d}:{int(minute):02d}:{int(second or 0):02d}{offset or '+09:00'}"
    try:
        return parse_time(raw).isoformat()
    except ValueError:
        return None


def origin(url):
    parsed = urlsplit(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("주소는 사용자 정보가 없는 HTTP(S) URL이어야 합니다.")
    return parsed.scheme.lower(), parsed.netloc.lower()


def post_id(url):
    parsed = urlsplit(url)
    params = parse_qs(parsed.query)
    for key in ("id", "no", "num", "seq", "idx"):
        value = params.get(key, [""])[0]
        if re.fullmatch(r"[A-Za-z0-9_-]{1,128}", value):
            return value
    last = parsed.path.rstrip("/").split("/")[-1]
    return last if re.fullmatch(r"\d{1,30}", last) else None


class BoardParser(HTMLParser):
    def __init__(self, board_url):
        super().__init__(convert_charrefs=True)
        self.board_url = board_url
        self.board_origin = origin(board_url)
        self.rows = []
        self.row = None
        self.stack = []

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        if tag == "tr":
            self.row = {"team": attrs.get("data-team", ""), "times": [], "title": "", "href": ""}
            self.stack = []
        if self.row is None:
            return
        if tag in {"br", "img", "input", "meta", "link", "hr", "wbr"}:
            return
        self.stack.append({"tag": tag, "attrs": attrs, "text": []})
        classes = set(attrs.get("class", "").split())
        keys = ["datetime", "data-published-at"]
        if tag == "time" or classes & {"date", "time", "datetime", "regdate", "timestamp"}:
            keys.append("title")
        for key in keys:
            if attrs.get(key):
                self.row["times"].append(attrs[key])

    def handle_startendtag(self, tag, attributes):
        self.handle_starttag(tag, attributes)
        if self.stack and self.stack[-1]["tag"] == tag:
            self.handle_endtag(tag)

    def handle_data(self, text):
        if self.row is not None:
            for node in self.stack:
                node["text"].append(text)

    def handle_endtag(self, tag):
        if self.row is None:
            return
        if not any(node["tag"] == tag for node in self.stack):
            return
        while self.stack:
            node = self.stack.pop()
            classes = set(node["attrs"].get("class", "").split())
            text = " ".join(" ".join(node["text"]).split())
            if classes & {"word", "team", "team-tag", "category", "subject-category"} and normalize_team_tag(text):
                self.row["team"] = text
            if node["tag"] == "a" and classes & {"txt", "title", "subject", "post-title"} and node["attrs"].get("href"):
                self.row["title"] = text[:500]
                self.row["href"] = node["attrs"]["href"]
            if node["tag"] == "time" or classes & {"date", "time", "datetime", "regdate", "timestamp"}:
                self.row["times"].append(text)
            if node["tag"] == tag:
                break
        if tag == "tr":
            self.finish_row()
            self.row = None
            self.stack = []

    def finish_row(self):
        team = normalize_team_tag(self.row["team"])
        published = next((parsed for value in self.row["times"] if (parsed := absolute_post_time(value))), None)
        if not team or not published or not self.row["href"] or not self.row["title"]:
            return
        url = urljoin(self.board_url, self.row["href"])
        try:
            if origin(url) != self.board_origin:
                return
        except ValueError:
            return
        identifier = post_id(url)
        if not identifier:
            return
        self.rows.append({"postId": identifier, "teamTag": team, "publishedAt": published,
                          "title": self.row["title"], "text": "", "url": url})


def extract_posts(html, board_url):
    parser = BoardParser(board_url)
    parser.feed(html)
    return parser.rows


def load_games(path):
    with Path(path).open("r", encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(file)
        headers = reader.fieldnames or []
        if len(headers) != len(set(headers)) or not set(GAME_FIELDS).issubset(headers):
            raise ValueError("경기 CSV의 필수 열이 없거나 중복되었습니다.")
        games = list(reader)
    seen = set()
    for row in games:
        if None in row or any(row.get(key) is None for key in GAME_FIELDS):
            raise ValueError("경기 CSV의 열 개수가 올바르지 않습니다.")
        for key in GAME_FIELDS:
            row[key] = row[key].strip()
        if not row["gameId"] or row["gameId"] in seen:
            raise ValueError("경기 ID가 없거나 중복되었습니다.")
        seen.add(row["gameId"])
        try:
            datetime.strptime(row["date"], "%Y-%m-%d")
            start = parse_time(row["startsAt"])
            home, away = normalize_team_tag(row["homeTeam"]), normalize_team_tag(row["awayTeam"])
            if not home or not away or home == away or row["status"] not in {"finished", "scheduled", "cancelled"}:
                raise ValueError("팀 또는 경기 상태 오류")
            if row["status"] == "finished":
                end = parse_time(row["endsAt"])
                if end < start or not all(re.fullmatch(r"\d+", row[key]) for key in ("homeScore", "awayScore")):
                    raise ValueError("경기 종료 시각 또는 점수 오류")
        except ValueError as error:
            raise ValueError(f"경기 CSV의 {row['gameId']} 기록을 확인해 주세요: {error}") from error
    return games


def match_posts(posts, games, as_of, source, window_hours):
    if as_of.tzinfo is None or as_of.utcoffset() is None or window_hours <= 0:
        raise ValueError("기준 시각 또는 수집 기간이 올바르지 않습니다.")
    prepared = []
    for game in games:
        home, away = normalize_team_tag(game["homeTeam"]), normalize_team_tag(game["awayTeam"])
        start = parse_time(game["startsAt"])
        end = parse_time(game["endsAt"]) if game["status"] == "finished" else None
        prepared.append((game, {home, away}, start, end))
    result, seen = [], set()
    for post in posts:
        team = normalize_team_tag(post["teamTag"])
        written = parse_time(post["publishedAt"])
        if not team or written > as_of or post["postId"] in seen:
            continue
        candidates = []
        for game, teams, _, end in prepared:
            if team not in teams or end is None or end > as_of:
                continue
            next_starts = [start for other, other_teams, start, _ in prepared
                           if other["gameId"] != game["gameId"] and other["status"] != "cancelled"
                           and team in other_teams and start >= end]
            limit = min([end + timedelta(hours=window_hours)] + next_starts)
            if end <= written < limit:
                candidates.append(game)
        if len(candidates) != 1:
            continue
        seen.add(post["postId"])
        result.append({"source": source, "postId": post["postId"], "gameId": candidates[0]["gameId"],
                       "team": team, "teamTag": team, "publishedAt": post["publishedAt"],
                       "title": post["title"], "text": post["text"], "url": post["url"]})
    return result


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def fetch_url(url):
    request = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/html,text/plain;q=0.9,*/*;q=0.1"})
    with build_opener(NoRedirect()).open(request, timeout=15) as response:
        data = response.read(MAX_BYTES + 1)
        if len(data) > MAX_BYTES:
            raise ValueError("응답 크기가 2 MiB를 초과했습니다.")
        charset = response.headers.get_content_charset()
        if not charset:
            match = re.search(br"charset\s*=\s*['\"]?([\w-]+)", data[:4096], re.I)
            charset = match.group(1).decode("ascii") if match else "utf-8"
        try:
            return data.decode(charset)
        except (UnicodeDecodeError, LookupError):
            return data.decode("cp949")


def page_url(url, page, page_parameter, page_step):
    if page == 0:
        return url
    parts = urlsplit(url)
    query = [(key, value) for key, value in parse_qsl(parts.query, keep_blank_values=True) if key != page_parameter]
    query.append((page_parameter, str(page * page_step + 1)))
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), ""))


def collect(board_url, games, as_of, source, pages, delay_seconds, window_hours,
            fetch=fetch_url, page_parameter="p", page_step=30):
    scheme, host = origin(board_url)
    robots_url = f"{scheme}://{host}/robots.txt"
    try:
        robots_text = fetch(robots_url)
    except HTTPError as error:
        if error.code != 404:
            raise
        robots_text = ""
    robots = RobotFileParser()
    robots.set_url(robots_url)
    robots.parse(robots_text.splitlines())
    crawl_delay = robots.crawl_delay(USER_AGENT) or 0
    rate = robots.request_rate(USER_AGENT)
    if rate and rate.requests > 0:
        crawl_delay = max(crawl_delay, rate.seconds / rate.requests)
    delay_seconds = max(delay_seconds, crawl_delay)
    posts = []
    for page in range(pages):
        url = page_url(board_url, page, page_parameter, page_step)
        if not robots.can_fetch(USER_AGENT, url):
            raise ValueError("robots.txt에서 게시판 자동 수집을 허용하지 않습니다.")
        if delay_seconds:
            time.sleep(delay_seconds)
        items = extract_posts(fetch(url), board_url)
        if not items:
            break
        posts.extend(items)
    return match_posts(posts, games, as_of, source, window_hours)


def save_csv(path, rows):
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", newline="", dir=target.parent, delete=False) as file:
            temporary = file.name
            writer = csv.DictWriter(file, fieldnames=FIELDS)
            writer.writeheader()
            writer.writerows(rows)
        os.replace(temporary, target)
    finally:
        if temporary and os.path.exists(temporary):
            os.unlink(temporary)


def main(argv=None):
    parser = argparse.ArgumentParser(description="이용 허가를 받은 게시판에서 구단 말머리 글을 수집합니다.")
    parser.add_argument("--board-url", required=True, help="수집이 허가된 게시판의 목록 URL")
    parser.add_argument("--games", required=True, help="경기 ID와 검증된 종료 시각이 있는 경기 CSV")
    parser.add_argument("--output", required=True, help="임시 게시글 CSV 저장 경로")
    parser.add_argument("--source", required=True, help="게시판 출처 식별자")
    parser.add_argument("--authorized", action="store_true", help="해당 게시판에서 자동 수집이 허가되었음을 확인")
    parser.add_argument("--pages", type=int, default=1)
    parser.add_argument("--delay-seconds", type=float, default=2)
    parser.add_argument("--window-hours", type=float, default=12)
    parser.add_argument("--page-parameter", default="p")
    parser.add_argument("--page-step", type=int, default=30)
    parser.add_argument("--as-of", help="시간대가 있는 기준 시각; 기본 현재 시각")
    args = parser.parse_args(argv)
    if not args.authorized:
        parser.error("게시판 운영자의 자동 수집 허가를 확인한 뒤 --authorized를 지정하세요.")
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,40}", args.source) or args.source.casefold() in {"sample", "demo"}:
        parser.error("실제 출처 식별자를 입력하세요.")
    if not 1 <= args.pages <= 10 or args.delay_seconds < 1 or not 0 < args.window_hours <= 24 or args.page_step < 1:
        parser.error("페이지 수는 1~10, 요청 간격은 1초 이상, 시간 창은 0~24시간이어야 합니다.")
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,40}", args.page_parameter):
        parser.error("페이지 매개변수가 올바르지 않습니다.")
    if Path(args.games).resolve() == Path(args.output).resolve():
        parser.error("경기 입력과 게시글 출력 경로가 같을 수 없습니다.")
    as_of = parse_time(args.as_of) if args.as_of else datetime.now(timezone.utc)
    if as_of > datetime.now(timezone.utc) + timedelta(seconds=30):
        parser.error("기준 시각은 미래일 수 없습니다.")
    rows = collect(args.board_url, load_games(args.games), as_of, args.source,
                   args.pages, args.delay_seconds, args.window_hours,
                   page_parameter=args.page_parameter, page_step=args.page_step)
    if not rows:
        raise ValueError("경기에 연결할 수 있는 게시글이 없어 기존 출력은 변경하지 않았습니다.")
    save_csv(args.output, rows)
    print(f"경기와 연결된 게시글 {len(rows)}건을 저장했습니다: {args.output}")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, csv.Error, URLError) as error:
        print(f"수집 실패: {error}", file=sys.stderr)
        sys.exit(1)
