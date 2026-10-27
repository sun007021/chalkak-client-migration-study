# 테스트 카탈로그: AI 피드백(AIR)

AI 피드백 요청·폴링·결과·재요청의 동작을 다섯 클라이언트가 같게 만드는 테스트 목록이다. 홈 AI 카드와 피드 알약·시트는 같은 세션 로직을 쓰므로(Android `AiReviewSession` 방식) 로직 U 테스트를 공용으로 두고 화면별 W/E만 나눈다. 서버 분기는 HTTP 코드가 아니라 `status`(NONE, PROCESSING, COMPLETED, FAILED)와 `canRequestAgain`으로 하고, 폴링은 3초 간격·300초 창(D-03)이며 창의 시작은 POST를 보낸 시각 또는 화면에 들어와 폴링을 시작한 시각이다(`requestedAt`은 쓰지 않는다). 창이 끝나면 실패가 아니라 "처리가 오래 걸리고 있어요. 나중에 다시 확인해 주세요."를 보여 주고 POST를 다시 보내지 않는다. 시간 의존 로직은 모두 가짜 시계로 검증하고(2.9초/3.0초, 299.999초/300.000초, KST 자정) 실제로 기다리는 테스트는 만들지 않는다. 기존 iOS `AIReviewAPIClientTests`·`FeedAIReviewTests`·`FeedAIReviewRenderingTests`·`HomeAIReviewTests`와 Android `FeedAiReviewTest`·`HomeAiReviewTest`·`AiReviewDataSourceImplTest`·`AiReviewRepositoryImplTest`·`AiReviewComponentsTest`의 검증을 흡수했다. 홈에서 카드가 보이는 조건은 HOME 영역(TC-HOME)에 있다. 기준일은 오늘 KST = 2026-10-27(화)이고 fixture 열은 `shared/fixtures/` 기준 상대 경로다. A는 실제 AI 완료(수 분)와 실제 푸시 도착처럼 개발 서버·시간이 필요한 2건만 둔다.

## AIR AI 피드백

