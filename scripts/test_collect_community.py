import csv
import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError

from scripts.collect_community import collect, extract_posts, load_games, match_posts


BOARD = "https://example.org/board?category=baseball"
HTML = """
<table>
  <tr><td><span class="word">한화</span></td>
      <td><a class="txt" href="/post?id=101">오늘 타격 최고</a></td>
      <td><time datetime="2026-11-13T21:45:00+09:00">21:45</time></td></tr>
  <tr><td><span class="word">삼성</span></td>
      <td><a class="txt" href="/post?id=102">수비가 아쉽다</a></td>
      <td class="date">2026.11.13 22:00</td></tr>
  <tr><td><span class="word">잡담</span></td>
      <td><a class="txt" href="/post?id=103">잡담</a></td>
      <td class="date">2026.11.13 22:00</td></tr>
  <tr><td><span class="word">한화</span></td>
      <td><a class="txt" href="/post?id=104">시각 불명</a></td><td>22:30</td></tr>
  <tr><td><span class="word">한화</span></td>
      <td><a class="txt" href="https://other.example/post?id=105">외부 링크</a></td>
      <td class="date">2026.11.13 22:00</td></tr>
</table>
"""
GAMES = [
    {"gameId": "g1", "date": "2026-11-13", "homeTeam": "한화", "awayTeam": "삼성",
     "homeScore": "5", "awayScore": "2", "status": "finished",
     "startsAt": "2026-11-13T18:30:00+09:00", "endsAt": "2026-11-13T21:30:00+09:00"},
    {"gameId": "g2", "date": "2026-11-14", "homeTeam": "한화", "awayTeam": "삼성",
     "homeScore": "", "awayScore": "", "status": "scheduled",
     "startsAt": "2026-11-14T08:00:00+09:00", "endsAt": ""},
]
AS_OF = datetime.fromisoformat("2026-11-14T09:00:00+09:00")


class CollectorTest(unittest.TestCase):
    def test_extracts_only_recognized_team_rows_with_exact_dates_and_same_origin(self):
        posts = extract_posts(HTML, BOARD)
        self.assertEqual([post["postId"] for post in posts], ["101", "102"])
        self.assertEqual(posts[0]["teamTag"], "한화 이글스")
        self.assertEqual(posts[1]["publishedAt"], "2026-11-13T22:00:00+09:00")
        self.assertEqual(posts[0]["url"], "https://example.org/post?id=101")

    def test_does_not_treat_a_date_in_the_title_as_the_posting_time(self):
        html = ('<tr><td><span class="word">한화</span></td>'
                '<td><a class="txt" href="/post?id=1">2026-11-13 22:00 경기 최고</a></td>'
                '<td>22:10</td></tr>')
        self.assertEqual(extract_posts(html, BOARD), [])

    def test_assigns_only_post_game_window_before_next_game_and_deduplicates(self):
        posts = extract_posts(HTML, BOARD)
        late = {**posts[0], "postId": "106", "publishedAt": "2026-11-14T08:00:00+09:00"}
        early = {**posts[0], "postId": "107", "publishedAt": "2026-11-13T21:29:00+09:00"}
        future = {**posts[0], "postId": "108", "publishedAt": "2026-11-14T10:00:00+09:00"}
        result = match_posts(posts + [posts[0], late, early, future], GAMES, AS_OF, "community", 12)
        self.assertEqual([row["postId"] for row in result], ["101", "102"])
        self.assertEqual(result[0]["gameId"], "g1")
        self.assertEqual(result[0]["team"], "한화 이글스")
        self.assertEqual(result[0]["source"], "community")

    def test_excludes_posts_when_next_game_starts_at_previous_end(self):
        overlapping = {**GAMES[1], "startsAt": GAMES[0]["endsAt"]}
        self.assertEqual(match_posts(extract_posts(HTML, BOARD), [GAMES[0], overlapping], AS_OF, "community", 12), [])

    def test_rejects_conflicting_game_ids(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "games.csv"
            with path.open("w", encoding="utf-8", newline="") as file:
                writer = csv.DictWriter(file, fieldnames=GAMES[0].keys())
                writer.writeheader()
                writer.writerows([GAMES[0], {**GAMES[0], "homeScore": "10"}])
            with self.assertRaises(ValueError):
                load_games(path)

    def test_denied_robots_never_fetches_board(self):
        calls = []
        def fetch(url):
            calls.append(url)
            return "User-agent: *\nDisallow: /board\n"
        with self.assertRaisesRegex(ValueError, "robots"):
            collect(BOARD, GAMES, AS_OF, "community", 1, 0, 12, fetch=fetch)
        self.assertEqual(calls, ["https://example.org/robots.txt"])

    def test_successful_collection_and_rate_limit_failure(self):
        calls = []
        def fetch(url):
            calls.append(url)
            return "User-agent: *\nAllow: /\n" if url.endswith("/robots.txt") else HTML
        rows = collect(BOARD, GAMES, AS_OF, "community", 1, 0, 12, fetch=fetch)
        self.assertEqual(len(rows), 2)
        self.assertEqual(calls, ["https://example.org/robots.txt", BOARD])

        def blocked(url):
            if url.endswith("/robots.txt"):
                return "User-agent: *\nAllow: /\n"
            raise HTTPError(url, 429, "rate limited", None, None)
        with self.assertRaises(HTTPError):
            collect(BOARD, GAMES, AS_OF, "community", 1, 0, 12, fetch=blocked)

    def test_respects_the_robots_crawl_delay(self):
        def fetch(url):
            return "User-agent: *\nAllow: /\nCrawl-delay: 8\n" if url.endswith("/robots.txt") else HTML
        with patch("scripts.collect_community.time.sleep") as sleep:
            collect(BOARD, GAMES, AS_OF, "community", 1, 2, 12, fetch=fetch)
            sleep.assert_called_once_with(8)


if __name__ == "__main__":
    unittest.main()
