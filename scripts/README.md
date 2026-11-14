# 야친자 예보 데이터 만들기

이 폴더의 CSV와 예보 데이터는 가상 시연 자료다. 앱은 `lib/analysis/data/forecast-snapshot.json`을 읽는다. 새 스냅샷에는 게시글 본문과 작성자 정보가 들어가지 않는다.

## 시연 자료로 실행하기

프로젝트 루트에서 의존성을 설치한 뒤 실행한다.

```bash
npm ci
npx tsx scripts/build-forecast-snapshot.ts \
  --games scripts/sample/games.csv \
  --posts scripts/sample/posts.csv \
  --teams 한화,삼성 --source sample --as-of 2026-11-14T08:00:00+09:00 \
  --recent-games 5 --window-hours 12 --max-posts 50 --minimum-posts 5 --max-age-days 7 \
  --win-points 60 --run-difference-points 4 --streak-points 5 \
  --run-difference-limit 5 --streak-limit 4 --fan-weight 0.2
npm run dev
```

별도 `--output`을 주지 않으면 이 명령은 앱의 기존 스냅샷을 교체한다. 샘플 데이터는 한화와 삼성의 결과를 제공한다. 다른 팀은 해당 팀 경기 데이터가 없다는 응답을 반환한다. 시연용 게시글이 적어 최소 유효 글 수를 5로 설정했다. 아래의 `/api/forecast` 호출로 분석 결과를 확인할 수 있다. 메인 화면은 가상 집계를 실제 경기 반응으로 사용하지 않는다.

## 파이썬으로 팀 말머리별 분석하기

팀원 화면에서 `POST /api/daily-mood`와 `public/yachinja-api.js`를 연결하면 경기 CSV와 게시글 CSV를 업로드해 분석할 수 있다. 선택한 경기의 공식 결과와 경기 CSV가 일치해야 하며, 게시글에 같은 경기 ID와 해당 팀 말머리가 필요하다. `--labels-csv`로 만든 글별 분류 CSV를 선택적으로 함께 업로드할 수 있다. 업로드 파일은 해당 요청에서만 사용하며, 원문은 서버 파일에 저장하지 않는다. 화면 연동 예시는 [팀 핸드오프](../docs/TEAM_HANDOFF.md)를 참고한다.

`analyze_team_posts.py`는 확보한 CSV 파일을 읽어 KBO 10개 구단의 말머리별 게시글을 분석한다. 별도 파이썬 패키지와 AI API 키는 필요 없다. 말머리에 없는 팀을 제목에서 추측하지 않으며, 다른 팀을 언급하는 글은 감성 판정을 보류한다. 예시 CSV로 결과를 터미널에 출력한다.

```bash
python3 scripts/analyze_team_posts.py --input scripts/sample/posts.csv --minimum-posts 5
```

입력에는 `teamTag`, `team_tag`, `category`, `말머리`, `머리글`, `카테고리` 중 하나와 `title`/`제목` 또는 `text`/`본문`이 필요하다. 본문 없이 제목만 있어도 분석할 수 있다. 각 팀의 글 수, 긍정·중립·부정·판정 보류·제외 수, 주요 주제와 감성 점수를 JSON으로 출력한다. 점수는 `100 × (긍정 수 − 부정 수) ÷ 유효 글 수`이며, 유효 글이 `--minimum-posts`(기본 10건)보다 적으면 `null`이다. 예시는 자료가 적어 5건을 사용한다.

팀별 요약과 기존 예보 코드에 넣을 글별 분류 결과를 저장할 수도 있다.

```bash
python3 scripts/analyze_team_posts.py \
  --input scripts/sample/posts.csv --minimum-posts 5 \
  --output /tmp/baseball-team-summary.json \
  --labels-csv /tmp/baseball-team-labels.csv
```