| ID | 검증 내용 | 근거 | 구분 | fixture | 기존 |
| --- | --- | --- | --- | --- | --- |
| TC-AIR-001 | Given 게시물 {id} / When 조회·요청 / Then `GET`·`POST /posts/{id}/ai-review`는 같은 경로와 Authorization을 쓰고 본문을 보내지 않는다. 요청 클라이언트는 연결 실패 자동 재전송을 하지 않는다 | AIREVIEW-001, D-21 | C | ai-review/ai-review-get__none.json, ai-review/ai-review-post__202-processing.json | iOS:AIReviewAPIClientTests L10, L148 / AN:AiReviewDataSourceImplTest(GET 역직렬화, POST 본문 없음) |
| TC-AIR-002 | Given 응답 `status=NONE` / When 파싱 / Then 상태와 `canRequestAgain=false`, 시각·result 모두 null을 읽는다 | AIREVIEW-003, §4.2 | C | ai-review/ai-review-get__none.json | iOS:AIReviewAPIClientTests L32 / AN:AiReviewRepositoryImplTest(매핑) |
| TC-AIR-003 | Given 응답 `COMPLETED` / When 파싱 / Then `overallScore, criteria[{key,label,score}], distinctivePerspective, feedback{summary,strength,weakness,suggestion}`와 `requestedAt`·`completedAt`(소수초 있는/없는 UTC ISO-8601 모두)을 읽는다 | AIREVIEW-005, §0 | C | ai-review/ai-review-get__completed.json, ai-review/ai-review-get__completed-fractional-seconds.json | iOS:AIReviewAPIClientTests L46 / AN:AiReviewRepositoryImplTest |
| TC-AIR-004 | Given `COMPLETED`인데 `result`가 null / When 파싱 / Then 유효하지 않은 응답으로 처리해 "AI 피드백 정보를 불러오지 못했어요."를 보여 준다 | AIREVIEW-005 | C+U | ai-review/ai-review-get__completed-no-result.json | iOS:AIReviewAPIClientTests L68 / AN:AiReviewRepositoryImplTest(미완료 결과 없음) |
| TC-AIR-005 | Given 점수가 -0.1, 10.1, NaN / When 파싱 / Then 유효하지 않은 응답이고 0.0과 10.0은 유효하다 | AIREVIEW-005 | C | ai-review/ai-review-get__score-out-of-range.json, ai-review/ai-review-get__completed-score-0.json, ai-review/ai-review-get__completed-score-10.json | iOS:AIReviewAPIClientTests L79 |
| TC-AIR-006 | Given `FAILED` 응답 / When 파싱 / Then `result=null`이고 `canRequestAgain`은 서버 값을 그대로 읽으며 필드가 없으면 false다 | AIREVIEW-005, §4.2 | C | ai-review/ai-review-get__failed-can-retry.json, ai-review/ai-review-get__failed-cannot-retry.json, ai-review/ai-review-get__missing-can-request-again.json | iOS:AIReviewAPIClientTests L91 / AN:AiReviewRepositoryImplTest |
| TC-AIR-007 | Given 알 수 없는 `status` / When 파싱 / Then 유효하지 않은 응답이고 앱은 깨지지 않는다. 상태와 맞지 않는 `result`(PROCESSING인데 result 있음)도 같다 | AIREVIEW-005 | C | ai-review/ai-review-get__unknown-status.json | iOS:AIReviewAPIClientTests L128 / AN:AiReviewRepositoryImplTest(잘못된 상태=InvalidResponse) |
| TC-AIR-008 | Given POST 응답 202 `PROCESSING`, 200 `COMPLETED` / When 파싱 / Then 상태 분기는 HTTP 코드가 아니라 `status`로 하며 2xx는 모두 정상이다 | §4.2, G:ai-review | C | ai-review/ai-review-post__202-processing.json, ai-review/ai-review-post__200-completed.json | AN:AiReviewRepositoryImplTest |
| TC-AIR-009 | Given 400·403 응답 / When 오류 변환 / Then HTTP 상태와 서버 `message`를 보존하고 사용자 안내를 바꾸지 않으며 요청 취소는 통신 오류로 바뀌지 않는다 | D-02 | C+U | ai-review/ai-review-post__400-limit-reached.json, ai-review/ai-review-post__403-banned.json | iOS:AIReviewAPIClientTests L103, L116, L139 / AN:AiReviewRepositoryImplTest(HTTP/네트워크 보존) |
| TC-AIR-010 | Given criteria가 0개·1개·3개이고 feedback 항목이 상한(summary 60자, 나머지 150자) 길이 / When 렌더 / Then 기준 개수를 고정하지 않고 목록으로 표시하며 레이아웃이 깨지지 않는다 | AIREVIEW-005 | W+S | ai-review/ai-review-get__completed.json, ai-review/ai-review-get__completed-long-text.json | AN:AiReviewComponentsTest |
| TC-AIR-011 | Given 내 게시물 상세·홈 카드 진입 / When 진입 / Then `GET`만 호출하고 자동으로 POST하지 않는다(분석 시작은 사용자의 명시적 요청에만) | AIREVIEW-001, G:ai-review | U | ai-review/ai-review-get__none.json | iOS:FeedAIReviewTests L7 / AN:FeedAiReviewTest |
| TC-AIR-012 | Given `NONE` / When 렌더 / Then "AI 피드백 받기"가 보이고 폴링하지 않는다 | §4.2 | U+W | ai-review/ai-review-get__none.json | iOS:HomeAIReviewTests L75 / AN:FeedAiReviewTest |
| TC-AIR-013 | Given `PROCESSING` / When 렌더 / Then "AI 분석중"(비활성)이고 폴링을 시작한다 | §4.2 | U+W | ai-review/ai-review-get__processing.json | AN:FeedAiReviewTest |
| TC-AIR-014 | Given `COMPLETED` / When 렌더 / Then "AI 피드백 보기"만 있고 재요청 버튼이 없으며 폴링하지 않는다 | §4.2 | U+W | ai-review/ai-review-get__completed.json | AN:FeedAiReviewTest |
| TC-AIR-015 | Given `FAILED`이고 `canRequestAgain=true` 또는 false / When 렌더 / Then true면 "AI 피드백 재요청", false면 재요청 버튼 없이 "이 사진은 더 이상 AI 피드백을 요청할 수 없어요."를 보여 준다. 푸시 문구로 판단하지 않는다 | AIREVIEW-005, A7 | U+W | ai-review/ai-review-get__failed-can-retry.json, ai-review/ai-review-get__failed-cannot-retry.json | iOS:FeedAIReviewTests L25, L40 / AN:FeedAiReviewTest |
| TC-AIR-016 | Given 지난 주제의 내 게시물(topicDate가 오늘이 아님) / When 렌더 / Then 완료 결과·진행 중만 표시하고 새 요청·재요청은 불가이며 "AI 피드백은 오늘 올린 사진만 재요청할 수 있어요."를 안내한다(쟁점 1) | AIREVIEW-001(기간 제한 없음, 기존 앱 동작 승계) | U+W | ai-review/ai-review-get__failed-can-retry.json, feed/posts-detail__mine-past.json | iOS:FeedAIReviewTests L40, L186 / AN:FeedAiReviewTest(canRequestReview) |
| TC-AIR-017 | Given 남의 게시물 또는 게스트 / When 상세 렌더 / Then AI 알약·카드가 없고 `GET /posts/{id}/ai-review` 요청이 0건이다. 서버가 404를 주면(A6) 섹션을 숨기고 "AI 피드백을 확인할 수 없는 게시물이에요."를 보여 준다 | AIREVIEW-003, A6, D-05 | U+W | ai-review/ai-review-get__404-not-found.json | AN:FeedAiReviewTest(404 숨김) |
| TC-AIR-018 | Given 홈에서 완료 결과를 본 같은 게시물 / When 홈 복귀 / Then 재조회 없이 결과를 유지하고, 처리 중이었다면 결과를 표시한 채 상태 조회를 재개하며 게시물이 달라지면 이전 완료 결과를 지우고 새 결과를 조회한다 | D-03 | U | ai-review/ai-review-get__completed.json, ai-review/ai-review-get__processing.json | iOS:HomeAIReviewTests L7, L25, L50 / AN:HomeAiReviewTest |
| TC-AIR-019 | Given 완료된 게시물에 재진입 / When 진입 / Then 완료 결과를 GET으로 갱신하고 자동 요청하지 않는다 | AIREVIEW-003 | U | ai-review/ai-review-get__completed.json | iOS:FeedAIReviewTests L61 |
| TC-AIR-020 | Given `NONE` / When "AI 피드백 받기" 탭(피드) / Then 시작 시트 "AI 피드백을 시작할까요?"와 안내 문구 3줄, "분석 시작하기"가 뜨고 닫으면 POST 0건, 확정하면 POST 1회다. 홈 실패 재요청은 시트 없이 바로 요청한다(쟁점 2) | AIREVIEW-006(별도 동의 없음) | U+W | ai-review/ai-review-post__202-processing.json | AN:FeedAiReviewTest, HomeAiReviewTest / iOS:HomeScreenUITests L5 |
| TC-AIR-021 | Given 첫 사용 / When 시작 시트 / Then 추가 동의·개인정보 체크 UI가 없다(회원가입 약관으로 갈음) | AIREVIEW-006 | W | - | 신규 |
| TC-AIR-022 | Given POST 202 `PROCESSING` / When 응답 / Then 분석중 상태가 되고 응답 시각을 창 시작으로 폴링을 시작한다 | G:ai-review | U | ai-review/ai-review-post__202-processing.json | iOS:HomeAIReviewTests L90 / AN:FeedAiReviewTest |
| TC-AIR-023 | Given POST 응답을 기다리는 중 / When 버튼 연타·중복 탭 / Then 추가 POST가 0건이다(응답 후에도 자동 재전송 없음) | G:ai-review, D-21 | U | ai-review/ai-review-post__202-processing.json(지연) | iOS:FeedAIReviewTests L81 / iOS:HomeAIReviewTests L195 / AN:FeedAiReviewTest |
| TC-AIR-024 | Given 이미 완료된 리뷰 / When POST(다른 기기에서 완료 등) / Then 200 `COMPLETED`를 그대로 표시하고 폴링하지 않는다 | AIREVIEW-002 | U | ai-review/ai-review-post__200-completed.json | AN:AiReviewRepositoryImplTest |
| TC-AIR-025 | Given `FAILED`이고 재요청 가능 / When 재요청 POST 202 / Then 분석중이 되고 폴링 창은 이번 POST 시각부터 300초다(이전 `requestedAt` 무관) | A3, AIREVIEW-002 | U | ai-review/ai-review-get__failed-can-retry.json → ai-review/ai-review-post__202-processing.json | iOS:FeedAIReviewTests L25 / AN:FeedAiReviewTest(재요청) |
| TC-AIR-026 | Given 4번째 요청 / When POST가 400 "더 이상 AI 리뷰를 다시 요청할 수 없습니다." / Then 서버 message를 그대로 보여 주고 이전 단계를 유지하며 자동 재요청하지 않는다. 400 "지금은 AI 리뷰를 요청할 수 없습니다."도 같다 | A4, AIREVIEW-002, D-02 | U | ai-review/ai-review-post__400-limit-reached.json, ai-review/ai-review-post__400-disabled.json | iOS:HomeAIReviewTests L217 / AN:FeedAiReviewTest(POST 오류) |
| TC-AIR-027 | Given 정지 회원 / When POST 403 / Then "이용이 제한되어 AI 피드백을 요청할 수 없어요."이고 재요청 0건이며 GET은 정상 조회된다 | D-08, A5, AIREVIEW-003 | U | ai-review/ai-review-post__403-banned.json, ai-review/ai-review-get__completed.json | AN:FeedAiReviewTest(403) |
| TC-AIR-028 | Given POST 404 / When 응답 / Then 섹션을 숨기거나 조회 불가 상태로 두고 추가 조회를 막는다 | AIREVIEW-004, A6 | U | ai-review/ai-review-post__404-not-found.json | AN:FeedAiReviewTest(404 숨김) |
| TC-AIR-029 | Given 토큰 만료 / When POST·GET 401 `UNAUTHORIZED` / Then refresh 후 원 요청을 1회 재전송하고, `REAUTHENTICATION_REQUIRED`면 로그인 화면으로 가며 폴링 중 401은 폴링을 중단한다 | D-17 | U | ai-review/ai-review-post__401-unauthorized.json | AN:FeedAiReviewTest(401), TokenAuthenticatorTest |
| TC-AIR-030 | Given POST 응답 유실(연결 끊김·타임아웃) / When 오류 / Then "네트워크 연결을 확인해 주세요."를 보여 주고 POST를 자동 반복하지 않으며 GET으로 서버 상태를 확인해 동기화한다 | G:ai-review, D-21 | U | ai-review/ai-review-post__timeout.json, ai-review/ai-review-get__processing.json | iOS:HomeAIReviewTests L239 / AN:FeedAiReviewTest(네트워크) |
| TC-AIR-031 | Given POST 500 / When 응답 / Then 자동 재시도 없이 오류 문구를 보여 주고 이전 단계를 유지한다(재시도하면 요청 횟수를 소모할 수 있음) | D-21, §4.2 | U | ai-review/ai-review-post__500-server-error.json | AN:FeedAiReviewTest |
| TC-AIR-032 | Given POST 202 직후 가짜 시계 / When 2.9초 / Then 폴링 GET이 0건이고 3.0초에 1건이다 | A1, D-03 | U | ai-review/ai-review-get__processing.json | AN:FeedAiReviewTest(가상 시간) / iOS:FeedAIReviewTests L121 |
| TC-AIR-033 | Given PROCESSING 유지 / When 3초 간격 반복 / Then GET이 3.0, 6.0, 9.0초…에 한 번씩 나가고 응답이 3초보다 늦어도 동시에 두 요청이 진행되지 않는다 | D-03 | U | ai-review/ai-review-get__processing.json(지연) | AN:HomeAiReviewTest |
| TC-AIR-034 | Given 화면 진입으로 폴링 시작 / When 창 계산 / Then 창 시작은 진입 시각이고 서버 `requestedAt`은 기준이 아니다(홈 5초가 아닌 3초 간격 통일) | A3, D-03 | U | ai-review/ai-review-get__processing-old-requested-at.json | iOS:HomeAIReviewTests L258 / AN:HomeAiReviewTest |
| TC-AIR-035 | Given 폴링 시작 후 299.999초 / When 시계 / Then GET이 허용된다. 300.000초에는 GET 없이 중단하고 상태는 PROCESSING 유지, "처리가 오래 걸리고 있어요. 나중에 다시 확인해 주세요."를 보여 주며 POST는 0건이다(창 안에서 GET은 3~297초 사이 99회) | A2, D-03 | U | ai-review/ai-review-get__processing.json | iOS:FeedAIReviewTests L121 / iOS:HomeAIReviewTests L258 / AN:FeedAiReviewTest, HomeAiReviewTest(5분) |
| TC-AIR-036 | Given 창 종료 후 화면 재진입 / When 진입 / Then GET부터 다시 시작하고 새 300초 창이 열린다. POST를 다시 보내지 않는다 | D-03, G:ai-review | U | ai-review/ai-review-get__processing.json | iOS:FeedAIReviewTests L121 / AN:FeedAiReviewTest |
| TC-AIR-037 | Given 창 종료 안내 상태 / When "AI 상태 다시 확인" 탭 / Then GET 1회를 보내고 PROCESSING이면 폴링을 재개한다(쟁점 3) | D-03 | U+W | ai-review/ai-review-get__processing.json | iOS:FeedAIReviewTests(수동 갱신 L147) / iOS 2.6 문구 |
| TC-AIR-038 | Given 폴링 중 / When 응답이 COMPLETED 또는 FAILED / Then 폴링을 중단하고 결과 표시 또는 실패 안내를 한다. 서버가 자동 재시도하는 동안(PROCESSING 유지)은 UI가 바뀌지 않는다 | §4.2 | U | ai-review/ai-review-get__processing.json → ai-review/ai-review-get__completed.json | iOS:HomeAIReviewTests L90 / AN:FeedAiReviewTest |
| TC-AIR-039 | Given 폴링 GET이 일시 오류(연결 실패·5xx) / When PROCESSING 중 / Then 메시지 없이(또는 1회만) 계속 폴링하고 복구 후 완료되면 결과를 표시한다 | D-20, D-21 | U | ai-review/ai-review-get__500-server-error.json → ai-review/ai-review-get__completed.json | iOS:HomeAIReviewTests L115 / AN:FeedAiReviewTest(일시 오류) |
| TC-AIR-040 | Given 첫 GET이 실패 / When 진입 / Then 오류 메시지("AI 피드백 정보를 불러오지 못했어요." 계열)를 보여 주고 "AI 상태 다시 확인"으로 재시도할 수 있다 | D-20 | U | ai-review/ai-review-get__500-server-error.json | iOS:HomeAIReviewTests L144 / AN:FeedAiReviewTest |
| TC-AIR-041 | Given 폴링 중 GET이 404 / When 응답 / Then 메시지 없이 조회 불가 상태로 바꾸고 추가 조회를 막는다 | AIREVIEW-004 | U | ai-review/ai-review-get__404-not-found.json | iOS:HomeAIReviewTests L157 / AN:FeedAiReviewTest |
| TC-AIR-042 | Given 폴링 중 화면 이탈(다른 화면·탭 전환·앱 백그라운드) / When 이탈 / Then 폴링을 중단하고 이탈 뒤 도착한 GET·POST 응답은 상태를 갱신하지 않으며 복귀하면 GET부터 새 창을 시작한다 | D-03 | U | ai-review/ai-review-get__processing.json(지연) | iOS:FeedAIReviewTests L104 / iOS:HomeAIReviewTests L282, L298 / AN:FeedAiReviewTest(pause·resume) |
| TC-AIR-043 | Given 수동 갱신 이후 / When 이전 폴링 응답이 늦게 도착 / Then 완료된 결과를 덮어쓰지 않는다 | D-04 | U | ai-review/ai-review-get__completed.json(빠름), ai-review/ai-review-get__processing.json(지연) | iOS:FeedAIReviewTests L147 |
| TC-AIR-044 | Given 게시물 A에서 B로 이동 / When A의 GET 응답이 늦게 도착 / Then B의 상태를 덮어쓰지 않는다. 사용자 A 로그아웃·B 로그인 시에도 이전 응답은 폐기된다 | D-17 | U | ai-review/ai-review-get__completed.json(지연) | iOS:HomeAIReviewTests L321 / AN:FeedAiReviewTest(계정 전환, 게시물 변경) |
| TC-AIR-045 | Given 가짜 시계 KST 2026-10-27 23:59:59(topicDate=오늘) / When 요청 가능 판정 / Then 요청 버튼이 보인다. KST 10/28 00:00:00에는 요청·재요청 버튼이 숨고 POST를 보내지 않으며 이미 진행 중인 리뷰의 결과 조회는 계속된다 | TOPIC-002, D-23, T6 | U | ai-review/ai-review-get__none.json | AN:FeedAiReviewTest(자정) |
| TC-AIR-046 | Given 오프라인에서 폴링 / When 연결 복구 / Then 계속 폴링해 완료되고 오프라인 동안 창은 계속 흐른다(300초 안) | D-20 | E | ai-review/ai-review-get__processing.json → ai-review/ai-review-get__completed.json | 신규 |
| TC-AIR-047 | Given 429/503 `Retry-After` / When 폴링 GET / Then 지정 시간만큼 기다린 뒤 재시도한다(창 시계는 그대로) | D-21, Q-14 | U | ai-review/ai-review-get__503-retry-after.json | 신규 |
| TC-AIR-048 | Given 폴링 간격 3초·창 300초 상수 / When `shared/constants.json`과 대조 / Then 같다(홈 포함 5초가 아님) | D-03 | U | shared/constants.json | iOS:HomeAIReviewTests(5초 → 3초로 통일) |
| TC-AIR-049 | Given `COMPLETED` / When 결과 시트 렌더 / Then 한 줄 요약(굵은 제목), 구도 점수(소수 첫째 자리, 예 7.5·10.0·0.0), criteria 목록, 섹션 "좋았던 점"·"아쉬운 점"·"다음엔 이렇게"가 이 순서로 보인다 | AIREVIEW-005 | W+S | ai-review/ai-review-get__completed.json | AN:FeedScreenTest(AI 시트) / iOS:FeedAIReviewRenderingTests |
| TC-AIR-050 | Given 점수 7.5 / When 접근성 라벨 / Then "전체 점수 10점 만점에 7.5점"이다 | AIREVIEW-005 | W | ai-review/ai-review-get__completed.json | AN 2.9(점수 접근성 문구) |
| TC-AIR-051 | Given `distinctivePerspective` true 또는 false / When 렌더 / Then true면 배지 "작가님의 해석이 돋보이는 작품이에요", false면 배지가 없다 | AIREVIEW-005 | W | ai-review/ai-review-get__completed.json, ai-review/ai-review-get__completed-not-distinct.json | AN:FeedScreenTest |
| TC-AIR-052 | Given 기준 설명 / When 점수 영역 탭 / Then "찰칵AI는 어떤 기준으로 점수를 내나요?" 다이얼로그가 열리고 닫을 수 있다 | - | W | ai-review/ai-review-get__completed.json | AN:AiReviewComponentsTest(기준 다이얼로그) |
| TC-AIR-053 | Given 실패 시트 / When 열기 / Then "AI 피드백을 생성하지 못했어요"와 "확인"이 보이고 재요청 가능 여부는 `canRequestAgain`을 따른다 | AIREVIEW-005 | W | ai-review/ai-review-get__failed-can-retry.json | AN 2.9(실패 시트) |
| TC-AIR-054 | Given 화면의 모든 사용자 문구 / When 검사 / Then 용어가 "AI 피드백"으로 통일돼 "AI 리뷰"가 노출되지 않는다(서버 message 제외) | D-03 | W | - | iOS 5.1-4(홈 "AI 리뷰" → 통일) |
| TC-AIR-055 | Given 분석중 애니메이션(파형·리플) / When 렌더 / Then PROCESSING에서만 표시되고 다른 상태에서는 멈춘다 | - | W | ai-review/ai-review-get__processing.json | AN:AiReviewComponentsTest(파형/리플) |
| TC-AIR-056 | Given AI 상태별 알약·카드(확인중, 받기, 분석중, 보기, 재요청, 실패) / When 렌더 / Then 플랫폼 내 스크린샷 기준선과 같다 | - | S | ai-review/*.json 전체 | iOS:HomeScreenUITests L10 |
| TC-AIR-057 | Given AI 영역 요소 / When 렌더 / Then testIDs.md의 식별자(알약, 시작 시트, 분석 시작하기, 결과 시트, 재요청, 다시 확인)가 존재한다 | strategy §2 | W | - | 신규 |
| TC-AIR-058 | Given `AI_REVIEW_COMPLETED`·`AI_REVIEW_FAILED` 푸시 탭 / When 게시물 상세로 이동 / Then 최신 GET 기준 COMPLETED면 결과 시트, FAILED면 실패 시트가 한 번 자동으로 열리고 PROCESSING·NONE이면 열리지 않으며 뒤로 갔다 다시 와도 다시 열리지 않는다 | D-11, §7.1 | U+W+E | ai-review/ai-review-get__completed.json, ai-review/ai-review-get__failed-can-retry.json | iOS:FeedAIReviewRenderingTests L28 / AN:FeedScreenTest(notificationEntry) |
| TC-AIR-059 | Given 알림함의 AI 결과 알림 항목 탭 / When 이동 / Then 푸시 탭과 같은 목적지·읽음 처리 흐름이다 | D-11, D-24 | E | ai-review/ai-review-get__completed.json | AN:NotificationViewModelTest(AI 결과 알림), ChalkakNavHostTest(AI 결과 FeedById) |
| TC-AIR-060 | Given 개발 서버와 실제 AI 처리(실행 시 받은 카카오 계정) / When 오늘 승인된 내 사진에서 "AI 피드백 받기" → 완료까지 대기 / Then 분석중 → 완료로 바뀌고 점수·요약이 표시되며 완료 푸시와 알림함 항목이 생긴다 (AG-AIR-001) | strategy §1-1·4, AIREVIEW-002 | A | - | 신규 |
| TC-AIR-061 | Given 분석 중 앱을 백그라운드로 보냈다가 복귀하고 푸시를 탭 / When 실제 FCM/APNs 푸시 도착 / Then 복귀 시 GET부터 폴링이 재개되고 푸시 탭으로 게시물 상세와 결과 시트가 열린다 (AG-AIR-002) | strategy §1-1, D-03, D-11 | A | - | 신규 |

## 구현 시 확인할 쟁점

1. "오늘 올린 사진만 재요청"은 서버 규칙(AIREVIEW-001: 기간 제한 없음)에 없고 기존 두 앱이 클라이언트에서 막던 동작이다. 새 앱도 같게 하되 features/ai-review.md에서 유지 여부를 확정한다(TC-AIR-016).
2. 재요청에서 시트를 띄울지가 기존 앱 사이에 다르다: Android 홈은 시트 없이 바로, Android 피드는 "AI 피드백을 재요청할까요?" 시트이고, iOS 문서(legacy-ios §2.6)는 시작 시트만 적고 재요청 시트는 적지 않았다(TC-AIR-020).
3. 시작 안내 문구가 다르다(iOS "몇 분 정도", Android "최대 1~2분"). `shared/copy/ko.json` 값을 따르고 서버 최악 대기가 약 6분이라는 점(api-contract §4.2)을 고려해 문구를 정한다.
4. 창 종료 후 "AI 상태 다시 확인"의 폴링 재개 여부(TC-AIR-037)와 300.000초 경계에서 GET 99회(3~297초) 계산은 D-03을 해석한 것이다. 구현이 다른 경계를 쓰면 TC를 맞춘다.
5. iOS `FeedAIReviewRenderingTests L7`(iOS 26.2 deinit 크래시 회귀)은 iOS 런타임 전용이라 흡수하지 않았다. iOS 구현 PR에서 별도 회귀 테스트로 둔다.
6. 푸시 포그라운드 억제(보고 있는 게시물의 AI 화면이면 표시 생략)는 PUSH 영역에서 다룬다.

## 필요 fixture 목록

파일은 `shared/fixtures/` 아래 상대 경로다. 표의 HTTP는 mock 서버가 돌려줄 상태 코드이고, 오류 fixture의 본문은 `{errorCode, message}`다.

| 파일명 | 메서드 경로 | HTTP | 내용 요지 |
| --- | --- | --- | --- |
| ai-review/ai-review-get__none.json | GET /posts/{id}/ai-review | 200 | status=NONE, requestedAt/completedAt/result=null, canRequestAgain=false |
| ai-review/ai-review-get__processing.json | GET /posts/{id}/ai-review | 200 | status=PROCESSING, requestedAt 있음, result=null |
| ai-review/ai-review-get__processing-old-requested-at.json | GET /posts/{id}/ai-review | 200 | PROCESSING인데 requestedAt이 하루 전(창 기준 아님 검증) |
| ai-review/ai-review-get__completed.json | GET /posts/{id}/ai-review | 200 | COMPLETED, overallScore 7.5, criteria 1개, distinctivePerspective=true, feedback 4항목 |
| ai-review/ai-review-get__completed-not-distinct.json | GET /posts/{id}/ai-review | 200 | distinctivePerspective=false |
| ai-review/ai-review-get__completed-fractional-seconds.json | GET /posts/{id}/ai-review | 200 | requestedAt/completedAt에 소수초(2026-10-20T05:00:21.123Z) |
| ai-review/ai-review-get__completed-score-0.json | GET /posts/{id}/ai-review | 200 | overallScore 0.0 |
| ai-review/ai-review-get__completed-score-10.json | GET /posts/{id}/ai-review | 200 | overallScore 10.0 |
| ai-review/ai-review-get__completed-long-text.json | GET /posts/{id}/ai-review | 200 | summary 60자, 나머지 150자, criteria 3개 |
| ai-review/ai-review-get__completed-no-result.json | GET /posts/{id}/ai-review | 200 | COMPLETED인데 result=null(계약 위반) |
| ai-review/ai-review-get__score-out-of-range.json | GET /posts/{id}/ai-review | 200 | overallScore 10.1(계약 위반) |
| ai-review/ai-review-get__failed-can-retry.json | GET /posts/{id}/ai-review | 200 | FAILED, canRequestAgain=true |
| ai-review/ai-review-get__failed-cannot-retry.json | GET /posts/{id}/ai-review | 200 | FAILED, canRequestAgain=false |
| ai-review/ai-review-get__missing-can-request-again.json | GET /posts/{id}/ai-review | 200 | FAILED, canRequestAgain 필드 없음 |
| ai-review/ai-review-get__unknown-status.json | GET /posts/{id}/ai-review | 200 | status="SOMETHING_NEW" |
| ai-review/ai-review-get__404-not-found.json | GET /posts/{id}/ai-review | 404 | BUSINESS_ERROR "게시물을 찾을 수 없습니다." |
| ai-review/ai-review-get__500-server-error.json | GET /posts/{id}/ai-review | 500 | INTERNAL_ERROR |
| ai-review/ai-review-get__503-retry-after.json | GET /posts/{id}/ai-review | 503 | Retry-After: 1 헤더 |
| ai-review/ai-review-post__202-processing.json | POST /posts/{id}/ai-review | 202 | status=PROCESSING, requestedAt, canRequestAgain=false |
| ai-review/ai-review-post__200-completed.json | POST /posts/{id}/ai-review | 200 | COMPLETED 그대로 |
| ai-review/ai-review-post__400-limit-reached.json | POST /posts/{id}/ai-review | 400 | BUSINESS_ERROR "더 이상 AI 리뷰를 다시 요청할 수 없습니다." |
| ai-review/ai-review-post__400-disabled.json | POST /posts/{id}/ai-review | 400 | BUSINESS_ERROR "지금은 AI 리뷰를 요청할 수 없습니다." |
| ai-review/ai-review-post__403-banned.json | POST /posts/{id}/ai-review | 403 | FORBIDDEN "차단된 회원입니다." |
| ai-review/ai-review-post__404-not-found.json | POST /posts/{id}/ai-review | 404 | BUSINESS_ERROR "게시물을 찾을 수 없습니다." |
| ai-review/ai-review-post__401-unauthorized.json | POST /posts/{id}/ai-review | 401 | UNAUTHORIZED |
| ai-review/ai-review-post__500-server-error.json | POST /posts/{id}/ai-review | 500 | INTERNAL_ERROR |
| ai-review/ai-review-post__timeout.json | POST /posts/{id}/ai-review | (응답 없음) | mock이 20초 지연 후 연결 종료 |
