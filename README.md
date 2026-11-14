# 야친자 기분 예측 API

KBO 경기 결과와 팀별 커뮤니티 반응으로 팬의 기분을 다섯 단계로 예측하는 백엔드다. 감성 분석은 Python 사전·규칙 방식이며, 이용자가 직접 기록한 기분을 학습하면 다중 클래스 로지스틱 회귀 모델을 사용할 수 있다.

팀원이 만든 HTML 화면은 이 저장소에 아직 없다. `public/yachinja-api.js`와 `/api/daily-mood`를 사용해 연결하는 방법, GitHub Actions 자동 수집과 Vercel 배포 설정은 [팀 핸드오프](docs/TEAM_HANDOFF.md)에 정리했다.

## 로컬 실행

```bash
npm ci
npm run dev
```

`GET /api/daily-mood?team=한화&date=2026-11-07`로 응원팀의 경기와 기분 예측을 요청한다. 날짜를 생략하면 한국 시간 기준 어제를 조회한다. 기본 경기 출처는 KBO 웹 응답이며, API-SPORTS를 사용하려면 서버에 `GAME_RESULTS_SOURCE=api-sports`와 `API_SPORTS_KEY`를 설정한다. API 키를 브라우저 코드나 공개 저장소에 넣지 않는다. KBO 연동은 비공식 웹 응답을 사용하므로 운영 전 데이터 이용 조건을 확인한다.

사용할 수 있는 실제 커뮤니티 집계가 없으면 경기 기반 규칙 예측을 반환한다. 실제 모델을 적용하려면 이용자가 기록한 다섯 단계 기분을 포함한 학습 데이터와 일치하는 경기·커뮤니티 데이터가 필요하다. 포함된 자료와 모델은 가상 시연용이며 실측 데이터나 성능이 아니다.

## 분석 및 테스트

- [수집·감성 분석과 학습 스크립트](scripts/README.md)
- [기분 예측 모델 기술 명세](docs/mood-model-spec.md)
- [팀 웹사이트 연동과 운영 핸드오프](docs/TEAM_HANDOFF.md)

```bash
python3 -m pip install -r scripts/requirements-ml.txt
python3 -m unittest discover -s scripts -p 'test_*.py'
node --conditions=react-server --import tsx --test lib/analysis/*.test.ts
npm run lint
```
