# 야친자 기분 예측 모델 기술 명세

## 목적과 현재 상태

경기 결과와 해당 경기 뒤 커뮤니티 반응을 입력으로, 이용자가 **경기 다음 날 직접 기록한 기분**을 예측한다. 기분 단계는 `매우 안 좋음`, `안 좋음`, `보통`, `좋음`, `매우 좋음`이다.

현재 제공되는 `scripts/sample/mood-model-demo.json`은 가상 경기·가상 게시글·가상 기분 기록으로 학습한 시연 모델이다. 실제 팬의 감정이나 실제 예측 성능을 나타내지 않으며 메인 화면의 실제 경기 예측에 적용되지 않는다. 허가된 게시판용 자동 수집 코드는 준비되어 있으나 수집 출처와 경기 종료 시각 공급원은 미설정이다. 이용자 기분 수집 화면과 실제 학습 모델은 아직 없다.

## 데이터 흐름

1. 경기 CSV, 팀 말머리가 포함된 게시글 CSV, 이용자의 기분 기록 CSV를 준비한다. 게시글과 기분 기록에는 정확한 경기 ID를 넣는다.
2. `scripts/analyze_team_posts.py`가 게시글을 사전·규칙 기반으로 분류하고 글별 분류 CSV를 만든다. 외부 AI API는 사용하지 않는다.
3. `scripts/build-mood-training.ts`가 경기, 글, 분류, 기분 기록을 경기 ID와 팀으로 결합해 학습용 CSV를 만든다. 팀 말머리와 경기 정보가 일치해야 한다.
4. `scripts/train_mood_model.py`가 CSV를 시간 순으로 학습·평가하고 모델 JSON을 저장한다.
5. 서버는 유효한 모델과 실제 경기·커뮤니티 집계가 일치할 때 해당 모델로 예측한다. 모델이 없으면 규칙 기반 예측을 사용한다.

게시글의 감성 분류 결과는 모델 입력이며, 이용자가 직접 기록한 기분이 학습 정답이다. 둘은 같은 데이터가 아니다.

## 모델 입력과 출력

| 입력 특성 | 계산 |
|---|---|
| `game_result` | 응원팀 관점의 승리 `1`, 무승부 `0`, 패배 `-1` |
| `run_difference` | 응원팀 득점 − 상대팀 득점 |
| `positive_ratio` | 긍정 게시글 수 ÷ 유효 게시글 수 |
| `negative_ratio` | 부정 게시글 수 ÷ 유효 게시글 수 |

유효 게시글은 긍정·중립·부정으로 분류된 글이다. 판정 보류나 경기와 무관한 글은 분모에서 제외한다. 출력은 학습된 기분 단계별 상대 확률과 가장 높은 단계다. 실제 모델(`source: live`)의 학습 구간에 다섯 단계가 모두 없으면 학습과 적용을 거부한다. 다섯 단계가 존재하는 것만으로 충분한 데이터나 좋은 성능을 보장하지 않으므로 단계별 건수와 시간 순 평가 결과를 검토해야 한다. 상대 확률은 정확도로 검증되거나 보정된 확률이 아니다. 기존 일부 단계만 포함한 시연 모델은 `source: sample`에서만 허용한다.

이 모델은 공통 모델이다. 현재 특성에는 사용자 개인의 과거 기분이나 개인 특성이 없으므로 같은 경기와 반응이 입력되면 이용자별로 다른 결과를 낼 수 없다.

## 알고리즘과 평가

- Python과 NumPy로 구현한 다중 클래스 로지스틱 회귀와 softmax를 사용한다. 학습 데이터의 평균과 표준편차로 네 특성을 표준화하며, 표준편차가 0인 특성은 1로 처리한다.
- 학습률, 반복 횟수, L2 정규화, 평가 비율은 학습 명령에서 지정한다. 경기 점수 80%와 팬 반응 20%는 **규칙 기반 대체 예측**의 설정이며, 머신러닝 모델은 학습된 계수를 사용한다.
- 경기 날짜를 기준으로 앞부분을 학습, 뒷부분을 평가한다. 평가 시작 시점에 아직 기록되지 않은 학습용 기분은 제외한다. 같은 경기일은 학습과 평가 양쪽으로 나뉘지 않는다.
- 결과에는 정확도, macro-F1, 최빈 기분만 예측하는 기준 정확도, 학습·평가 단계별 건수와 누락된 기분 단계가 포함된다. 현재 macro-F1은 평가 정답 또는 예측에 등장한 단계의 F1 평균이다. 평가에 누락된 단계가 있으면 전체 다섯 단계의 성능으로 해석하면 안 된다.
- 모델 파일에는 특성 순서, 기분 단계, 표준화 값, 계수, 학습 시각, 학습에 사용한 마지막 경기일과 평가 결과를 저장한다. 이용자 식별자나 게시글 원문은 모델 파일에 포함하지 않는다.

## 데이터 기준

기분 기록 CSV의 필수 열은 다음과 같다.

