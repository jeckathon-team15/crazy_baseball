# 야친자 분석 기능 · 팀 웹사이트 연동 핸드오프

## 1. 목적과 현재 상태

팀원이 만든 HTML/CSS/JavaScript 화면을 사용하고, 이 프로젝트의 Next.js API로 경기 결과와 커뮤니티 반응을 전달받는다. 이 문서의 HTML 선택자와 날짜는 예시이므로 팀원 화면의 실제 요소에 맞게 바꾼다. 팀원 HTML 원본은 현재 저장소에 없으며, 기본 `app/page.tsx`는 자리 표시 페이지다. 전달받은 화면을 추가한 뒤 연결한다.

현재 동작:

- 경기 결과 조회: KBO 홈페이지의 웹 응답이 기본값이다. API-SPORTS도 선택할 수 있다.
- 커뮤니티 감성 분석: 제공된 CSV의 말머리와 게시글을 사전·규칙으로 분류한다. AI API는 필요 없다.
- 예측: 실제 데이터와 유효한 학습 모델이 일치하면 머신러닝을 적용한다. 모델이 없으면 경기와 가능한 커뮤니티 반응을 규칙으로 합산한다.
- 허가받은 게시판 목록을 수집하는 파이썬 코드와 GitHub Actions 주기 작업이 준비되어 있다. 아직 수집 허가를 확인한 게시판과 경기 종료 시각 공급원이 설정되지 않았으므로 자동 수집은 실행되지 않는다.
- 이용자의 실제 기분 기록 수집 화면과 실제 데이터로 학습한 모델은 아직 없다. 저장소의 게시글과 모델은 **시연용 가상 자료**다.

## 2. 팀원 HTML 연결

1. Next.js 프로젝트 안의 `public/`에 팀원 HTML을 `index.html`로 넣고, 필요한 CSS·JS·이미지도 `public/`에 둔다. `public/index.html`은 `/index.html`로 제공된다. 기존 `public/yachinja-api.js`도 함께 둔다.
2. HTML의 파일 경로를 배포 위치에 맞게 조정한다. 예: `public/css/style.css` → `/css/style.css`.
3. `/`에서 바로 팀원 페이지를 열려면, **팀원 HTML을 추가한 뒤** 기존 `app/page.tsx`를 다음과 같이 교체한다. 주소는 `/index.html`로 이동하며 `/api/*`는 그대로 사용할 수 있다.

```tsx
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/index.html");
}
```

4. 팀원 HTML에서 아래 API 호출 코드를 연결한다. 동일한 Vercel 프로젝트에 HTML과 API를 함께 배포하는 것을 권장한다. HTML만 정적 프로젝트로 올리면 이 프로젝트의 `app/api`가 자동으로 생성되지 않는다.

### 경기 결과와 기분 조회

```html
<script type="module">
  import { getDailyMood } from "/yachinja-api.js";

  // team과 date는 팀원 HTML의 선택값으로 교체한다.
  async function loadMood(team, date) {
    try {
      const result = await getDailyMood({ team, date });
      if (result.status === "ready") {
        console.log(result.mood, result.score, result.games);
        // result.mood 등을 화면 요소의 textContent에 표시한다.
      } else if (result.status === "pending") {
        console.log("경기 결과를 기다리는 중");
      } else {
        console.log("선택한 날짜에 종료된 경기가 없음");
      }
    } catch (error) {
      console.error(error.message); // 실제 화면에서는 오류 문구를 표시한다.
    }
  }

  // 예: 버튼 클릭 시 loadMood(선택한팀, 선택한날짜) 호출
</script>
```

`date`는 `YYYY-MM-DD` 형식이다. 생략하면 API는 **한국 시간 기준 어제**를 조회한다. 팀원 화면을 오늘 날짜로 기본 설정하려면 날짜 입력값에 오늘을 넣고 명시적으로 전달한다. 유효한 팀 예: `한화`, `삼성`, `KIA`, `LG`, `두산`, `롯데`, `SSG`, `NC`, `KT`, `키움`.

### 경기 CSV와 게시글 CSV로 감성 분석

```html
<script type="module">
  import { analyzeCommunity } from "/yachinja-api.js";

  // gamesFile/postsFile은 팀원 HTML의 <input type="file">에서 선택한 File 객체다.
  async function analyze(team, date, gamesFile, postsFile, labelsFile = null) {
    try {
      const result = await analyzeCommunity({
        team, date, games: gamesFile, posts: postsFile, labels: labelsFile,
      });
      console.log(result.mood, result.community, result.prediction);
      // community.sample이 true면 시연 자료임을 화면에 표시한다.
    } catch (error) {
      console.error(error.message);
    }
  }
</script>
```

