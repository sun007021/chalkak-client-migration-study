# AI 피드백 (AIR)

내 게시물에 AI 피드백(구도 점수와 한 줄 요약, 좋았던 점·아쉬운 점·다음엔 이렇게)을 요청하고 결과를 보는 기능이다. 요청은 "내 게시물이면서 오늘 주제인 사진"에서만 보낼 수 있고, 상세 화면과 홈 카드는 먼저 `GET`으로 상태(`NONE`/`PROCESSING`/`COMPLETED`/`FAILED`)만 확인한다. `POST`는 사용자가 시작 시트의 "분석 시작하기"(또는 재요청)를 눌렀을 때 한 번만 보내며 자동으로 다시 보내지 않는다. 진행 중이면 모든 화면이 3초 간격, 300초 창으로 조회하고 창이 끝나면 실패가 아니라 안내만 보여 준다. 재요청은 서버가 주는 `canRequestAgain`이 `true`일 때만(게시물당 처음 포함 최대 3회) 보인다. 푸시로 들어오면 최신 조회 결과 기준으로 결과·실패 시트를 한 번만 자동으로 연다.

- 관련 규칙: [AIREVIEW-001](../../reference/business-rules/rules/ai-review.md#aireview-001-요청-자격), [AIREVIEW-002](../../reference/business-rules/rules/ai-review.md#aireview-002-횟수), [AIREVIEW-003](../../reference/business-rules/rules/ai-review.md#aireview-003-공개-범위), [AIREVIEW-004](../../reference/business-rules/rules/ai-review.md#aireview-004-삭제탈퇴정지), [AIREVIEW-005](../../reference/business-rules/rules/ai-review.md#aireview-005-결과-표시), [AIREVIEW-006](../../reference/business-rules/rules/ai-review.md#aireview-006-개인정보), [NOTIFICATION-015](../../reference/business-rules/rules/notification.md#notification-015-ai-리뷰-결과-알림), [USER-002](../../reference/business-rules/rules/user.md#user-002-이용-정지), 가이드 [AI 리뷰 요청과 결과 조회](../../reference/business-rules/guides/ai-review.md)
- 관련 결정: [D-02](../decisions.md#d-02-서버-오류-분기는-errorcode--http-상태--호출-api로만), [D-03](../decisions.md#d-03-ai-리뷰-폴링-간격), [D-08](../decisions.md#d-08-정지banned-회원), [D-11](../decisions.md#d-11-푸시-탭-처리), [D-17](../decisions.md#d-17-토큰-저장갱신), [D-20](../decisions.md#d-20-오류-화면과-토스트), [D-21](../decisions.md#d-21-네트워크-타임아웃)
- 근거 약어: iOS = [legacy-ios](../../reference/legacy-ios.md), AN = [legacy-android](../../reference/legacy-android.md), API = [api-contract](../../reference/api-contract.md), GUIDE = 위 AI 리뷰 가이드. 사용자 문구는 D-03에 따라 "AI 피드백"으로 통일한다(서버가 주는 `message`는 그대로 보여 주므로 "AI 리뷰"가 나올 수 있다).

## 화면

### 1. 상세 화면의 AI 피드백 알약 (Feed)

- 진입 조건: 게시물 상세(내 게시물)에서만 보인다. 남의 게시물에서는 알약도, `GET /posts/{id}/ai-review`도 없다.
- 구성 요소: 상태를 나타내는 알약 버튼 하나(라벨은 `## 문구`의 `ai.pill.*`).
- 사용자 동작: 알약 탭 → 상태에 따라 시작 시트, 재요청 시트, 결과 시트, 실패 시트, 상태 다시 확인 중 하나.

### 2. 시작 시트(재요청 시트)

- 진입 조건: NONE 알약("AI 피드백 받기") 또는 재요청 알약("AI 피드백 재요청")을 눌렀을 때.
- 구성 요소: 제목("AI 피드백을 시작할까요?", 재요청이면 "AI 피드백을 재요청할까요?"), 안내 세 줄, 버튼 "분석 시작하기", 닫기.
- 사용자 동작: "분석 시작하기"(`POST`), 닫기(요청 없음).

### 3. 결과 시트

- 진입 조건: COMPLETED 알약("AI 피드백 보기") 또는 홈 카드의 "자세히 보기", 푸시 진입 자동 오픈.
- 구성 요소: 종합 점수(10점 만점), 기준 목록(`criteria`의 라벨·점수), 기준 설명 진입(제목 "찰칵AI는 어떤 기준으로 점수를 내나요?" 다이얼로그), 독특한 시각 배지(조건부), 한 줄 요약(굵은 제목), 섹션 "좋았던 점", "아쉬운 점", "다음엔 이렇게".
- 사용자 동작: 읽기, 기준 설명 열기·닫기, 시트 닫기.

### 4. 실패 시트

- 진입 조건: "AI 피드백 실패" 알약을 눌렀을 때, 푸시로 들어와 FAILED일 때(자동 오픈).
- 구성 요소: 제목 "AI 피드백을 생성하지 못했어요", 이유 문구, "확인".

### 5. 홈 AI 피드백 카드 (홈, 오늘 승인된 내 사진이 있을 때)

- 진입 조건: [home.md](home.md) REQ-HOME-034.
- 구성 요소: 상태별 문구와 버튼(`ai.card.*`).
- 사용자 동작: NONE → 시작 시트, COMPLETED → "자세히 보기"로 결과 시트, FAILED(`canRequestAgain=true`) → "재요청".

## 요구사항

### 요청 자격과 진입 (AIR)

| ID | 요구사항 | 근거 |
| --- | --- | --- |
| REQ-AIR-001 | AI 피드백 알약은 내 게시물의 상세에서만 보이고, 내 게시물이 아니면 `GET`도 보내지 않는다. | AIREVIEW-003, AN §2.9 |
| REQ-AIR-002 | 상세에 들어오면 `GET /posts/{postId}/ai-review`만 보내 상태를 확인하고 `POST`는 자동으로 보내지 않는다. | GUIDE, iOS §2.6, iOS FeedAIReviewTests L7 |
| REQ-AIR-003 | 새 분석과 재요청은 내 게시물이면서 상세의 `topic.topicDate`가 KST 오늘일 때만 보낼 수 있고, 이 조건은 버튼을 보일 때와 누른 시점 둘 다 확인해 자정이 지났으면 `POST`를 보내지 않는다. | AN §2.9, AIREVIEW-001 |
| REQ-AIR-004 | 지난 주제의 내 게시물은 새 분석·재요청 없이 이미 있는 상태만 보여 준다(PROCESSING·COMPLETED·FAILED), NONE이면 알약을 숨긴다. | AN §2.9, iOS FeedAIReviewTests L186 |
| REQ-AIR-005 | `GET`이 404(게시물이 비공개이거나 남의 것)이면 AI 알약 또는 카드를 숨기고 폴링을 멈춘다. | AIREVIEW-003, API §6.2 A6 |
| REQ-AIR-006 | 정지 회원도 `GET`으로 상태와 결과를 볼 수 있다. | AIREVIEW-003, USER-002, API §6.2 A5 |
| REQ-AIR-007 | 게스트에게는 AI 피드백 API 호출도 알약도 없다(상세·홈 카드 진입 자체가 막혀 있다). | D-05 |

### 알약과 상태 표시 (AIR)

| ID | 요구사항 | 근거 |
| --- | --- | --- |
| REQ-AIR-008 | 첫 `GET`을 기다리는 동안 비활성 알약 "AI 상태 확인중"을 보여 준다. | iOS §2.6 |
| REQ-AIR-009 | 상태가 `NONE`이고 요청 조건(REQ-AIR-003)을 만족하면 "AI 피드백 받기"를 보여 주고 폴링하지 않는다. | GUIDE, AN §2.9 |
| REQ-AIR-010 | `POST` 응답을 기다리는 동안 비활성 알약 "AI 요청중"을 보여 준다. | iOS §2.6 |
| REQ-AIR-011 | 상태가 `PROCESSING`이면 비활성 알약 "AI 분석중"을 보여 주고 폴링한다(대기·처리 중을 구분하지 않는다). | GUIDE, AN §2.9 |
| REQ-AIR-012 | 상태가 `COMPLETED`이면 "AI 피드백 보기"를 보여 주고 누르면 결과 시트를 열며 폴링과 재요청 버튼은 없다. | GUIDE, API §4.2 |
| REQ-AIR-013 | 상태가 `FAILED`이고 `canRequestAgain=true`이며 요청 조건을 만족하면 "AI 피드백 재요청"을 보여 주고 누르면 재요청 시트를 연다. | GUIDE, iOS FeedAIReviewTests L40 |
| REQ-AIR-014 | 상태가 `FAILED`인데 재요청을 할 수 없으면 "AI 피드백 실패"를 보여 주고 누르면 실패 시트를 연다. | AN §2.9, iOS FeedAIReviewTests L40 |
| REQ-AIR-015 | 실패 시트의 이유 문구는 `canRequestAgain=false`이면 "이 사진은 더 이상 AI 피드백을 요청할 수 없어요.", 지난 주제의 사진이면 "AI 피드백은 오늘 올린 사진만 재요청할 수 있어요."이며 버튼은 "확인" 하나이다. | AN §2.9, iOS §2.6 |
| REQ-AIR-016 | 첫 `GET`이 404가 아닌 오류로 실패하면 알약을 "AI 상태 다시 확인"으로 바꾸고, 누르면 `GET`을 다시 보내며 실패 사유는 문구 표대로 알린다. | iOS §2.6, iOS HomeAIReviewTests L144 |
| REQ-AIR-017 | 실패(`FAILED`)가 확인되면 자동으로 재요청하지 않는다. | AN §2.9 |

### 시작 시트와 POST (AIR)

| ID | 요구사항 | 근거 |
| --- | --- | --- |
| REQ-AIR-018 | 시작 시트는 제목 "AI 피드백을 시작할까요?"(재요청이면 "AI 피드백을 재요청할까요?"), 안내 "결과가 나오기까지 몇 분 정도 소요될 수 있어요", "앱을 나가도 분석은 계속되니 걱정마세요", "분석이 끝나면 알림으로 알려드릴게요", 버튼 "분석 시작하기"를 보여 준다. | iOS §2.6, AN §2.9, GUIDE(최대 약 5분) |
| REQ-AIR-019 | `POST /posts/{postId}/ai-review`는 시트의 "분석 시작하기"를 눌렀을 때만 본문 없이 보내고, 시트를 닫으면 보내지 않는다. | GUIDE, iOS FeedAIReviewTests L7 |
| REQ-AIR-020 | `POST` 응답을 받을 때까지 추가 `POST`를 보내지 않고, 실패 응답이나 연결 오류 뒤에도 자동으로 다시 보내지 않는다. | GUIDE, D-21, iOS FeedAIReviewTests L81, iOS HomeAIReviewTests L239 |
| REQ-AIR-021 | `POST` 응답은 HTTP 상태(202/200)가 아니라 본문의 `status`로 해석하고, `PROCESSING`이면 폴링을 시작한다. | GUIDE, AN §2.9 |
| REQ-AIR-022 | `POST` 응답이 `COMPLETED`이면 폴링 없이 결과 상태로 바꾸고, `FAILED`이면 실패 상태로 바꾼다(시트를 자동으로 열지는 않는다). | GUIDE, API §4.2 |
| REQ-AIR-023 | 사용자가 보낸 `POST`의 응답이 오기 전에 화면을 벗어나거나 게시물·계정이 바뀌었으면 늦게 온 응답으로 상태를 바꾸지 않는다. | iOS HomeAIReviewTests L298·L321, AN §2.9 |
| REQ-AIR-024 | `POST`가 연결 오류로 응답을 못 받으면 오류 문구를 알린 뒤 `GET`으로 상태를 동기화하고(요청이 접수됐을 수 있다) `POST`를 다시 보내지 않는다. | AN §2.9, iOS HomeAIReviewTests L239 |

### 폴링 (AIR, D-03)

| ID | 요구사항 | 근거 |
| --- | --- | --- |
| REQ-AIR-025 | 폴링은 `PROCESSING`일 때만 하고 간격은 3초이며(홈·상세 모두), 2.9초에는 요청을 보내지 않고 3초에 한 번 보낸다. | D-03, API §6.2 A1 |
| REQ-AIR-026 | 폴링 창은 300초이고 시작 시각은 `POST`를 보낸 시각 또는 화면에 들어와 폴링을 시작한 시각이며 서버의 `requestedAt`은 쓰지 않는다. | D-03, GUIDE, API §6.2 A3 |
| REQ-AIR-027 | 300초가 지나도 `PROCESSING`이면 조용히 폴링을 멈추고 "처리가 오래 걸리고 있어요. 나중에 다시 확인해 주세요."를 보여 주며, 알약은 "AI 분석중"을 유지하고 `POST`는 다시 보내지 않는다. | D-03, iOS §2.3, AN §2.9 |
| REQ-AIR-028 | 화면이 보이지 않는 동안(백그라운드, 다른 화면이 위에 있음, 다른 탭)에는 폴링을 멈추고 진행 중인 요청 결과는 버리며, 다시 보이면 `GET`부터 시작하는 새 300초 창을 연다. | D-03, AN §2.9 |
| REQ-AIR-029 | 폴링 `GET`이 네트워크 오류·5xx이면 `PROCESSING`인 동안 계속 폴링하고 실패 메시지는 한 번만 보여 주며, 화면이 가려지면 그 메시지를 지운다. | AN §2.9, iOS HomeAIReviewTests L115 |
| REQ-AIR-030 | 폴링 `GET`이 404이면 메시지 없이 조회 불가 상태로 바꾸고 더 조회하지 않으며, 401이면 폴링을 멈추고 인증 처리(D-17)에 맡긴다. | AN §2.9, iOS HomeAIReviewTests L157 |
| REQ-AIR-031 | 수동으로 `GET`을 보낸 뒤에 도착한 이전 폴링 응답은 완료 결과를 덮어쓰지 않고, 화면을 나간 뒤 도착한 `GET` 응답은 무시한다. | iOS FeedAIReviewTests L104·L147 |
| REQ-AIR-032 | `COMPLETED` 또는 `FAILED`가 확인되면 폴링을 멈추고, `NONE`은 폴링하지 않는다. | GUIDE |

### 재요청 (AIR)

| ID | 요구사항 | 근거 |
| --- | --- | --- |
| REQ-AIR-033 | 재요청 가능 여부는 서버의 `canRequestAgain`만 보며 클라이언트는 요청 횟수를 세지 않고, 필드가 없으면 `false`로 본다. | AIREVIEW-005, GUIDE, API §6.2 A7 |
| REQ-AIR-034 | 재요청의 폴링 창은 이번 `POST`를 보낸 시각부터 새로 300초이다. | D-03, GUIDE |
| REQ-AIR-035 | `canRequestAgain`이 `false`이면 재요청 버튼을 숨기므로 4번째 요청은 보내지 않으며, 그래도 400 "더 이상 AI 리뷰를 다시 요청할 수 없습니다."를 받으면 서버 `message`를 그대로 보여 주고 이전 상태를 유지한다. | AIREVIEW-002, API §6.2 A4 |
| REQ-AIR-036 | 홈 카드의 실패 재요청은 시작 시트 없이 바로 `POST`를 보내고, 상세의 재요청은 재요청 시트를 거친다. | AN §2.4 |

### 결과 시트와 응답 검증 (AIR)

| ID | 요구사항 | 근거 |
| --- | --- | --- |
| REQ-AIR-037 | 결과 시트는 종합 점수(10점 만점), `criteria`의 라벨·점수 목록, 한 줄 요약(`feedback.summary`, 굵은 제목), 섹션 "좋았던 점"(`strength`), "아쉬운 점"(`weakness`), "다음엔 이렇게"(`suggestion`)를 보여 준다. | AIREVIEW-005, iOS §2.6, AN §2.9 |
| REQ-AIR-038 | `distinctivePerspective`가 `true`일 때만 배지 "작가님의 해석이 돋보이는 작품이에요"를 보여 준다. | AIREVIEW-005, iOS §2.6 |
| REQ-AIR-039 | `criteria`는 항목 수를 고정하지 않고 응답의 `key`·`label`·`score` 순서대로 목록으로 보여 준다. | GUIDE |
| REQ-AIR-040 | 종합 점수는 접근성 문구 "전체 점수 10점 만점에 {X}점"을 제공하고 점수는 서버 값을 다시 계산하지 않고 그대로 표시한다. | AN §2.9, AIREVIEW-005 |
| REQ-AIR-041 | 기준 설명 진입을 누르면 "찰칵AI는 어떤 기준으로 점수를 내나요?" 다이얼로그를 보여 준다. | AN §2.9 |
| REQ-AIR-042 | `overallScore`나 `criteria[].score`가 0~10 범위(양 끝 포함)를 벗어나면 응답 전체를 잘못된 응답으로 처리한다. | iOS §2.6, iOS AIReviewAPIClientTests L79 |
| REQ-AIR-043 | `status=COMPLETED`인데 `result`가 없거나, `COMPLETED`가 아닌데 `result`가 있거나, `status`가 네 값이 아니면 잘못된 응답으로 처리한다. | AN §2.9, iOS AIReviewAPIClientTests L68·L128 |
| REQ-AIR-044 | 잘못된 응답은 "AI 피드백 정보를 불러오지 못했어요."로 알리고 이전에 확인한 상태가 있으면 그대로 유지한다. | AN §2.9 |
| REQ-AIR-045 | `feedback`의 네 항목이 비어 있으면 잘못된 응답으로 처리한다(항목은 항상 비어 있지 않다). | GUIDE |

### 푸시 진입과 공용 (AIR)

| ID | 요구사항 | 근거 |
| --- | --- | --- |
| REQ-AIR-046 | `AI_REVIEW_COMPLETED`·`AI_REVIEW_FAILED` 푸시를 탭하면 해당 게시물 상세(내 게시물)를 열고 먼저 `GET`을 보낸 뒤 그 최신 결과 기준으로 시트를 한 번만 자동으로 연다(COMPLETED는 결과 시트, FAILED는 실패 시트). | D-11, AN §2.9, API §7.1 |
| REQ-AIR-047 | 자동 오픈은 한 번의 진입에서 한 번만 일어나고, 사용자가 닫으면 같은 진입에서 다시 열지 않으며, 최신 `GET`이 PROCESSING·NONE이면 시트를 열지 않는다. | D-11, iOS FeedAIReviewRenderingTests L28 |
| REQ-AIR-048 | 푸시로 같은 게시물 상세가 이미 열려 있으면 새로 쌓지 않고 교체한다. | D-11 |
| REQ-AIR-049 | 푸시 문구나 알림 본문으로 재요청 가능 여부를 판단하지 않고 항상 `canRequestAgain`을 쓴다. | API §7.1, GUIDE |
| REQ-AIR-050 | 상세와 홈 카드는 같은 상태 규칙·폴링 규칙·오류 규칙을 쓰며 하나의 게시물에 대한 AI 상태는 화면 간에 어긋나지 않게 항상 서버 `GET` 결과로 맞춘다. | D-03, iOS §5.1-4 |
| REQ-AIR-051 | 상세로 다시 들어오면 완료 결과도 `GET`으로 갱신하되 자동 요청은 하지 않고, 홈으로 돌아올 때 같은 게시물의 완료 결과는 다시 조회하지 않고 유지하며 처리 중이면 조회를 재개한다. | iOS FeedAIReviewTests L61, iOS HomeAIReviewTests L7·L25 |

### 홈 카드 (AIR)

| ID | 요구사항 | 근거 |
| --- | --- | --- |
| REQ-AIR-052 | 홈 카드는 NONE이면 "이 사진, AI에게 피드백 받아보기"와 시작 시트 진입, PROCESSING이면 "AI 피드백이 진행중이에요", COMPLETED이면 "AI 피드백이 완료되었어요"와 "자세히 보기", FAILED이면 "AI 피드백을 생성하지 못했어요"와 `canRequestAgain=true`일 때만 "재요청"을 보여 준다. | AN §2.4 |
| REQ-AIR-053 | 홈 카드의 `POST` 오류, 정지(403), 404, 네트워크 오류 처리는 상세와 같은 문구와 규칙을 쓴다. | D-08, D-03, iOS §5.1-4 |

## 상태

### 알약/카드 상태

| 상태 | 진입 조건 | 보이는 것 | 다음 전이 |
| --- | --- | --- | --- |
| Checking | 첫 `GET` 진행 | "AI 상태 확인중"(비활성) | 응답 → NONE/PROCESSING/COMPLETED/FAILED, 오류 → CheckFailed, 404 → Hidden |
| CheckFailed | 첫 `GET`이 404 외 오류 | "AI 상태 다시 확인" | 탭 → Checking |
| Hidden | 404, 또는 지난 주제의 NONE | 아무것도 없음 | 게시물 변경·재진입 시 다시 판정 |
| None | `status=NONE`, 오늘 | "AI 피드백 받기" | 탭 → 시작 시트 |
| Requesting | `POST` 진행 | "AI 요청중"(비활성) | 응답 `PROCESSING` → Processing, `COMPLETED` → Completed, `FAILED` → Failed, 오류 → 이전 상태 |
| Processing | `PROCESSING` | "AI 분석중"(비활성) + 폴링 | COMPLETED/FAILED 수신, 300초 경과 → ProcessingStalled |
| ProcessingStalled | 300초 경과 | "AI 분석중" + 안내 문구, 폴링 중단 | 화면 재진입·재표시 → Checking 후 새 창 |
| Completed | `COMPLETED` | "AI 피드백 보기" | 탭 → 결과 시트 |
| Failed(재요청 가능) | `FAILED` + `canRequestAgain` + 오늘 | "AI 피드백 재요청" | 탭 → 재요청 시트 |
| Failed(재요청 불가) | `FAILED`, 불가 또는 지난 주제 | "AI 피드백 실패" | 탭 → 실패 시트 |

### 폴링 상태

| 상태 | 조건 | 전이 |
| --- | --- | --- |
| 정지 | `PROCESSING`이 아님 또는 화면이 보이지 않음 | 보이게 되고 `PROCESSING`이면 `GET` 후 폴링 시작 |
| 대기(3초) | 마지막 요청 후 3초 미만 | 3초 경과 → 요청 |
| 요청 중 | `GET` 진행 | 응답에 따라 상태 갱신 후 대기 또는 정지 |
| 창 종료 | 창 시작 후 300초 경과 | 정지 + 안내 |

## API 호출

공통: 인증 헤더 필요. `GET`은 D-21의 네트워크 오류·5xx 자동 재시도(0.5초, 1초, 최대 2회)를 따르지만 `POST`는 자동 재시도하지 않는다. 응답 본문은 모두 같은 형식이다.

```text
{ status: NONE | PROCESSING | COMPLETED | FAILED,
  requestedAt: Instant | null, completedAt: Instant | null,
  result: { overallScore, criteria[{key, label, score}], distinctivePerspective,
            feedback{summary(≤60), strength(≤150), weakness(≤150), suggestion(≤150)} } | null,
  canRequestAgain: boolean }
```

### 호출 순서

| 순서 | 호출 | 시점 | 핵심 |
| --- | --- | --- | --- |
| 1 | `GET /posts/{postId}/ai-review` | 상세 진입, 홈 카드 표시, 화면 재표시, 푸시 진입 | `status`로 분기, 요청 전은 `NONE` 200 |
| 2 | `POST /posts/{postId}/ai-review` (본문 없음) | 시트의 "분석 시작하기"/재요청 | 접수·재요청·진행 중은 202 `PROCESSING`, 완료는 200 `COMPLETED` |
| 3 | `GET /posts/{postId}/ai-review` 반복 | `PROCESSING`인 동안 3초 간격, 300초 창 | `COMPLETED`/`FAILED`에서 중단 |

### 실패별 처리

| 호출 | HTTP + errorCode | 동작 | 사용자 문구 |
| --- | --- | --- | --- |
| `GET` | 404 `BUSINESS_ERROR` | 알약·카드 숨김, 폴링 중단 | 없음(메시지 없이 숨김) |
| `GET` | 401 `UNAUTHORIZED` | D-17 갱신 후 1회 재전송, 갱신 불가면 폴링 중단 | "다시 로그인해 주세요." |
| `GET` | 네트워크 오류·타임아웃 | 처음이면 CheckFailed, 폴링 중이면 계속 폴링하고 메시지 1회 | "네트워크 연결을 확인해 주세요." |
| `GET` | 5xx | 위와 같음 | "AI 피드백 정보를 불러오지 못했어요." |
| `GET` | 응답 검증 실패 | 이전 상태 유지, CheckFailed(처음이면) | "AI 피드백 정보를 불러오지 못했어요." |
| `POST` | 400 `BUSINESS_ERROR`("지금은 AI 리뷰를 요청할 수 없습니다." / "더 이상 AI 리뷰를 다시 요청할 수 없습니다.") | 이전 단계 유지, 자동 재요청 없음 | 서버 `message` 그대로 |
| `POST` | 403 `FORBIDDEN` | 이전 상태 유지, 같은 요청 재전송 금지 | "이용이 제한되어 AI 피드백을 요청할 수 없어요." |
| `POST` | 404 `BUSINESS_ERROR` | 알약·카드 숨김 | "AI 피드백을 확인할 수 없는 게시물이에요." |
| `POST` | 401 | D-17 | "다시 로그인해 주세요." |
| `POST` | 네트워크 오류(응답 없음) | 문구를 보이고 `GET`으로 동기화, `POST` 재전송 금지 | "네트워크 연결을 확인해 주세요." |
| `POST` | 409 (서버는 보내지 않으나 방어적으로) | `GET`으로 다시 조회 | 없음 |
| `POST` | 5xx, 응답 검증 실패 | 이전 상태 유지 후 `GET`으로 동기화 | "AI 피드백 정보를 불러오지 못했어요." |

## 문구

| 키 | 문구 | 상황 |
| --- | --- | --- |
| ai.pill.checking | AI 상태 확인중 | 첫 `GET` 진행 |
| ai.pill.request | AI 피드백 받기 | NONE |
| ai.pill.requesting | AI 요청중 | `POST` 진행 |
| ai.pill.processing | AI 분석중 | PROCESSING |
| ai.pill.view | AI 피드백 보기 | COMPLETED |
| ai.pill.retry | AI 피드백 재요청 | FAILED + 재요청 가능 |
| ai.pill.failed | AI 피드백 실패 | FAILED + 재요청 불가 |
| ai.pill.recheck | AI 상태 다시 확인 | 첫 `GET` 실패 |
| ai.start.title | AI 피드백을 시작할까요? | 시작 시트 |
| ai.start.title_retry | AI 피드백을 재요청할까요? | 재요청 시트 |
| ai.start.line1 | 결과가 나오기까지 몇 분 정도 소요될 수 있어요 | 시작 시트 안내 |
| ai.start.line2 | 앱을 나가도 분석은 계속되니 걱정마세요 | 시작 시트 안내 |
| ai.start.line3 | 분석이 끝나면 알림으로 알려드릴게요 | 시작 시트 안내 |
| ai.start.confirm | 분석 시작하기 | 시작 시트 버튼 |
| ai.failed.title | AI 피드백을 생성하지 못했어요 | 실패 시트 제목 |
| ai.failed.no_more | 이 사진은 더 이상 AI 피드백을 요청할 수 없어요. | 실패 시트(`canRequestAgain=false`) |
| ai.failed.past | AI 피드백은 오늘 올린 사진만 재요청할 수 있어요. | 실패 시트(지난 주제) |
| ai.failed.confirm | 확인 | 실패 시트 버튼 |
| ai.result.perspective_badge | 작가님의 해석이 돋보이는 작품이에요 | `distinctivePerspective=true` |
| ai.result.strength | 좋았던 점 | 결과 섹션 |
| ai.result.weakness | 아쉬운 점 | 결과 섹션 |
| ai.result.suggestion | 다음엔 이렇게 | 결과 섹션 |
| ai.result.score_a11y | 전체 점수 10점 만점에 {X}점 | 접근성 설명 |
| ai.result.criteria_dialog_title | 찰칵AI는 어떤 기준으로 점수를 내나요? | 기준 설명 다이얼로그 |
| ai.poll.timeout | 처리가 오래 걸리고 있어요. 나중에 다시 확인해 주세요. | 300초 창 종료 (D-03) |
| ai.error.network | 네트워크 연결을 확인해 주세요. | 연결 오류 (D-20) |
| ai.error.load | AI 피드백 정보를 불러오지 못했어요. | 계약 위반·기타 |
| ai.error.login | 다시 로그인해 주세요. | 401 |
| ai.error.banned | 이용이 제한되어 AI 피드백을 요청할 수 없어요. | 403 (D-08) |
| ai.error.not_found | AI 피드백을 확인할 수 없는 게시물이에요. | 404 |
| ai.error.server_message | (서버 `message` 그대로) | `POST` 400 |
| ai.card.request | 이 사진, AI에게 피드백 받아보기 | 홈 카드 NONE |
| ai.card.processing | AI 피드백이 진행중이에요 | 홈 카드 PROCESSING |
| ai.card.completed | AI 피드백이 완료되었어요 | 홈 카드 COMPLETED |
| ai.card.failed | AI 피드백을 생성하지 못했어요 | 홈 카드 FAILED |
| ai.card.detail | 자세히 보기 | 홈 카드 COMPLETED 버튼 |
| ai.card.retry | 재요청 | 홈 카드 FAILED 버튼 |

고른 기준:
- 시작 시트의 소요 시간 안내는 iOS "몇 분 정도"와 Android "최대 1~2분" 중 iOS를 골랐다. 서버가 자동 재시도를 포함해 약 4분(배포 지연 시 더 길게)까지 걸릴 수 있다고 안내하기 때문이다(GUIDE).
- 401 문구는 iOS "로그인이 필요합니다."와 Android "다시 로그인해 주세요." 중 Android를 골랐다(문구 체계가 "~해 주세요"와 맞고, 갱신 불가 상황을 더 잘 설명).
- 그 밖의 오류 문구는 Android의 표(네트워크, 계약 위반, 403, 404)를 기준으로 하되 403은 D-08이 정한 iOS 문구를 쓴다. 용어는 D-03에 따라 모두 "AI 피드백"이며 iOS 홈의 "AI 리뷰를 확인할 수 없는 게시물입니다." 등은 쓰지 않는다.
- 폴링 창 종료 문구는 D-03이 정한 값이다(iOS 홈·피드 공통).

## 플랫폼별 허용 차이

- 시트 형태: 모바일은 하단 시트, 웹은 모달 또는 하단 패널을 써도 된다. 닫으면 요청이 없다는 점은 같아야 한다.
- 결과 시트의 파형·물결 애니메이션 같은 시각 효과는 필수가 아니다.
- 접근성 문구(스크린리더용)는 각 플랫폼의 관례를 따르되 "전체 점수 10점 만점에 X점" 정보를 포함한다.
- 포그라운드 푸시 표시 억제(보고 있는 게시물의 AI 피드백 화면이면 표시 생략을 권장)는 푸시 수신 플랫폼(모바일 4종)의 일이며 웹은 푸시가 없다(Q-04).

## 범위 밖

- AI 프롬프트 버전, OpenAI 호출, 서버 자동 재시도(총 3회 시도): 서버 소관
- 알림함의 AI 결과 항목, 푸시 수신 표시·탭 처리 일반: notification-push.md
- 홈 카드 노출 조건 자체: [home.md](home.md) REQ-HOME-034
- 상세 화면의 다른 요소: [display-feed.md](display-feed.md)
- 처음 사용 시 별도 동의: 없다(AIREVIEW-006, 가입 약관으로 갈음)

## 확인 필요

- 홈 카드에서 실패 재요청은 시작 시트 없이 바로 보내고(Android) 상세는 재요청 시트를 거친다. 두 화면이 달라도 되는지, 한쪽으로 통일할지 결정이 없다. iOS 홈의 재요청 UI는 문서에 없다.
- 기준 설명 다이얼로그(제목 "찰칵AI는 어떤 기준으로 점수를 내나요?")의 본문은 소스에서 확인하지 못했다.
- 점수 표시 형식(소수 첫째 자리 고정 여부, 예: 8 → "8.0")이 문서에 없다. 서버가 소수 첫째 자리 값을 주므로 [추정] 소수 첫째 자리로 표시한다.
- 서버가 보내는 400 `message`는 "AI 리뷰"라는 표현을 쓴다. D-03의 용어 통일과 어긋나지만 D-02(message는 표시용)에 따라 그대로 보여 준다.
- POST가 곧바로 `COMPLETED`를 돌려주는 경우(이미 완료된 게시물) 결과 시트를 자동으로 열지 않는 것으로 정했다[추정].
- 지난 주제 게시물에서 NONE이면 알약을 숨긴다(Android). iOS가 NONE을 어떻게 보여 주는지는 문서에 없다.
- 폴링 창이 끝난 뒤 사용자가 같은 화면에서 직접 다시 확인할 수 있는 동작이 없다(D-03은 재진입·재표시로만 새 창을 연다).
- 푸시 진입 시 최신 `GET`이 `PROCESSING`이면 시트 없이 알약만 "AI 분석중"으로 보이고 폴링한다고 정했다[추정].
- 포그라운드에서 같은 게시물의 AI 결과 푸시를 받았을 때의 표시 정책은 규칙이 없다(API §8.2-13).
