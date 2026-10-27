# time fixtures

- HTTP 응답 파일(`topics__*`, `posts-today__*`, `calendar__months-without-current`)은 `_routes.json`에 일반 라우트가 있다.
- `_kind: "case"` 파일(`calendar__cross-month`, `calendar__cross-year`, `instants__*`)은 `method: "NONE"`, `path: "-"`. 필드: `clock`(가짜 시계 시작 시각), `weekStart/weekEnd`(일요일~토요일), `requests`(나가야 할 캘린더 요청 월), `responses`(월별 `GET /posts/calendar` 응답 본문), `expectedWeek`, `cases`(입력 문자열 배열), `expectedInstant`.
- `calendar__cross-month`는 TC 문구 "10월 말~11월 초"를 맞추려고 2025-10-26(일)~2025-11-01(토) 주를 쓴다(2026년에는 일요일 시작 주가 10/31~11/1을 가로지르지 않음). clock=2025-10-29T03:00:00Z.
- 시각 가정(홈 영역 fixture와 맞춰야 함): 오늘 주제(`...127`) `startsAt=2026-10-26T15:00:00Z`(KST 10/27 00:00) ~ `endsAt=2026-10-27T15:00:00Z`; 어제 주제(`...126`)는 그 직전 구간이라 `A.end == B.start`(TC-TIME-020). `topics__before-open`은 같은 주제를 `2026-10-27T11:00:00Z`(KST 20:00)에 열리는 것으로 둔 변형이다.
- `posts-today__cross-midnight`: 테스트가 clock을 2026-10-27T16:00:00Z(KST 10/28 01:00)로 두고 응답의 `topicDate=2026-10-27`을 그대로 쓰는지 본다. `posts-today__adjacent-topic`은 `GET /topics`의 `topics__open`(B)·`topics__closed`(A)와 함께 쓴다.
