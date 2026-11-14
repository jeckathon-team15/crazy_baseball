# 2026년 10월 KBO 경기 결과 시연 자료

`kbo-2026-10-games.csv`는 2026년 10월에 실제 종료된 KBO 경기 **48건**이다. 정규시즌 40경기와 포스트시즌 8경기가 포함되어 있다. 취소 경기와 이동일은 포함하지 않는다. 2026년 11월 14일 확인한 과거 기록이며 자동으로 갱신되지 않는다.

출처는 [KBO 2026년 10월 경기일정·결과](https://www.koreabaseball.com/Schedule/Schedule.aspx?month=10&year=2026)와 각 행의 `sourceUrl`에 기재한 KBO 게임센터 경기 리뷰다. 일정표에서 실제 경기 ID, 대진, 득점, 예정 시작 시각을 확인하고 각 경기 리뷰에서 개시·종료 시각을 확인했다.

| 열 | 내용 |
|---|---|
| `gameId`, `date` | KBO 경기 ID, 경기 날짜 |
| `homeTeam`, `awayTeam`, `homeScore`, `awayScore` | 홈·원정 팀과 각각의 득점 |
| `status` | 종료 경기이므로 `finished` |
| `startsAt` | 경기일정표의 예정 시작 시각. 기존 KBO 경기 결과 연동과 대조하는 값 |
| `endsAt` | 게임센터 리뷰의 실제 종료 시각 |
| `series` | `regular`: 정규시즌, `postseason`: 포스트시즌 |
| `actualStartsAt` | 게임센터 리뷰의 실제 개시 시각. 일정표의 예정 시각과 다를 수 있다 |
| `sourceUrl` | 해당 경기의 게임센터 리뷰 링크 |

모든 시각은 한국 시간 `+09:00`이다. 기존 경기 CSV 파서와 수집기는 앞의 필수 열을 사용하며, 나머지 열은 출처와 구분을 확인하기 위한 부가 정보다. `/api/daily-mood`에서 업로드할 때는 선택한 경기 공급원의 ID·시작 시각·팀·점수와 CSV가 일치해야 한다.

## 경기 결과만으로 시연 데이터 만들기

아래 명령은 실제 경기 결과를 사용하지만, 오래된 경기를 현재 반응처럼 보여주지 않도록 **시연용 `sample` 스냅샷**을 별도 임시 파일로 만든다. 커뮤니티 글이 없으므로 경기 결과만 반영된다. 기존 스냅샷은 덮어쓰지 않는다.

```bash
node --conditions=react-server --import tsx scripts/build-forecast-snapshot.ts \
  --games data/demo/kbo-2026-10-games.csv \
  --teams 한화,삼성,KIA,LG,두산,롯데,SSG,NC,KT,키움 --source sample \
  --as-of 2026-10-31T09:00:00+09:00 --output /tmp/yachinja-kbo-2026-10.json \
  --recent-games 5 --window-hours 12 --max-posts 50 --minimum-posts 10 --max-age-days 365 \
  --win-points 60 --run-difference-points 4 --streak-points 5 \
  --run-difference-limit 5 --streak-limit 4 --fan-weight 0.2
```

`MOOD_SNAPSHOT_PATH=/tmp/yachinja-kbo-2026-10.json npm run dev`로 실행하면 분석용 `/api/forecast`에서 확인할 수 있다. 메인 화면의 `/api/daily-mood`는 시연용 스냅샷을 실제 커뮤니티 집계로 적용하지 않으며, 이 CSV를 자동으로 읽지도 않는다. 화면에 반영하려면 HTML/API 연결과 필요한 게시글 데이터를 별도로 준비해야 한다.

이 파일에는 게시글, 감성 분석 결과, 사용자의 기분 정답이 없다. 기존 가상 게시글 CSV의 경기 ID는 이 실제 경기 데이터와 다르므로 그대로 합치지 않는다. 실제 커뮤니티 게시글과 사용자 피드백은 이용 범위를 확인해 따로 확보해야 하며, 이 경기 결과만으로 머신러닝 예측 성능을 판단할 수 없다.

10월 30일 삼성·KIA 경기와 연결해 수동 확인한 소규모 실제 게시글 사례는 [커뮤니티 반응 탐색 자료](community-2026-10-30-README.md)에 정리했다. 표본이 부족해 감성 점수와 화면 예측에 자동 적용되지 않는다.
