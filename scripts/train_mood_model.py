"""Train a small multiclass mood model from explicitly reported feedback."""

import argparse
import csv
import json
import math
import os
import sys
import tempfile
import unicodedata
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import numpy as np


FEATURES = ["game_result", "run_difference", "positive_ratio", "negative_ratio"]
MOODS = ["매우 안 좋음", "안 좋음", "보통", "좋음", "매우 좋음"]
LEGACY_MOODS = {
    "천둥번개": "매우 안 좋음",
    "비": "안 좋음",
    "흐림": "보통",
    "구름 조금": "좋음",
    "맑음": "매우 좋음",
}
KOREA_TIME = timezone(timedelta(hours=9))
TEAM_ALIASES = [
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
REQUIRED_FIELDS = [
    "user_id", "game_id", "team", "game_date", "game_ended_at", "as_of",
    "mood_recorded_at", "team_score", "opponent_score",
    "positive", "neutral", "negative", "mood",
]


def parse_time(value, line):
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise ValueError(f"{line}행의 시각이 올바르지 않습니다.") from error
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ValueError(f"{line}행의 시각에는 시간대가 필요합니다.")
    return parsed


def parse_nonnegative_integer(value, field, line):
    try:
        if not value.strip().isdigit():
            raise ValueError
        return int(value)
    except (AttributeError, ValueError) as error:
        raise ValueError(f"{line}행의 {field} 값은 0 이상의 정수여야 합니다.") from error


def normalize_team(value, line):
    key = "".join(unicodedata.normalize("NFKC", value).split()).casefold()
    for name, aliases in TEAM_ALIASES:
        if key == "".join(name.split()).casefold() or key in aliases:
            return name
    raise ValueError(f"{line}행의 구단 이름을 확인할 수 없습니다.")


def load_feedback(path):
    records = []
    seen = set()
    dates_by_game = {}
    results_by_team_game = {}
    current_time = datetime.now(timezone.utc)
    with path.open("r", encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(file)
        if not reader.fieldnames or len(set(reader.fieldnames)) != len(reader.fieldnames):
            raise ValueError("CSV 헤더가 없거나 중복되었습니다.")
        missing = [field for field in REQUIRED_FIELDS if field not in reader.fieldnames]
        if missing:
            raise ValueError("CSV 필수 열이 없습니다: " + ", ".join(missing))
        for line, row in enumerate(reader, start=2):
            if None in row:
                raise ValueError(f"{line}행의 CSV 열 개수가 올바르지 않습니다.")
            if any(not isinstance(row.get(field), str) or not row[field].strip() for field in REQUIRED_FIELDS):
                raise ValueError(f"{line}행에 비어 있는 필수 값이 있습니다.")
            try:
                game_date = date.fromisoformat(row["game_date"])
            except ValueError as error:
                raise ValueError(f"{line}행의 경기 날짜가 올바르지 않습니다.") from error
            ended = parse_time(row["game_ended_at"], line)
            as_of = parse_time(row["as_of"], line)
            recorded = parse_time(row["mood_recorded_at"], line)
            if ended > as_of or as_of >= recorded:
                raise ValueError(f"{line}행의 경기·집계·기분 기록 시각 순서가 올바르지 않습니다.")
            if recorded > current_time:
                raise ValueError(f"{line}행의 기분 기록 시각이 미래입니다.")
            ended_date = ended.astimezone(KOREA_TIME).date()
            if ended_date not in (game_date, game_date + timedelta(days=1)):
                raise ValueError(f"{line}행의 경기 종료 날짜를 확인해 주세요.")
            if recorded.astimezone(KOREA_TIME).date() != game_date + timedelta(days=1):
                raise ValueError(f"{line}행의 기분 기록은 경기 다음 날이어야 합니다.")

            game_id = row["game_id"].strip()
            team = normalize_team(row["team"], line)
            previous_date = dates_by_game.setdefault(game_id, game_date)
            if previous_date != game_date:
                raise ValueError(f"{line}행의 경기 날짜가 같은 경기 ID의 다른 기록과 다릅니다.")
            key = (row["user_id"].strip(), game_id, team)
            if key in seen:
                raise ValueError(f"{line}행에 같은 사용자·경기의 기분 기록이 중복되었습니다.")
            seen.add(key)

            team_score = parse_nonnegative_integer(row["team_score"], "team_score", line)
            opponent_score = parse_nonnegative_integer(row["opponent_score"], "opponent_score", line)
            team_game = (game_id, team)
            result = (team_score, opponent_score, ended.astimezone(timezone.utc))
            previous_result = results_by_team_game.setdefault(team_game, result)
            if previous_result != result:
                raise ValueError(f"{line}행의 경기 기록이 같은 팀·경기의 다른 기록과 다릅니다.")
            positive = parse_nonnegative_integer(row["positive"], "positive", line)
            neutral = parse_nonnegative_integer(row["neutral"], "neutral", line)
            negative = parse_nonnegative_integer(row["negative"], "negative", line)
            count = positive + neutral + negative
            if count == 0:
                raise ValueError(f"{line}행에 유효한 커뮤니티 반응이 없습니다.")
            mood = row["mood"].strip()
            mood = LEGACY_MOODS.get(mood, mood)
            if mood not in MOODS:
                raise ValueError(f"{line}행의 기분 값이 올바르지 않습니다.")
            difference = team_score - opponent_score
            records.append({
                "date": game_date.isoformat(),
                "asOf": as_of,
                "recordedAt": recorded,
                "features": [int(np.sign(difference)), difference, positive / count, negative / count],
                "mood": mood,
            })
    if not records:
        raise ValueError("기분 기록 데이터가 없습니다.")
    return records


def evaluate(actual, predicted, baseline):
    labels = [mood for mood in MOODS if mood in set(actual) | set(predicted)]
    per_class = {}
    for label in labels:
        tp = sum(true == label and pred == label for true, pred in zip(actual, predicted))
        fp = sum(true != label and pred == label for true, pred in zip(actual, predicted))
        fn = sum(true == label and pred != label for true, pred in zip(actual, predicted))
        f1 = (2 * tp / (2 * tp + fp + fn)) if 2 * tp + fp + fn else 0.0
        per_class[label] = {"support": actual.count(label), "f1": f1}
    return {
        "accuracy": sum(true == pred for true, pred in zip(actual, predicted)) / len(actual),
        "macroF1": sum(item["f1"] for item in per_class.values()) / len(per_class),
        "majorityBaselineAccuracy": sum(true == baseline for true in actual) / len(actual),
        "classes": per_class,
    }


def train(records, args):
    dates = sorted({record["date"] for record in records})
    if len(dates) < 2:
        raise ValueError("시간 순 평가를 위해 서로 다른 경기 날짜가 최소 2개 필요합니다.")
    test_date_count = min(len(dates) - 1, max(1, math.ceil(len(dates) * args.test_fraction)))
    test_start = dates[-test_date_count]
    testing = [record for record in records if record["date"] >= test_start]
    training_candidates = [record for record in records if record["date"] < test_start]
    first_test_as_of = min(record["asOf"] for record in testing)
    training = [record for record in training_candidates if record["recordedAt"] <= first_test_as_of]
    excluded_late_labels = len(training_candidates) - len(training)
    if not training:
        raise ValueError("평가 시각보다 먼저 기록된 학습용 기분 데이터가 없습니다.")
    classes = [mood for mood in MOODS if any(record["mood"] == mood for record in training)]
    if args.source == "live" and len(classes) != len(MOODS):
        missing = ", ".join(mood for mood in MOODS if mood not in classes)
        raise ValueError(f"실제 모델의 학습 기간에는 5가지 기분 기록이 모두 필요합니다. 누락: {missing}")
    if len(classes) < 2:
        raise ValueError("학습 기간에 서로 다른 기분 기록이 최소 2개 필요합니다.")

    x_train = np.array([record["features"] for record in training], dtype=np.float64)
    x_test = np.array([record["features"] for record in testing], dtype=np.float64)
    means = x_train.mean(axis=0)
    scales = x_train.std(axis=0)
    scales[scales == 0] = 1
    x_train = (x_train - means) / scales
    x_test = (x_test - means) / scales
    class_index = {mood: index for index, mood in enumerate(classes)}
    y = np.array([class_index[record["mood"]] for record in training])
    one_hot = np.eye(len(classes))[y]
    weights = np.zeros((len(classes), len(FEATURES)), dtype=np.float64)
    intercepts = np.zeros(len(classes), dtype=np.float64)

    for _ in range(args.iterations):
        logits = x_train @ weights.T + intercepts
        logits -= logits.max(axis=1, keepdims=True)
        probabilities = np.exp(logits)
        probabilities /= probabilities.sum(axis=1, keepdims=True)
        errors = probabilities - one_hot
        weights -= args.learning_rate * ((errors.T @ x_train) / len(training) + args.l2 * weights)
        intercepts -= args.learning_rate * errors.mean(axis=0)
    if not np.isfinite(weights).all() or not np.isfinite(intercepts).all():
        raise ValueError("학습 결과가 유한하지 않습니다. 학습률을 낮춰 주세요.")

    predicted = [classes[index] for index in np.argmax(x_test @ weights.T + intercepts, axis=1)]
    actual = [record["mood"] for record in testing]
    counts = Counter(record["mood"] for record in training)
    test_counts = Counter(actual)
    baseline = max(classes, key=lambda mood: counts[mood])
    report = evaluate(actual, predicted, baseline)
    report.update({
        "trainCount": len(training),
        "testCount": len(testing),
        "testStart": test_start,
        "excludedLateLabels": excluded_late_labels,
        "trainClassCounts": {mood: counts[mood] for mood in classes},
        "testClassCounts": {mood: test_counts[mood] for mood in MOODS},
        "missingTrainClasses": [mood for mood in MOODS if counts[mood] == 0],
        "missingTestClasses": [mood for mood in MOODS if test_counts[mood] == 0],
    })
    return {
        "schemaVersion": 1,
        "algorithm": "softmax_logistic_regression",
        "source": args.source,
        "trainedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "trainedThrough": max(record["date"] for record in training),
        "features": FEATURES,
        "classes": classes,
        "means": means.tolist(),
        "scales": scales.tolist(),
        "coefficients": weights.tolist(),
        "intercepts": intercepts.tolist(),
        "evaluation": report,
    }


def save_model(path, model):
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temp_name = tempfile.mkstemp(prefix=".mood-model-", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as file:
            json.dump(model, file, ensure_ascii=False, indent=2, allow_nan=False)
            file.write("\n")
            file.flush()
            os.fsync(file.fileno())
        os.replace(temp_name, path)
    finally:
        if os.path.exists(temp_name):
            os.unlink(temp_name)


def main():
    parser = argparse.ArgumentParser(description="사용자가 기록한 기분으로 야친자 모델을 학습합니다.")
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--source", choices=["sample", "live"], required=True)
    parser.add_argument("--test-fraction", type=float, required=True)
    parser.add_argument("--iterations", type=int, required=True)
    parser.add_argument("--learning-rate", type=float, required=True)
    parser.add_argument("--l2", type=float, required=True)
    args = parser.parse_args()
    if not 0 < args.test_fraction < 1 or args.iterations < 1 or not math.isfinite(args.learning_rate) or args.learning_rate <= 0 or not math.isfinite(args.l2) or args.l2 < 0:
        parser.error("평가 비율·반복 횟수·학습률·정규화 값을 확인해 주세요.")
    if args.input.resolve() == args.output.resolve():
        parser.error("학습 데이터와 모델 파일의 경로가 같습니다.")
    try:
        records = load_feedback(args.input)
        model = train(records, args)
        save_model(args.output, model)
    except (ValueError, OSError, OverflowError) as error:
        print(str(error), file=sys.stderr)
        return 1
    print(json.dumps(model["evaluation"], ensure_ascii=False))
    print(f"모델 저장: {args.output}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