```csv
user_id,game_id,team,as_of,mood_recorded_at,mood
fan-001,game-001,한화,2026-10-01T23:00:00+09:00,2026-10-02T09:00:00+09:00,좋음
```

`user_id`는 익명 식별자다. `as_of`는 예측에 사용한 게시글의 집계 기준 시각이며 경기 종료 이후, 기분을 기록한 시각 이전이어야 한다. 기분 기록은 한국 시간으로 경기 다음 날이어야 한다. 같은 이용자·팀·경기의 중복 기분 기록과 미래 기록은 거부한다.

게시글은 팀·팀 말머리·경기 ID가 일치해야 한다. 경기 종료 후 `--window-hours` 범위, 다음 경기 시작 전, `as_of` 이하의 글만 사용한다. ID와 내용이 중복된 글을 제거하고 `--max-posts`를 초과하면 시간대별로 표본을 선택한다. `--minimum-posts`보다 유효한 글이 적은 기분 기록은 학습 데이터에서 제외하고 건수를 출력한다. 학습과 예측용 스냅샷 생성 시 이 집계 옵션과 감성 분류 방식을 동일하게 맞춰야 한다.

경기 CSV에는 실제 경기 시작·종료 시각이 모두 필요하다. 현재 메인 화면의 KBO 경기 결과 응답은 종료 시각을 제공하지 않으므로 학습용 경기 종료 시각은 별도 데이터로 준비해야 한다.

자동 수집 작업은 원문을 보관하지 않고 최신 집계 파일만 교체하므로 과거 학습 데이터가 자동 축적되지는 않는다. 실제 학습에는 예측 당시의 팀·경기 ID·경기 결과·감성 건수·집계 기준 시각과 동의받은 이용자의 다음 날 기분 기록을 연결해 안전한 저장소에 별도로 보관해야 한다. 수집 집계를 그대로 기분 정답으로 사용하거나, 기분 기록 이후에 생성된 반응 집계를 사용해서는 안 된다.

기분 기록이 포함된 중간 학습 CSV에는 익명 사용자 식별자가 있으므로 관리에 주의하고 저장소에 올리지 않는다. 모델 JSON에는 그 식별자가 포함되지 않는다.

## 가상 데이터로 전체 흐름 실행

프로젝트 루트에서 Python 3와 NumPy를 준비한다. 테스트 환경은 Python 3.9와 NumPy 1.26.4였다.

```bash
python3 -m pip install -r scripts/requirements-ml.txt
DEMO_DIR="$(mktemp -d)"
python3 scripts/generate_mood_demo.py --output-dir "$DEMO_DIR/data"
python3 scripts/analyze_team_posts.py \
  --input "$DEMO_DIR/data/posts.csv" --labels-csv "$DEMO_DIR/labels.csv" \
  --output "$DEMO_DIR/summary.json" --minimum-posts 10
node --conditions=react-server --import tsx scripts/build-mood-training.ts \
  --games "$DEMO_DIR/data/games.csv" --posts "$DEMO_DIR/data/posts.csv" \
  --labels "$DEMO_DIR/labels.csv" --feedback "$DEMO_DIR/data/feedback.csv" \
  --output "$DEMO_DIR/training.csv" --window-hours 12 --max-posts 50 --minimum-posts 10
python3 scripts/train_mood_model.py \
  --input "$DEMO_DIR/training.csv" --output "$DEMO_DIR/model.json" --source sample \
  --test-fraction 0.2 --iterations 1000 --learning-rate 0.1 --l2 0.01
```

프로젝트에 포함된 가상 모델로 분석 API를 확인하려면 기존 개발 서버를 종료하고 다음 명령을 실행한다.

```bash
MOOD_MODEL_PATH=scripts/sample/mood-model-demo.json npm run dev
```

다른 터미널에서 다음 요청을 보내고 `prediction.method`가 `machine_learning`인지 확인한다.

```bash
curl -X POST http://localhost:3000/api/forecast \
  -H 'Content-Type: application/json' \
  -d '{"relation":"boss","displayName":"팀장님","team":"한화","player":"선수","favoriteMenus":["국밥"]}'
```

가상 모델은 `source: sample`이라 실제 데이터 전용 메인 `/api/daily-mood`에 적용되지 않는다.

실제 기분 기록이 확보되면 같은 절차에서 실제 파일을 사용하고 `--source live`로 후보 모델을 학습한다. 평가 후 `MOOD_MODEL_PATH`로 모델 위치를 지정하거나 `lib/analysis/data/mood-model.json`에 배치한다. 메인 화면은 실제 출처의 최신 커뮤니티 스냅샷과 선택한 경기의 ID·날짜·상대팀·점수가 같고, 반응이 충분하며 모델의 학습 마지막 경기일이 예측 경기일보다 이전일 때 모델을 적용한다. 그렇지 않으면 규칙 예측으로 돌아간다.

기본 검증 명령은 `python3 -m unittest discover -s scripts -p 'test_*.py'`와 `node --conditions=react-server --import tsx --test lib/analysis/*.test.ts`다.