분류 CSV를 생성하려면 각 글에 `source`와 `postId`가 있어야 한다. 기존 예보에 연결할 때는 같은 게시글 파일에 `gameId`, `team`, `teamTag`, `publishedAt` 등 기존 게시글 CSV의 필수 열도 필요하다. 예보 생성 명령에서 `--posts`에 해당 게시글 CSV를 넣고 `--labels /tmp/baseball-team-labels.csv`를 지정한다. 여기서 생성된 레이블은 게시글의 감성 분류이며 이용자가 직접 기록한 기분 정답이 아니다.

한 경기의 반응을 분석하려면 `--game-id 경기ID`, `--since 2026-11-13T21:30:00+09:00`, `--until 2026-11-14T09:30:00+09:00`처럼 선택할 수 있다. 시작 시각은 포함하고 종료 시각은 제외한다. 경기 ID와 시간대가 포함된 작성 시각이 입력 CSV에 있어야 한다. 말머리만으로 글이 실제로 그 경기의 반응인지 증명할 수 없으므로 경기 ID와 시각을 확인해야 한다.

이 분석 스크립트는 웹사이트에 접속하지 않는다. 별도의 자동 수집 스크립트와 GitHub Actions 설정은 [팀 핸드오프의 자동 수집 항목](../docs/TEAM_HANDOFF.md#6-자동-수집과-배포-설정)을 참고한다. [동아닷컴 이용약관 제27조](https://secure.donga.com/membership/policy/service.php)는 자동화 도구 활용을 제한하므로, 실제 글은 이용이 허용된 경로로 확보한다. 사전 규칙은 반어법과 야구 은어에 오분류가 있을 수 있다.

## 허가된 게시판 자동 수집

`collect_community.py`는 Python 표준 라이브러리만 사용한다. 목록의 팀 말머리·제목·완전한 작성 시각을 읽어 실제 경기 ID와 연결하고 위 게시글 CSV 형식을 만든다. 본문·댓글·작성자는 수집하지 않는다. 날짜가 없는 시간만 표시된 글, 경기 종료 시각과 맞지 않는 글, 다른 사이트의 링크는 제외한다. 시간대가 없는 완전한 날짜·시간은 한국 시간으로 해석한다. 목록 구조가 지원 범위에 들어오는지 허가된 자료로 확인해야 한다.

경기 CSV와 수집 허가를 받은 게시판 URL을 준비한 후, 원문이 저장소에 남지 않도록 임시 폴더에서 실행한다. 다음 예시의 URL과 CSV 경로는 실제 값으로 교체해야 한다.

```bash
COLLECTION_DIR="$(mktemp -d)"
python3 scripts/collect_community.py \
  --board-url 'https://authorized.example/board' --authorized \
  --games /path/to/current-games.csv --output "$COLLECTION_DIR/posts.csv" \
  --source community --pages 3 --delay-seconds 2
python3 scripts/analyze_team_posts.py \
  --input "$COLLECTION_DIR/posts.csv" --labels-csv "$COLLECTION_DIR/labels.csv" \
  --output "$COLLECTION_DIR/summary.json" --minimum-posts 10
```

`--pages`는 최대 10, 기본 1이며 `--delay-seconds`는 1초 이상이다. 첫 페이지 이후 `p=31`, `p=61` 방식이 기본이며 다른 방식은 `--page-parameter`, `--page-step`으로 맞춘다. robots.txt의 제한과 지연을 확인하며, 403·429·연결 오류 등에서는 우회하거나 재시도하지 않는다. 수집 결과가 없으면 기존 출력 파일을 교체하지 않는다. GitHub Actions는 이후 분류 CSV까지 읽어 집계 JSON을 생성한다. 별도의 기분 기록을 자동으로 만들어 학습에 사용하지는 않는다.

## 실제 데이터 입력

`scripts/sample/`의 헤더를 기준으로 CSV를 준비한다. 날짜는 `YYYY-MM-DD`, 시각은 `2026-10-01T21:30:00+09:00`처럼 시간대를 포함한다. 저장할 때 UTF-8을 사용한다.

| 파일 | 입력 |
|---|---|
| 경기 CSV | 경기 ID, 날짜, 홈·원정 팀과 점수, 경기 상태, 시작·종료 시각. 상태는 `finished`, `scheduled`, `cancelled` 중 하나다. |
| 게시글 CSV | 출처, 글 ID, 경기 ID, 팀, 구단 말머리, 작성 시각, 제목·본문, 원문 URL. 엠팍 글의 출처는 `mlbpark`로 입력한다. |
| 분류 CSV | 게시글별 `relevant`, `sentiment`, `topic`을 입력한다. `sentiment`는 `positive`, `neutral`, `negative`, `uncertain` 중 하나다. |
| 선수 CSV | 선택 사항. 헤더는 `team,player,date,role,summary,rating`이다. 역할은 `hitter` 또는 `pitcher`, 평점은 -2부터 2까지다. |

실제 CSV의 경로와 팀을 시연 명령의 `--games`, `--posts`, `--teams`에 넣고, `--source live`를 지정한다. 선수 데이터가 있으면 `--players 경로`를 추가한다. `--as-of`를 생략하면 실행 시각을 사용한다. 실제 데이터는 각 팀의 마지막 경기 종료 후 7일이 지나면 API가 갱신을 요청한다.

수동 분류 파일을 쓰려면 `--labels 경로`를 지정한다. `--labels`가 없으면 게시글을 아래의 사전·규칙 방식으로 분류한다. 게시글 파일을 생략하거나 유효한 글이 최소 건수보다 적으면 경기 기록으로 예보한다.

## 사전·규칙으로 게시글 분류하기

게시글 CSV를 제공하면 외부 AI API나 별도 모델 없이 글의 야구 표현, 감성 단어와 일부 부정 표현을 검사한다. 긍정과 부정이 섞이거나 대상이 상대팀으로 보이는 글, 감정 표현을 찾지 못한 글은 판정 보류로 처리한다. 티켓 판매와 이적설 등 뚜렷한 비경기 글은 제외한다. 입력 CSV의 팀·경기 ID가 올바르다는 전제가 필요하며, 반어법과 다양한 구어 표현은 정확히 판단하지 못할 수 있다. 형태소 분석기나 언어 모델을 사용하는 방식은 아니다.

다음 명령의 CSV 경로를 준비한 파일로 바꾼다. 분석은 로컬에서 실행되며 API 키가 필요하지 않다.

```bash
node --conditions=react-server --import tsx \
  scripts/build-forecast-snapshot.ts \
  --games 경기.csv --posts 게시글.csv \
  --teams 한화,삼성 --source live \
  --recent-games 5 --window-hours 12 --max-posts 50 --minimum-posts 10 --max-age-days 7 \
  --win-points 60 --run-difference-points 4 --streak-points 5 \
  --run-difference-limit 5 --streak-limit 4 --fan-weight 0.2
```

기존 `--classify` 옵션도 같은 규칙 기반 분석을 실행한다. `--max-tokens`는 이 방식에서 사용하지 않는다. 최종 문구는 현재 고정 문구를 사용하며 응답의 `forecast.fallback`이 `true`로 표시된다. 자동 수집을 사용하려면 허가된 게시판과 실제 경기 CSV 공급원이 필요하다.

## 응답 확인

```bash
curl -X POST http://localhost:3000/api/forecast \
  -H 'Content-Type: application/json' \
  -d '{"bossTitle":"과장님","team":"한화","player":"선수","favoriteMenus":["국밥"]}'
```

`node --conditions=react-server --import tsx --test lib/analysis/*.test.ts`로 분석 및 API 테스트를 실행한다.

## 기분 예측 모델 학습

경기 점수와 커뮤니티 반응을 입력으로 사용하고, 이용자가 **경기 다음 날 직접 기록한 기분**을 정답으로 삼는다. 현재 모델은 여러 이용자의 기록으로 만드는 공통 모델이다. 경기와 반응이 같은 경우 응원자마다 다른 기분을 예측할 수 있는 개인별 정보는 입력하지 않는다.

경기 CSV, 게시글 CSV, 게시글 감성 분류 CSV와 별도의 기분 기록 CSV를 결합하는 방법과 모델 기술 명세는 [기분 예측 모델 기술 명세](../docs/mood-model-spec.md)를 참고한다. 포함된 `scripts/sample/mood-model-demo.json`은 가상 데이터로 학습한 시연 모델이며 실제 경기 화면에 적용되지 않는다.

`scripts/sample/mood-feedback.csv`는 형식 확인용 가상 데이터다. 실제 기록을 수집할 때는 같은 헤더를 사용하고 `user_id`에는 익명 식별자를 넣는다. `game_ended_at`, `as_of`, `mood_recorded_at`은 시간대가 있는 ISO 시각이다. `as_of`는 경기 종료 이후이면서 기분을 기록하기 이전이어야 한다. `mood`는 `매우 안 좋음`, `안 좋음`, `보통`, `좋음`, `매우 좋음` 중 이용자가 직접 선택한 값이다. 이전 형식의 날씨 이름을 사용한 기록과 모델도 같은 순서의 기분 단계로 변환해 사용할 수 있다.

입력 특성은 승·무·패, 득실점 차, 긍정 비율, 부정 비율이다. 게시글 원문과 이용자 식별자는 모델 파일에 들어가지 않는다. 날짜 순서대로 앞부분은 학습하고 뒷부분은 평가한다. 평가 결과에는 정확도, macro-F1, 가장 흔한 기분만 고르는 기준 모델의 정확도, 클래스별 건수가 포함된다. 시연 자료의 평가 결과는 실제 예측 성능을 의미하지 않는다.

Python 3와 NumPy가 설치된 환경에서 가상 데이터를 학습해 볼 수 있다. NumPy가 없다면 `python3 -m pip install numpy`로 설치한다.

```bash
python3 scripts/train_mood_model.py \
  --input scripts/sample/mood-feedback.csv \
  --output /tmp/baseball-mood-sample.json --source sample \
  --test-fraction 0.2 --iterations 1000 --learning-rate 0.1 --l2 0.01
```

이 모델을 로컬 예보 API에서 확인하려면 다음 명령으로 개발 서버를 실행하고 위의 `/api/forecast` 예시를 호출한다.

```bash
MOOD_MODEL_PATH=/tmp/baseball-mood-sample.json npm run dev
```

실제 사용자 기록으로 학습할 때는 CSV 경로와 `--source live`를 지정한다. 학습 구간에 다섯 기분 단계가 모두 있어야 실제 모델이 생성되고 적용된다. `--output lib/analysis/data/mood-model.json`으로 저장하면 예보 API가 해당 파일을 읽는다. 모델과 경기·반응 스냅샷의 출처가 같고, 모델 학습에 사용한 마지막 경기일이 예측 경기보다 이전이어야 모델이 적용된다. 모델이 없으면 규칙 예보를 반환한다. 응답의 `prediction.method`에서 적용된 방식을 확인할 수 있다. `prediction.confidence`는 모델이 출력한 상대 확률이며 실제 예측 정확도로 검증된 값은 아니다.

`/api/daily-mood`도 커뮤니티 집계를 사용한다. 선택한 경기 결과 출처의 경기 ID, 날짜, 상대팀, 점수가 실제 커뮤니티 스냅샷의 최신 경기와 같고, 집계가 유효해야 한다. `GAME_RESULTS_SOURCE=kbo`면 경기 CSV의 `gameId`를 KBO 경기 ID와 맞춘다. `GAME_RESULTS_SOURCE=api-sports`면 API-SPORTS의 경기 ID와 맞춘다. 모델이 없더라도 유효한 반응이 있으면 경기 점수와 반응 점수를 규칙으로 합산한다. 이 경우 `prediction.method`는 `rule_based`, `prediction.communityApplied`는 `true`이다. 모델이 적용되면 `prediction.method`는 `machine_learning`이다. 일치하는 집계가 없으면 경기 점수만 사용한다.

학습 코드 검증은 `python3 -m unittest scripts.test_train_mood_model`로 실행한다.