`labels`는 선택 사항이다. 없으면 서버에서 사전·규칙으로 분류한다. `FormData`의 `Content-Type`은 브라우저가 경계값을 포함해 자동 설정하므로 직접 지정하지 않는다. 각 파일은 2MiB 이하여야 하며, 연결 모듈은 Vercel 요청 크기를 고려해 파일 합계를 4MiB 이하로 제한한다. Vercel Functions의 전체 요청 본문 제한은 4.5MB이며 multipart 경계와 기타 필드도 포함된다. [Vercel 요청 크기 제한](https://vercel.com/docs/errors/function_payload_too_large)

## 3. API 계약

### `GET /api/daily-mood?team=삼성&date=2026-11-07`

경기 결과와 저장된 커뮤니티 집계를 이용해 예측한다. 저장된 실제 집계가 없거나 경기와 맞지 않으면 경기 기반 규칙 예측을 반환한다. 아래 숫자는 **형식 예시**다.

```json
{
  "team": "삼성 라이온즈",
  "date": "2026-11-07",
  "status": "ready",
  "games": [{
    "gameId": "20261107KTSS0",
    "date": "2026-11-07",
    "startsAt": "2026-11-07T14:00:00+09:00",
    "opponent": "KT 위즈",
    "teamScore": 10,
    "oppScore": 5,
    "result": "W"
  }],
  "score": 85,
  "mood": "매우 좋음",
  "source": "kbo",
  "prediction": { "method": "rule_based", "communityApplied": false },
  "community": null
}
```

| 필드 | 의미 |
|---|---|
| `status` | `ready`: 종료된 경기, `pending`: 결과 대기, `no_game`: 종료 경기 없음 |
| `games` | 선택한 날짜의 종료 경기 목록. `result`는 `W`/`L`/`D`, 점수는 선택한 팀 관점 |
| `score` | -100~100 예측 점수. 경기 없음 또는 미완료 시 `null`; 확률이 아님 |
| `mood` | `매우 안 좋음`, `안 좋음`, `보통`, `좋음`, `매우 좋음` 중 하나. 경기 없음 또는 미완료 시 `null` |
| `source` | `kbo` 또는 `api-sports` 경기 결과 출처 |
| `prediction.method` | `rule_based` 또는 `machine_learning` |
| `community` | 실제 일치 집계가 없으면 `null`; 있으면 `applied`, `sample`, `origin`, `sentiment` 포함 |

`machine_learning` 응답에는 `confidence`, `probabilities`, `trainedThrough`가 추가된다. `confidence`는 모델의 상대 확률이며 검증된 예측 정확도가 아니다. `prediction.communityApplied`는 규칙 예측 응답에만 있다. 화면에서는 모든 경우에 존재하는 `community?.applied`를 확인하는 것이 안전하다.

실제 모델이 적용되면 `prediction`의 형식은 다음과 같다. 확률 값은 설명용 예시다.

```json
{
  "method": "machine_learning",
  "mood": "매우 좋음",
  "moodScore": 80,
  "confidence": 0.5,
  "probabilities": [
    { "mood": "매우 안 좋음", "probability": 0.1 },
    { "mood": "안 좋음", "probability": 0.1 },
    { "mood": "보통", "probability": 0.1 },
    { "mood": "좋음", "probability": 0.2 },
    { "mood": "매우 좋음", "probability": 0.5 }
  ],
  "trainedThrough": "2026-10-31"
}
```

팀 화면에서는 `result.mood`를 대표 단계로 표시하고, `result.community?.applied`로 반응 반영 여부를 표시한다. 확률 표시는 `result.prediction.method === "machine_learning"`일 때만 `result.prediction.probabilities`를 사용한다. 머신러닝의 `score`는 선택된 단계의 대표 점수이며 사용자의 실제 기분을 측정한 값이 아니다.

### `POST /api/daily-mood`

`multipart/form-data` 필드:

| 이름 | 필수 | 내용 |
|---|---|---|
| `team` | 예 | 선택한 KBO 팀 |
| `date` | 예 | 경기 날짜 `YYYY-MM-DD` |
| `games` | 예 | 경기 CSV 파일 |
| `posts` | 예 | 게시글 CSV 파일 |
| `labels` | 아니요 | 수동 또는 파이썬 분류 결과 CSV |

경기 CSV 헤더: `gameId,date,homeTeam,awayTeam,homeScore,awayScore,status,startsAt,endsAt`

게시글 CSV 헤더: `source,postId,gameId,team,teamTag,publishedAt,title,text,url`

분류 CSV 헤더: `source,postId,relevant,sentiment,topic`

각 시각은 `2026-11-07T17:17:00+09:00`처럼 시간대를 포함한다. 경기 CSV의 ID·날짜·시작 시각·홈/원정 팀·점수는 조회한 경기 결과와 일치해야 하며, 별도로 준비한 종료 시각은 과거 시각이어야 한다. 이 출처의 종료 시각은 KBO 응답과 대조하지 않는다. 가장 최근 종료 경기의 구단 말머리 글을 경기 종료 후 최대 12시간, 다음 경기 시작 전, 최대 50건 분석한다. 유효 글이 10건 미만이면 `community.applied`는 `false`이고 경기 결과만 적용한다.

`community.sentiment`에는 `positive`, `neutral`, `negative`, `uncertain`, `validCount`, `score`, `topTopic`, `negativeTopTopic`이 있다. `source`가 `sample` 또는 `demo`인 게시글이 들어 있으면 `community.sample`이 `true`로 표시되고, 학습 모델 대신 규칙 예측을 사용한다. 저장소의 `scripts/sample/*.csv`는 경기 ID가 가상이므로 실제 KBO 경기와 일치하지 않을 수 있다. 업로드 데이터는 요청 응답에 사용되며 앱 코드가 영구 저장하지 않는다.

### 오류 처리

| HTTP | 예시 | 처리 |
|---|---|---|
| `400` | 잘못된 팀·날짜·CSV, 경기 불일치 | `error`를 화면에 표시 |
| `413` | Vercel 요청 크기 초과 | 파일 크기 축소 안내 |
| `502` | 경기 결과 서버 연결·응답 오류 | 재시도 안내 |
| `503` | 경기 출처 또는 API 키 설정 오류 | 서버 설정 확인 |

일반 오류는 `{ "error": "설명" }` JSON이다. Vercel의 `413`은 JSON이 아닐 수 있으므로 `yachinja-api.js`는 별도 안내 문구로 변환한다. `pending`과 `no_game`은 HTTP 오류가 아니라 정상 응답 상태다.

`POST /api/forecast`는 기존 분석·시연용 인터페이스다. 팀원 화면에서는 위의 `/api/daily-mood` 사용을 권장한다.

## 4. Vercel 배포 설정

1. 팀 저장소에 Next.js 프로젝트의 `app/api`, `lib`, `types`, `public/yachinja-api.js`, `package.json`, `package-lock.json`, `next.config.ts`를 포함한다. 화면 코드만 별도 정적 프로젝트에 복사하면 API가 배포되지 않는다.
2. Vercel 프로젝트에서 프레임워크를 Next.js로 지정한다. 모노레포라면 **`package.json`과 `next.config.ts`가 있는 폴더**를 Root Directory로 설정한다.
3. Node.js 22.x 또는 24.x를 선택하고 빌드 명령은 `npm run build`를 사용한다. 환경 변수는 Vercel 프로젝트 설정에서 서버용으로 지정한다. `API_SPORTS_KEY`를 브라우저 코드나 `NEXT_PUBLIC_` 변수에 넣지 않는다.
4. 배포 후 `/api/daily-mood?team=삼성&date=YYYY-MM-DD`를 호출하고 `status`, `source`, `prediction`, `community`를 확인한다. KBO 웹 응답은 비공식 연동이므로 Vercel 환경에서 실제 연결을 확인해야 한다.

| 환경 변수 | 필요 여부 | 값과 역할 |
|---|---|---|
| `GAME_RESULTS_SOURCE` | 선택 | 기본 `kbo`; API-SPORTS 사용 시 `api-sports` |
| `API_SPORTS_KEY` | 조건부 | `api-sports` 선택 시 서버에만 설정 |
| `MOOD_SNAPSHOT_PATH` | 선택 | 배포 파일 내 집계 JSON 경로. 기본 `lib/analysis/data/forecast-snapshot.json` |
| `MOOD_MODEL_PATH` | 선택 | 배포 파일 내 모델 JSON 경로. 기본 `lib/analysis/data/mood-model.json` |
| `ANTHROPIC_API_KEY` | 불필요 | 기본 사전·규칙 분류는 사용하지 않음 |

환경 변수에 노트북의 절대 경로나 URL을 넣어도 파일이 배포되지 않는다. `lib/analysis/data/*.json`은 `next.config.ts`에서 두 API의 파일 추적에 포함하며, 사용할 JSON 파일이 배포 빌드 시 프로젝트에 실제로 존재해야 한다. 다른 경로에 파일을 두면 파일 추적 설정도 조정한다. Python·NumPy는 오프라인 학습에 사용하며 요청마다 실행되지 않는다.

현재 프로젝트의 `cacheComponents` 설정에서는 API가 기본 Node.js 런타임을 사용한다. Next.js 16의 이 설정에서는 라우트에 `runtime`을 별도로 export하면 빌드 오류가 발생하므로 추가하지 않는다.

Vercel 함수의 배포 파일 시스템은 읽기 전용이며 `/tmp`는 임시 공간이다. [Vercel 런타임 문서](https://vercel.com/docs/functions/runtimes) 따라서 함수 안에서 파일을 갱신하지 않는다. GitHub Actions가 생성한 **집계 JSON만** 저장소에 커밋하고 Vercel을 다시 배포하는 구성을 준비했다. 실제 배포가 연속해서 성공하는지는 팀 저장소의 브랜치 보호와 Vercel Git 연동 권한을 확인해야 한다. 서버의 경기 응답 5분 캐시는 각 함수 인스턴스의 메모리 캐시다.

## 5. 커뮤니티 반영과 머신러닝 적용 조건

| 상황 | 화면에서 표시할 내용 |
|---|---|
| 경기 결과만 있음 | 경기 기반 규칙 예측, `community`는 `null` 또는 `applied: false` |
| 일치하는 실제 커뮤니티 집계, 모델 없음 | 경기와 커뮤니티를 규칙으로 반영, `prediction.method: rule_based` |
| 일치하는 실제 집계와 유효한 실제 모델 | `prediction.method: machine_learning` |
| 업로드에 가상 게시글 포함 | `community.sample: true`; 실제 여론처럼 표시하지 않음 |

저장된 집계는 `source: live`, 최신성, 경기 ID·날짜·상대팀·점수 일치가 필요하다. 모델도 `source: live`여야 하고, 학습 데이터에 다섯 단계가 모두 존재하며, 학습에 사용한 마지막 경기일은 예측 경기일보다 이전이어야 한다. 다섯 단계 포함은 최소 형식 조건일 뿐 성능을 보장하지 않는다. 기본 스냅샷과 `scripts/sample/mood-model-demo.json`은 가상 자료이므로 실제 메인 예측에 자동 적용되지 않는다.

모델 생성, 데이터 항목과 평가 지표는 [mood-model-spec.md](mood-model-spec.md)를 참고한다. 분석 규칙과 CSV 생성 방법은 [scripts/README.md](../scripts/README.md)에 있다.

## 6. 자동 수집과 배포 설정

흐름: 허가된 게시판 목록 + 경기 CSV → `collect_community.py` → `analyze_team_posts.py` → `build-forecast-snapshot.ts` → GitHub의 집계 JSON 갱신 → Vercel 재배포 → `/api/daily-mood`.

1. 게시판 운영자에게 자동 수집 및 활용이 허용된 주소를 확보한다. [동아닷컴 이용약관 제27조](https://secure.donga.com/membership/policy/service.php)는 자동화 도구 사용을 제한하고 AI 학습데이터 활용에 사전 합의를 요구하므로, MLBPARK를 허가 없이 기본 주소로 설정하지 않았다. `robots.txt`가 허용된다고 이용 허가가 생기는 것은 아니다.
2. 매일 갱신되는 경기 CSV를 준비한다. 헤더는 위 `games` 형식과 같으며 **실제 종료 시각 `endsAt`**이 반드시 필요하다. `gameId`는 Vercel의 `GAME_RESULTS_SOURCE`가 반환하는 경기 ID와 같아야 한다. 가장 최근 경기뿐 아니라 팀별 다음 경기 일정도 포함하면 다음 경기 이후 게시글이 이전 경기에 섞이는 것을 막을 수 있다. KBO 웹 응답의 기존 연동에는 종료 시각이 없어 이 CSV를 자동 생성할 수 없다.
3. GitHub 저장소의 **Settings → Secrets and variables → Actions → Variables**에 다음을 설정한다. GitHub Actions 사용과 저장소 콘텐츠 쓰기, 대상 브랜치에 대한 봇 커밋 허용도 필요하다.

| 변수 | 설정값 |
|---|---|
| `COMMUNITY_COLLECTION_AUTHORIZED` | 실제 수집·이용 허가를 확인한 경우에만 `true` |
| `COMMUNITY_BOARD_URL` | 허가받은 게시판의 첫 목록 페이지 URL |
| `COMMUNITY_GAMES_URL` | 최신 경기 CSV를 제공하는 HTTPS 주소. 정적 파일 대신 권장 |
| `COMMUNITY_GAMES_FILE` | URL 대신 쓸 수 있는 저장소 내 경기 CSV 경로. 파일은 별도로 갱신해야 함 |
| `COMMUNITY_SOURCE` | 선택 사항. 예: `community`; 미설정 시 `community` |

4. `.github/workflows/collect-community.yml`을 기본 브랜치에 반영한다. 이 저장소의 현재 기본 브랜치는 `main`이므로 `develop`에만 PR을 병합해도 예약 수집은 시작되지 않는다. 워크플로가 `main`에 반영된 뒤 한국 시간 매일 오전 9시(UTC 00:00) `main`에서 실행되며 GitHub 사정으로 지연될 수 있다. Actions 탭의 **Run workflow**로 수동 점검할 수도 있다. URL/파일 중 하나와 수집 허가 변수가 없으면 작업을 건너뛴다. 예약 수집 커밋이 반영되는 브랜치와 Vercel의 배포 브랜치가 일치하는지도 확인한다.
5. 작업은 목록 글의 팀 말머리와 제목만 수집하고, 경기 종료 뒤 12시간 이내이면서 다음 경기 시작 이전의 글만 연결한다. 작성 시각은 날짜와 시간이 모두 확인되어야 한다. 현재 파서는 `tr` 안의 `word` 등 말머리, `txt` 등 제목 링크, `time datetime` 또는 날짜 요소가 있는 목록 구조를 지원한다. 시간만 있는 글은 날짜를 추측하지 않아 제외한다. **MLBPARK의 현재 HTML에는 실제로 테스트하지 못했으며, 허가된 데이터의 목록 구조가 다르면 파서를 맞춰야 한다.**
6. 원문 CSV와 글별 분류 파일은 Actions 임시 폴더에서만 처리한다. 유효 게시글이 10개 이상인 팀이 하나도 없거나 수집이 실패하면 기존 집계를 유지하고 작업은 실패한다. 성공하면 `lib/analysis/data/forecast-snapshot.json`만 커밋한다. 작성자 정보·댓글은 수집하지 않고 제목은 결과 JSON에 포함하지 않는다.
7. GitHub에 연결된 Vercel에서 해당 커밋이 실제 배포되었는지, 그리고 API가 `community.applied: true`를 반환하는지 확인한다. GitHub의 `GITHUB_TOKEN`으로 만든 커밋은 다른 GitHub `push` 워크플로를 자동 실행하지 않는다. [GitHub 설명](https://docs.github.com/en/actions/concepts/security/github_token) Vercel Git 연동, 비공개 저장소의 커밋 작성자 권한, 브랜치 보호 설정에 따라 배포가 막힐 수 있으므로 팀 설정에서 확인한다. [Vercel Git 배포](https://vercel.com/docs/git)

시즌이 쉬거나 반응이 부족하면 기존 집계를 계속 게시하는 대신 경기 불일치·유효기간 검사에 의해 API가 규칙 예측으로 돌아갈 수 있다. 이 방식은 간단한 초기 운영용이며, 사용자가 많거나 재배포 없이 자주 갱신하려면 DB와 별도 수집 작업으로 옮기는 것이 적합하다.

현재 작업은 최신 집계 파일 하나만 교체하므로 모델 학습에 필요한 과거 기록을 자동으로 쌓지 않는다. 실제 모델을 학습하려면 팀·경기 ID, 경기 결과, 반응 집계와 예측 기준 시각을 버전별로 보존하고 이용자의 동의하에 같은 예측에 대한 다음 날 기분 기록을 별도로 수집해야 한다. 게시글 원문이나 사용자 식별자를 공개 저장소에 올리지 않는다. 기분 기록 화면, 보관 DB와 자동 재학습은 아직 구현되지 않았다.

## 7. 팀 인수 전 확인

- 팀원 HTML과 리소스의 실제 파일 경로를 확인하고 `/index.html`에서 렌더링한다.
- 선택한 팀과 날짜가 `GET`에 전달되고 `ready`, `pending`, `no_game`, 오류 화면이 모두 처리되는지 확인한다.
- 실제 경기와 일치하는 게시글 자료가 있을 때만 커뮤니티 반영 여부와 표본 건수를 표시한다.
- 가상 자료 표시, 실제 모델 유무, 환경 변수를 배포 환경별로 확인한다.
- 수집 허가, 경기 종료 시각 공급원, GitHub Actions 실행 결과와 Vercel 실제 재배포를 확인한다.
- `npm run lint`, `npm run build`, `node --conditions=react-server --import tsx --test lib/analysis/*.test.ts`를 실행한다.
- 프런트와 API를 서로 다른 도메인에 배치하면 현재 API에는 CORS 허용 설정이 없으므로 같은 출처의 프록시 또는 별도 CORS 정책이 필요하다.
