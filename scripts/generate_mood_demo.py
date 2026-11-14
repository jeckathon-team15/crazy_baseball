"""Create fictional game, post and mood files for a reproducible demo."""

import argparse
import csv
import sys
from datetime import datetime, timedelta
from pathlib import Path


SAMPLE = Path(__file__).with_name("sample") / "mood-feedback.csv"
GAME_FIELDS = ["gameId", "date", "homeTeam", "awayTeam", "homeScore", "awayScore", "status", "startsAt", "endsAt"]
POST_FIELDS = ["source", "postId", "gameId", "team", "teamTag", "publishedAt", "title", "text", "url"]
FEEDBACK_FIELDS = ["user_id", "game_id", "team", "as_of", "mood_recorded_at", "mood"]


def write_csv(path, fields, rows):
    with path.open("x", encoding="utf-8", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def main():
    parser = argparse.ArgumentParser(description="가상의 야구 경기·게시글·기분 기록을 생성합니다.")
    parser.add_argument("--output-dir", required=True, type=Path)
    args = parser.parse_args()
    directory = args.output_dir.expanduser().resolve()
    paths = [directory / name for name in ("games.csv", "posts.csv", "feedback.csv")]
    if any(path.exists() for path in paths):
        raise ValueError("출력 경로에 같은 이름의 파일이 이미 있습니다. 빈 디렉터리를 선택해 주세요.")
    with SAMPLE.open(encoding="utf-8-sig", newline="") as file:
        feedback = list(csv.DictReader(file))
    games = {}
    for row in feedback:
        game_id = row["game_id"]
        signature = (row["game_date"], row["team_score"], row["opponent_score"], row["game_ended_at"])
        if game_id in games and games[game_id][0] != signature:
            raise ValueError("가상 샘플의 경기 결과가 서로 다릅니다.")
        games[game_id] = (signature, row)

    game_rows = []
    post_rows = []
    for game_id, (signature, row) in games.items():
        game_date, team_score, opponent_score, ended = signature
        game_rows.append({
            "gameId": game_id, "date": game_date, "homeTeam": "한화", "awayTeam": "삼성",
            "homeScore": team_score, "awayScore": opponent_score, "status": "finished",
            "startsAt": f"{game_date}T18:30:00+09:00", "endsAt": ended,
        })
        ended_at = datetime.fromisoformat(ended)
        position = 0
        for sentiment, title, text in [
            ("positive", "선발", "선발이 잘 던졌다"),
            ("neutral", "기록", "경기 결과 기록"),
            ("negative", "타격", "타격이 아쉽다"),
        ]:
            for number in range(int(row[sentiment])):
                position += 1
                post_rows.append({
                    "source": "sample", "postId": f"{game_id}-{sentiment}-{number + 1}",
                    "gameId": game_id, "team": "한화", "teamTag": "한화",
                    "publishedAt": (ended_at + timedelta(minutes=position)).isoformat(),
                    "title": title, "text": f"{text} 가상 반응 {number + 1}", "url": "",
                })
    feedback_rows = [{field: row[field] for field in FEEDBACK_FIELDS} for row in feedback]
    directory.mkdir(parents=True, exist_ok=True)
    for path, fields, rows in zip(paths, [GAME_FIELDS, POST_FIELDS, FEEDBACK_FIELDS],
                                  [game_rows, post_rows, feedback_rows]):
        write_csv(path, fields, rows)
    print(f"가상 데이터 저장: {directory} (경기 {len(game_rows)}, 게시글 {len(post_rows)}, 기분 기록 {len(feedback_rows)})")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, KeyError) as error:
        print(f"가상 데이터 생성 실패: {error}", file=sys.stderr)
        sys.exit(1)
