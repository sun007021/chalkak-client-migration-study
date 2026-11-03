# W8 보류·제외 TC (AI 피드백)

형식: TC — 이유 — 예정 PR/근거

## 웹에 해당 없음
- TC-AIR-058 `AI_REVIEW_COMPLETED`·`AI_REVIEW_FAILED` 푸시 탭 진입 — 웹은 푸시를 받지 않는다(Q-04, REQ-PUSH-017, ai-review.md "플랫폼별 허용 차이"). REQ-AIR-046·048(푸시 진입·교체)과 푸시 포그라운드 억제도 같다. 같은 "최신 GET 기준으로 시트를 한 번만 자동 오픈" 동작은 홈 "자세히 보기"(`{openAiReview:true}`)가 쓰므로 그쪽은 `readOpenAiReview`, `FeedAiViewModel`(openAiReview), `FeedScreen.ai.test`, `AiReview.flow.test`에서 검증한다 — 근거: Q-04, D-11(웹 제외)
- TC-AIR-061 분석 중 백그라운드 → 푸시 탭 (A) — 실제 푸시가 없다. 복귀 시 GET부터 폴링 재개는 TC-AIR-042(문서 숨김·표시)로 검증 — 근거: Q-04

## 다른 PR로 넘기는 것
- TC-AIR-059 알림함의 AI 결과 알림 항목 탭 → 상세 + 시트 자동 열기 (E) — 알림함 화면이 없다. 목적지는 `feedPath(postId)` + `state {openAiReview:true}`로 같은 인자를 쓰면 된다(`readOpenAiReview`가 읽는다) — 알림함 PR (notification-push.md)
- TC-AIR-029의 "REAUTHENTICATION_REQUIRED면 로그인 화면으로 이동" — 세션 만료 이벤트(`h.expired`)가 오는 것까지만 검증한다. 화면 이동은 W1/W2의 SessionEvents·라우터 가드가 맡는다 — 근거: W2 deferred
- TC-AIR-046 오프라인 폴링 (E) — U 부분(연결 실패가 이어져도 계속 폴링, 창은 계속 흐름, 복구되면 완료)은 `AiReviewStore.polling.test`가 검증한다. 실제 브라우저 오프라인 전환은 E — E2E PR

## 지원하지 않는 것
- TC-AIR-055 분석중 애니메이션(파형·리플) — 시각 효과는 필수가 아니다(ai-review.md "플랫폼별 허용 차이"). 알약 비활성(`disabled`) 상태로 대신한다 — 근거: 허용 차이
- TC-AIR-056 상태별 알약·카드 스크린샷 기준선 (S) — jsdom은 렌더링 결과를 비교할 수 없다 — 수동/S
- TC-AIR-010의 S 부분(상한 길이 레이아웃이 깨지지 않음) — jsdom은 레이아웃을 계산하지 않는다. 목록 개수·전체 문구 표시는 W로 검증 — 근거: S/수동
- TC-AIR-060 실제 AI 완료 대기 (A, AG-AIR-001) — 개발 서버와 수 분의 실제 처리가 필요하다 — A

## 임시 결정(명세에 없거나 모순되어 테스트에서 이렇게 정했다)
- GET 404: REQ-AIR-005·030과 실패 표는 "메시지 없이 숨김"이고 TC-AIR-017 문장은 "숨기고 안내를 보여 준다"다. 표를 따라 GET 404는 알약만 숨기고 메시지가 없다. POST 404만 토스트 `ai.error.not-found`를 띄운다. `feed.ai-message`는 폴링 창 종료 안내(`ai.poll.timeout`)에만 쓴다.
- 실패 시트의 재요청 버튼(`ai-failed-sheet.retry-button`): 알약이 "실패"일 때는 재요청 불가라 이 버튼이 없다. 푸시/홈 자동 오픈처럼 FAILED + canRequestAgain + 오늘인 채로 시트가 열리는 경우에만 있고, 누르면 실패 시트를 닫고 재요청 시트를 연다. 이때 이유 문구는 없다(`ai-failed-sheet.message` 생략).
- 지난 주제 + canRequestAgain=false의 실패 이유는 서버 값이 먼저라 `ai.failed.no-more`다.
- 홈 "자세히 보기"로 들어와도 시트는 상세의 최신 GET 응답이 반영된 뒤에 연다(저장소의 캐시로 즉시 열지 않는다). REQ-AIR-046 "먼저 GET".
- 창 종료(stalled) 뒤 알약은 "AI 분석중"(비활성)을 유지하고, 안내 문구 `feed.ai-message` 옆에 `feed.ai-recheck-button`이 따로 생긴다. 첫 GET 실패(check-failed)에서는 알약 자체가 `feed.ai-recheck-button`이다.
- 폴링 격자: 창 시작 + 3초 × n에 GET을 보내고, 경과가 300초 이상이 되는 격자(300.000초)에서는 GET 없이 멈춘다. 응답이 늦으면 겹쳐 보내지 않는다.
- 분석 이벤트: ai-review.md에는 AI 전용 이벤트가 없고 D-22의 `screen_view` 이름 목록에도 AI 시트가 없다. 그래서 새 이벤트는 만들지 않고, 알약·시트를 열어도 `screen_view`가 `feed` 하나뿐인 것만 검증한다(FeedScreen.ai.test).

## 백엔드·QA 확인 대상
- GET 404 안내: 위 임시 결정(GET 404는 메시지 없이 알약만 숨김, REQ-AIR-005·030과 실패 표 기준)이 `docs/testing/testids.md:236`의 `feed.ai-message` 예시 문구("AI 피드백을 확인할 수 없는 게시물이에요." 등)와 충돌한다. 404일 때 안내 문구를 보일지(문구는 `ai.error.not-viewable`가 같은 값) 백엔드·QA가 확정해 주세요. 확정 전에는 무메시지로 둔다.
