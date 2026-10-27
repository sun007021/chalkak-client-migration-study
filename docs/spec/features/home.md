# 홈 · 배너 (HOME, BANR)

홈은 앱의 첫 화면으로, 오늘의 주제와 내 사진 상태(히어로), 이번 주 기록(일~토), 어제 랭킹과 오늘 인기 사진 5장, 내 오늘 사진의 AI 피드백 카드, 배너(ISSUE) 섹션과 알림 진입을 한곳에 보여 준다. 섹션은 병렬로 불러오고 서로의 실패에 영향받지 않는다. 배너를 누르면 앱 안 웹뷰(웹은 새 탭)로 열고, 링크 클릭은 외부 브라우저로 보낸다. 게스트는 개인 API를 부르지 않고 공개 랭킹·배너·오늘 주제만 본다.

- 관련 규칙: [TOPIC-002](../../reference/business-rules/rules/topic.md#topic-002-주제-날짜), [TOPIC-005](../../reference/business-rules/rules/topic.md#topic-005-사용자-조회), [POST-007](../../reference/business-rules/rules/post.md#post-007-공개-범위), [POST-009](../../reference/business-rules/rules/post.md#post-009-캘린더), [POST-011](../../reference/business-rules/rules/post.md#post-011-작성-여부-사전-확인), [BANNER-006](../../reference/business-rules/rules/banner.md#banner-006-공통-공개-목록-조회), [AIREVIEW-001](../../reference/business-rules/rules/ai-review.md#aireview-001-요청-자격), [LIKE-001](../../reference/business-rules/rules/like.md#like-001-이용-자격)
- 관련 결정: [D-03](../decisions.md#d-03-ai-리뷰-폴링-간격), [D-04](../decisions.md#d-04-좋아요는-모든-화면에서-낙관적-갱신--실패-시-롤백토스트), [D-05](../decisions.md#d-05-게스트-제한), [D-06](../decisions.md#d-06-홈-히어로-상태), [D-08](../decisions.md#d-08-정지banned-회원), [D-10](../decisions.md#d-10-알림-미읽음-표시), [D-11](../decisions.md#d-11-푸시-탭-처리), [D-14](../decisions.md#d-14-업로드-진입업로드-흐름), [D-20](../decisions.md#d-20-오류-화면과-토스트), [D-21](../decisions.md#d-21-네트워크-타임아웃), [D-23](../decisions.md#d-23-게시물-상세의-수정삭제-버튼)
- 근거 약어: iOS = [legacy-ios](../../reference/legacy-ios.md), AN = [legacy-android](../../reference/legacy-android.md), API = [api-contract](../../reference/api-contract.md). 홈 화면 소스 확인은 원본 `client/android/.../feature/home`(AN-src)로 적는다.

## 화면

### 1. 홈 (탭: 홈)

- 진입 조건: 인증 세션 또는 게스트 플래그가 있을 때 메인의 첫 탭. 홈 탭은 선택할 때마다 상태 복원 없이 새로 보인다(AN §1.2).
- 구성 요소(위에서 아래 순서):
  1. 상단 바: 알림 버튼(미읽음 점 포함).
  2. 오늘 주제 머리글: "{M월 d일} · 오늘의 주제"와 주제 제목.
  3. 히어로 카드: 상태 7가지(아래 `## 상태` 참고).
  4. AI 피드백 카드: 오늘 승인된 내 사진이 있을 때만(상세는 [ai-review.md](ai-review.md)).
  5. 이번 주 기록: 제목 "이번 주 기록"과 "N/7", 일~토 7칸, 오른쪽 "보러가기".
  6. 어제 랭킹: 제목 "어제 랭킹", 더보기, 사진 가로 목록(최대 5장).
  7. 오늘 인기있는 사진: 제목 "오늘 인기있는 사진", 더보기, 사진 가로 목록(최대 5장).
  8. ISSUE: 배너 카드 세로 목록(썸네일, 제목, 부제목).
- 사용자 동작:
  - 당겨서 새로고침(웹은 새로고침 버튼 또는 당기기).
  - 히어로가 Empty이면 히어로 전체를 눌러 업로드 진입 게이트로 간다([upload-edit.md](upload-edit.md)).
  - 히어로 Error에서 "다시 시도".
  - 이번 주 기록에서 사진이 있는 칸을 누르면 기록 탭의 그 날짜로 간다. "보러가기"를 누르면 기록 탭으로 간다.
  - 랭킹 사진을 누르면 게시물 상세(피드)로 간다. 랭킹 사진의 하트로 좋아요. 섹션 더보기를 누르면 전시 탭의 해당 날짜(인기순)로 간다.
  - 배너 카드를 누르면 배너 웹뷰로 간다.
  - 알림 버튼을 누르면 알림함으로 간다.

### 2. 배너 웹뷰 (IssueWeb, screen_view `issue`)

- 진입 조건: 홈 ISSUE 카드 탭. 화면 제목은 항상 "ISSUE", 주소는 해당 배너의 `webViewUrl`.
- 구성 요소: 뒤로가기가 있는 상단 바, 웹 콘텐츠, 로딩 표시, 오류 화면(문구 + "다시 시도").
- 사용자 동작: 웹 콘텐츠 보기, 뒤로가기, 오류 시 "다시 시도". 콘텐츠 안의 링크를 누르면 외부 브라우저로 열린다.

## 요구사항

### 병렬 로드와 오늘 주제

| ID | 요구사항 | 근거 |
| --- | --- | --- |
| REQ-HOME-001 | 홈이 처음 보이면 오늘 주제, 오늘 인기, 어제 랭킹, 이번 주 기록, 배너, (로그인 상태일 때) 히어로를 동시에 요청하고, 각 섹션은 자기 응답이 오는 대로 따로 그려진다. | iOS §2.3, AN §2.4, D-20 |
| REQ-HOME-002 | 한 섹션의 로딩 실패는 다른 섹션의 표시 결과를 지우거나 바꾸지 않는다. | iOS HomeFeatureTests L205·L260, D-20 |
| REQ-HOME-003 | "오늘"과 "어제"는 기기 시간대와 상관없이 KST(Asia/Seoul) 날짜로 계산해 `yyyy-MM-dd`로 보낸다. | TOPIC-002, API §6.2 T6, iOS §2.13 |
| REQ-HOME-004 | 오늘 주제는 `GET /topics?date={KST 오늘}`로 받아 머리글에 "{M월 d일} · 오늘의 주제"와 제목을 보여 준다. | AN §2.4, TOPIC-005 |
| REQ-HOME-005 | 오늘 주제를 받는 동안 머리글에 "오늘의 주제를 불러오는 중"을, 404이면 "오늘의 주제가 아직 준비되지 않았어요"를, 그 밖의 실패이면 "오늘의 주제를 불러오지 못했어요"를 보여 준다. | iOS §2.3, AN §2.4, API §5.2 |
| REQ-HOME-006 | 오늘 주제가 404이면 "오늘 인기있는 사진" 섹션은 오류가 아니라 빈 상태("아직 올라온 사진이 없어요")로 표시한다. | iOS HomeFeatureTests L188 |

### 히어로 (D-06)

| ID | 요구사항 | 근거 |
| --- | --- | --- |
| REQ-HOME-007 | 로그인 상태의 히어로는 `GET /posts/today` 한 번의 응답으로 상태를 정하고, 응답을 기다리는 동안 "오늘의 주제를 불러오는 중"을 보여 준다. | D-06, POST-011 |
| REQ-HOME-008 | `/posts/today`가 404이면 히어로에 "지금은 참여할 수 있는 주제가 없어요"를 보여 주고 업로드 진입을 막는다. | D-06 |
| REQ-HOME-009 | `isPosted=false`이면 히어로에 `"{주제}" 사진을 공유하지 않았어요`를 보여 주고, 히어로를 누르면 업로드 진입 게이트를 연다. | D-06, D-14, AN-src HomeHeroCard |
| REQ-HOME-010 | `moderationStatus=VALIDATING`이면 히어로에 "사진을 처리하고 있어요"를 보여 준다. | D-06 |
| REQ-HOME-011 | `moderationStatus=PENDING`이면 내 사진 썸네일 위에 "검수 대기" 배지를 붙여 보여 주고, 이 사진은 상세 API 없이 썸네일로만 표시한다. | D-06, iOS HomeFeatureTests L101, API §4.1(PENDING 상세 404) |
| REQ-HOME-012 | `moderationStatus=APPROVED`이면 배지 없이 내 사진 썸네일을 보여 준다. | D-06 |
| REQ-HOME-013 | 히어로 썸네일은 이번 주 기록(캘린더) 응답에서 `/posts/today`의 `postId`와 같은 항목의 `thumbnailImageUrl`을 쓴다. | D-06 |
| REQ-HOME-014 | `/posts/today`가 403(정지)이면 히어로는 Empty와 같게 보이되, 업로드 진입 시 "이용이 정지되어 게시물을 작성할 수 없어요."를 보여 주고 같은 요청을 다시 보내지 않는다. | D-06, D-08 |
| REQ-HOME-015 | 그 밖의 실패(네트워크, 5xx, 응답 검증 실패)이면 히어로에 "사진 상태를 불러오지 못했어요"와 "다시 시도"를 보여 준다. | D-06, D-20 |
| REQ-HOME-016 | 반려(REJECTED)된 사진은 서버가 `isPosted=false`로 응답하므로 히어로는 Empty가 되어 다시 올릴 수 있고, 반려를 알리는 별도 히어로를 만들지 않는다. | D-06, API §6.2 P3 |
| REQ-HOME-017 | `isPosted=false`인데 `postId`나 `moderationStatus`가 있거나, `isPosted=true`인데 `postId`가 없는 응답은 잘못된 응답으로 보고 REQ-HOME-015로 처리한다. | iOS PhotoUploadFeatureTests L415, API §1.3 |
| REQ-HOME-018 | 게스트의 히어로는 `/posts/today`를 부르지 않고 Empty로 표시하며, 누르면 "게시물을 추가하려면 로그인이 필요해요" 토스트를 띄운다. | D-05, D-06, AN §2.4 |

### 이번 주 기록

| ID | 요구사항 | 근거 |
| --- | --- | --- |
| REQ-HOME-019 | 이번 주는 KST 오늘이 속한 일요일부터 토요일까지 7일이다. | AN §2.4, iOS HomeFeatureTests L7 |
| REQ-HOME-020 | 주가 두 달(또는 두 해)에 걸치면 걸친 달마다 `GET /posts/calendar?year&month`를 따로 불러 합친다(연말 12월→1월 포함). | AN §2.4 HomeViewModelTest, iOS HomeFeatureTests L7 |
| REQ-HOME-021 | 이번 주 기록 머리글에는 "이번 주 기록"과 사진이 있는 날 수를 "N/7"로 보여 준다. | AN-src HomeWeeklyRecord |
| REQ-HOME-022 | 7칸은 요일(일~토)과 날짜를 보여 주고, 기록이 있는 칸은 `thumbnailImageUrl`을 보여 주며, 상태가 PENDING인 칸에는 "대기"를 붙인다. | AN-src HomeWeeklyRecord, iOS §2.3 |
| REQ-HOME-023 | 기록이 있는 칸을 누르면 기록 탭을 열어 그 날짜의 달을 불러오고 그 날짜를 선택하며, 기록이 없는 칸은 눌러도 아무 일도 없다. | AN-src HomeWeeklyRecord, iOS RecordFeatureTests L146, [record.md](record.md) |
| REQ-HOME-024 | "보러가기"를 누르면 기록 탭으로 이동한다. | AN-src HomeWeeklyRecord |
| REQ-HOME-025 | 이번 주 기록 요청이 실패하면 이 섹션에 "기록을 불러오지 못했어요"와 다시 시도 버튼을 보여 주고, 다시 시도는 이 섹션만 다시 부른다. | AN-src HomeWeeklyRecord, iOS §2.3 |
| REQ-HOME-026 | 게스트는 이번 주 기록 API를 부르지 않고 7칸을 모두 빈 칸으로 보여 준다. | AN §2.4, iOS HomeFeatureTests L82 |

### 랭킹과 오늘 인기

| ID | 요구사항 | 근거 |
| --- | --- | --- |
| REQ-HOME-027 | "오늘 인기있는 사진"은 `GET /posts?topicDate={오늘 주제의 날짜}&sort=popular&page=1&pageSize=20` 응답에서 서버 순서 그대로 앞 5장만 보여 준다. | AN §2.4, iOS §2.3, API §1.3 |
| REQ-HOME-028 | "어제 랭킹"은 KST 어제 날짜로 같은 방식(`GET /topics` 후 `sort=popular`)으로 불러 앞 5장을 보여 준다. | AN §2.4, iOS §2.3 |
| REQ-HOME-029 | 해당 날짜 주제가 없거나(404) 사진이 0장이면 그 섹션은 "아직 올라온 사진이 없어요"를 보여 준다. | AN-src HomeRankingRow, API §5.2 |
| REQ-HOME-030 | 랭킹 요청이 실패하면 그 섹션만 "{섹션 제목} 사진을 불러오지 못했어요"(예: "어제 랭킹 사진을 불러오지 못했어요")를 보여 준다. | AN-src HomeRankingRow, iOS HomeFeatureTests L205 |
| REQ-HOME-031 | 섹션 더보기를 누르면 전시 탭을 열어 그 섹션의 날짜(어제 또는 오늘)를 인기순으로 보여 준다. | AN §2.4, iOS HomeFeatureTests L526 |
| REQ-HOME-032 | 랭킹 사진을 누르면 게시물 상세로 가고, 게스트는 이동하지 않고 "게시물 피드를 보려면 로그인이 필요해요"를 토스트로 보여 준다. | AN §2.4, D-05 |
| REQ-HOME-033 | 랭킹 사진의 좋아요는 전시와 같은 낙관적 갱신·롤백 규칙을 따르고(REQ-LIKE-001~012), 게스트는 API 없이 "좋아요를 누르려면 로그인이 필요해요"를 보여 준다. | D-04, D-05 |

### AI 피드백 카드

| ID | 요구사항 | 근거 |
| --- | --- | --- |
| REQ-HOME-034 | AI 피드백 카드는 히어로가 APPROVED이고 그 사진의 주제 날짜가 KST 오늘일 때만 보여 주고, PENDING·VALIDATING·Empty·게스트에서는 보여 주지 않는다. | AN §2.4, AIREVIEW-001 |
| REQ-HOME-035 | 카드는 `GET /posts/{postId}/ai-review` 응답의 `status`에 따라 문구와 동작이 바뀌며(상태별 문구는 [ai-review.md](ai-review.md)), 404이면 카드를 숨긴다. | AN §2.4·§2.9, AIREVIEW-003 |
| REQ-HOME-036 | 카드가 PROCESSING을 보여 주는 동안 홈이 보일 때만 3초 간격으로 조회하고, 홈이 보이지 않으면 멈추며 다시 보이면 GET부터 새 300초 창을 시작한다. | D-03 |
| REQ-HOME-037 | 홈으로 돌아왔을 때 같은 게시물의 COMPLETED 결과는 다시 조회하지 않고 유지하며, 게시물이 바뀌면 이전 결과를 지우고 새로 조회한다. | iOS HomeAIReviewTests L7·L50 |

### 새로고침과 재로드

| ID | 요구사항 | 근거 |
| --- | --- | --- |
| REQ-HOME-038 | 당겨서 새로고침하면 보이던 콘텐츠를 유지한 채 인디케이터만 보여 주며 모든 섹션을 다시 요청하고, 배너는 1페이지부터 다시 받는다. | AN §2.4, D-20 |
| REQ-HOME-039 | 새로고침이 실패한 섹션은 기존 콘텐츠를 지우지 않고 토스트로만 알린다(네트워크 오류는 "네트워크 연결을 확인해 주세요."). | D-20, iOS HomeFeatureTests L275 |
| REQ-HOME-040 | 앱이 포그라운드로 돌아오거나 다른 탭에서 홈이 다시 보이면 화면을 비우지 않고 조용히 모든 섹션을 갱신한다. | AN §2.4, iOS §2.3 |
| REQ-HOME-041 | 홈이 보이거나 포그라운드로 돌아올 때 현재 KST 날짜가 마지막으로 불러온 날짜와 다르면 오늘 주제, 랭킹 날짜, 이번 주 범위, 히어로를 모두 새 날짜 기준으로 다시 불러온다. | AN §2.4 HomeViewModelTest, iOS HomeFeatureTests L35 |
| REQ-HOME-042 | 화면을 벗어나 취소된 요청이나 새 로드가 시작된 뒤 도착한 이전 응답은 현재 화면 상태를 덮어쓰지 않는다. | iOS HomeFeatureTests L222·L295 |
| REQ-HOME-043 | 업로드 성공, 게시물 삭제가 일어난 뒤 홈이 다시 보이면 히어로·이번 주 기록·AI 카드가 새 상태를 반영한다. | D-23, D-14 |
| REQ-HOME-044 | 푸시 `TOPIC`/`REMINDER` 탭으로 홈이 열리면 맨 위로 스크롤하고 새로고침하며, 이미 홈이면 홈을 중복해서 쌓지 않는다. | D-11 |

### 알림 진입과 게스트

| ID | 요구사항 | 근거 |
| --- | --- | --- |
| REQ-HOME-045 | 상단 알림 버튼에는 미읽음이 있을 때 점을 표시하고, 홈이 보일 때·앱이 포그라운드로 올 때·알림함에서 돌아올 때·푸시를 받았을 때 `GET /notifications/unread-status`를 다시 조회한다. | D-10 |
| REQ-HOME-046 | 게스트가 알림 버튼을 누르면 API 없이 "로그인 후 알림을 확인할 수 있어요"를 토스트로 보여 주고 미읽음 조회도 하지 않는다. | D-05, D-10 |
| REQ-HOME-047 | 게스트의 홈은 `GET /topics`, 랭킹, 배너만 인증 헤더 없이 부르고 `/posts/today`, `/posts/calendar`, AI 피드백, 미읽음 조회는 부르지 않는다. | D-05, AN §2.4, API §0.1 |
| REQ-HOME-048 | 진입 시점에 한 번이라도 401이 나면 D-17의 갱신·재인증 규칙을 그대로 따르며, 게스트 요청의 401은 갱신하지 않는다. | D-17 |

### 배너 목록 (BANR)

| ID | 요구사항 | 근거 |
| --- | --- | --- |
| REQ-BANR-001 | 배너는 `GET /banners?page=1&pageSize=10`을 Authorization 헤더 없이 호출하며, 로그인 상태에서도 토큰을 붙이지 않는다. | BANNER-006, API §6.2 B6·B7, AN §3.1 |
| REQ-BANR-002 | 응답의 `banners`는 서버가 준 순서를 유지하고, `hasNext` 필드가 없으면 마지막 페이지로 처리한다. | iOS BannerAPIClientTests L8·L63 |
| REQ-BANR-003 | 배너의 `webViewUrl`이 https가 아니거나 응답 JSON이 깨졌으면 그 응답 전체를 잘못된 응답으로 보고, `thumbnailUrl`만 잘못된 배너는 유지하고 썸네일 자리에 대체 배경을 보여 준다. | iOS BannerAPIClientTests L89·L104, BANNER-002 |
| REQ-BANR-004 | ISSUE 섹션은 헤더 "ISSUE"와 배너 카드(썸네일, 제목, 부제목) 세로 목록으로 그려지고, 카드 하나가 하나의 배너를 나타낸다. | iOS §2.3, AN-src HomeIssueSection |
| REQ-BANR-005 | 성공했지만 배너가 0개이면 ISSUE 섹션 전체를 숨긴다. | AN §2.4 |
| REQ-BANR-006 | 최초 배너 조회가 실패하면 ISSUE 자리에 "ISSUE를 불러오지 못했어요. 다시 시도"를 보여 주고, 그 실패는 다른 섹션에 영향을 주지 않는다. | iOS §2.3·HomeFeatureTests L260, D-20 |
| REQ-BANR-007 | 목록은 10개씩 누적하며, 마지막으로 보이는 카드가 마지막에서 두 번째 이내에 들어오면 다음 페이지를 요청한다. | AN §2.4, AN-src HomeScreen(ISSUE_PREFETCH_DISTANCE=2), iOS HomeFeatureTests L311 |
| REQ-BANR-008 | 이미 다음 페이지를 불러오는 중이거나 `hasNext=false`이거나 직전 추가 페이지가 비었으면 다음 페이지를 요청하지 않는다. | iOS HomeFeatureTests L311·L357·L374 |
| REQ-BANR-009 | 다음 페이지 요청이 실패하면 쌓인 배너를 유지하고 같은 페이지 번호로 다시 시도할 수 있게 하며, 같은 `id`의 배너는 한 번만 보여 준다. | iOS HomeFeatureTests L336 |
| REQ-BANR-010 | 새로고침은 누적된 배너를 새 1페이지로 교체하고 다음 요청을 2페이지부터 다시 시작하며, 새로고침 이전에 보낸 추가 페이지의 늦은 응답은 버린다. | iOS HomeFeatureTests L390·L426 |
| REQ-BANR-011 | 새로고침 실패는 기존 배너를 유지하고, 새로고침이 빈 성공 응답이면 기존 배너를 지운다. | iOS HomeFeatureTests L275 |

### 배너 웹뷰 (BANR)

| ID | 요구사항 | 근거 |
| --- | --- | --- |
| REQ-BANR-012 | 배너 카드를 누르면 제목 "ISSUE"의 웹뷰 화면을 열고 `screen_view`로 `issue`를 보낸다. | AN §2.4, D-22 |
| REQ-BANR-013 | https가 아닌 주소와 호스트가 없는 주소는 웹뷰에 로드하지 않고 "링크를 열 수 없어요"를 보여 준다. | iOS §2.3, AN §2.5 |
| REQ-BANR-014 | 웹뷰는 최초 로드만 앱 안에서 처리하고, 사용자 제스처 없는 이후 자동 이동과 새 창 열기는 차단한다. | iOS IssueWebNavigationPolicyTests L10, AN §2.5 |
| REQ-BANR-015 | 사용자가 누른 http(s) 링크(새 탭 링크, 같은 호스트·같은 URL 포함)는 앱 안에서 이동하지 않고 외부 브라우저로 연다. | iOS IssueWebNavigationPolicyTests L19, AN §2.5 |
| REQ-BANR-016 | 같은 문서 안의 앵커 이동은 웹뷰 안에서 처리하고, 새 탭 앵커는 외부로 보낸다. | iOS IssueWebNavigationPolicyTests L27 |
| REQ-BANR-017 | http(s)가 아닌 스킴(`tel:`, `intent:`, 커스텀 스킴 등)의 링크는 실행하지 않는다. | iOS IssueWebNavigationPolicyTests L39, AN §2.5 |
| REQ-BANR-018 | 하위 프레임(iframe)의 이동은 웹뷰 안에서 처리하고 앱 밖으로 열지 않는다. | iOS IssueWebNavigationPolicyTests L45, AN §2.5 |
| REQ-BANR-019 | 페이지 로드가 실패하면 "페이지를 불러오지 못했어요"와 "다시 시도"를 보여 주고, 다시 시도는 같은 주소를 다시 로드한다. | iOS §2.3 |
| REQ-BANR-020 | 링크를 열 수 있는 브라우저가 없으면 "링크를 열 수 있는 브라우저가 없어요", 브라우저 열기에 실패하면 "브라우저에서 링크를 열지 못했어요"를 토스트로 보여 준다. | AN §2.5 |

## 상태

### 히어로 상태 (D-06)

| 상태 | 진입 조건 | 보이는 것 | 다음 전이 |
| --- | --- | --- | --- |
| Loading | 홈 첫 로드 또는 히어로 다시 시도 | "오늘의 주제를 불러오는 중" | 응답에 따라 아래 상태 |
| NoOpenTopic | `/posts/today` 404 | "지금은 참여할 수 있는 주제가 없어요" | 새로고침·복귀 시 재조회 |
| Empty | `isPosted=false`, 403, 게스트 | `"{주제}" 사진을 공유하지 않았어요` | 히어로 탭 → 업로드 진입 게이트 |
| Processing | `VALIDATING` | "사진을 처리하고 있어요" | 새로고침·복귀 시 재조회 |
| Photo (대기) | `PENDING` | 썸네일 + "검수 대기" 배지 | 새로고침·복귀 시 재조회 |
| Photo | `APPROVED` | 썸네일 | 새로고침·복귀 시 재조회 |
| Error | 그 외 실패 | "사진 상태를 불러오지 못했어요" + 다시 시도 | 다시 시도 → Loading |

### 섹션 상태(주제 머리글, 랭킹 2종, 이번 주 기록, 배너 공통)

| 상태 | 진입 조건 | 보이는 것 | 다음 전이 |
| --- | --- | --- | --- |
| Loading | 최초 요청 중 | 자리 표시(스켈레톤) | Ready 또는 Error |
| Ready(내용 있음) | 성공 + 1건 이상 | 내용 | 새로고침 중에도 유지 |
| Ready(빈 상태) | 성공 + 0건 또는 주제 404 | 랭킹: "아직 올라온 사진이 없어요" / 배너: 섹션 숨김 | 새로고침 |
| Error | 최초 요청 실패 | 섹션별 오류 문구 + 다시 시도 | 다시 시도 → Loading |
| Refreshing | 당겨서 새로고침·복귀 갱신 | 기존 내용 유지 | 성공 → 교체, 실패 → 유지 + 토스트 |

### 배너 목록 페이징 상태

| 상태 | 진입 조건 | 다음 전이 |
| --- | --- | --- |
| 첫 페이지 로딩 | 홈 로드·새로고침 | 성공(Ready/빈), 실패(Error) |
| 다음 페이지 대기 | `hasNext=true` | 끝에서 두 번째 이내 도달 → 다음 페이지 로딩 |
| 다음 페이지 로딩 | prefetch 조건 충족, 다른 로딩 없음 | 성공 → 누적, 실패 → 다음 페이지 대기(같은 페이지 번호 재시도) |
| 마지막 | `hasNext=false` 또는 빈 추가 페이지 | 새로고침 전까지 요청 없음 |

### 배너 웹뷰 상태

| 상태 | 진입 조건 | 다음 전이 |
| --- | --- | --- |
| 로딩 | 화면 진입, 다시 시도 | 완료 → 표시, 실패 → 오류 |
| 표시 | 로드 완료 | 링크 탭 → 외부 브라우저(화면 유지) |
| 오류 | 로드 실패 또는 안전하지 않은 주소 | 다시 시도 → 로딩 |

## API 호출

모든 호출은 D-21의 타임아웃과 재시도(GET은 네트워크 오류·5xx에 0.5초·1초 간격으로 최대 2회)를 따른다. 응답 JSON의 시각은 UTC `Instant`, 날짜는 `yyyy-MM-dd`다.

### 호출 순서

홈이 처음 보이면 아래를 동시에 시작한다. 같은 줄의 호출은 앞의 응답이 있어야 시작한다.

| 그룹 | 호출 | 로그인 | 게스트 | 핵심 요청/응답 |
| --- | --- | --- | --- | --- |
| A 오늘 | `GET /topics?date={KST 오늘}` → `GET /posts?topicDate={응답 topicDate}&sort=popular&page=1&pageSize=20` | 호출 | 호출 | 주제 `{id, title, topicDate, phase}`. 게시물 `posts[]`의 `id`, `thumbnailImageUrl`, `originalImageUrl`, `likeCount`, `isLiked`, `isMine` |
| B 어제 | `GET /topics?date={KST 어제}` → `GET /posts?topicDate=…&sort=popular&page=1&pageSize=20` | 호출 | 호출 | 위와 같음 |
| C 주간 | `GET /posts/calendar?year&month` (주가 걸친 달마다) | 호출 | 호출 안 함 | `{year, month, posts[{topicDate, postId, thumbnailImageUrl, status}]}` |
| D 히어로 | `GET /posts/today` | 호출 | 호출 안 함 | `{topicDate, isPosted, postId, moderationStatus}` |
| E 배너 | `GET /banners?page=1&pageSize=10` (Authorization 없음) | 호출 | 호출 | `{currentPage, pageSize, hasNext, banners[{id, title, subtitle, webViewUrl, thumbnailUrl, createdAt}]}` |
| F AI 카드 | `GET /posts/{postId}/ai-review` (히어로가 APPROVED이고 오늘 주제일 때만, D의 응답 뒤) | 호출 | 호출 안 함 | [ai-review.md](ai-review.md) |
| G 미읽음 | `GET /notifications/unread-status` | 호출 | 호출 안 함 | `{hasUnread}` |

### 실패별 처리

| 호출 | HTTP + errorCode | 동작 | 사용자 문구 |
| --- | --- | --- | --- |
| `GET /topics` | 404 `BUSINESS_ERROR` | 주제 없음으로 처리, 인기/랭킹 섹션은 빈 상태 | 머리글(오늘): "오늘의 주제가 아직 준비되지 않았어요" / 섹션: "아직 올라온 사진이 없어요" |
| `GET /topics` | 400 `BUSINESS_ERROR`(미래 날짜) | 클라이언트 날짜 계산 오류로 보고 실패 처리, 재시도 안 함 | 머리글: "오늘의 주제를 불러오지 못했어요" |
| `GET /topics`, `GET /posts` | 네트워크 오류·타임아웃·5xx | 자동 재시도 후에도 실패하면 해당 섹션만 Error | 머리글: "오늘의 주제를 불러오지 못했어요" / 랭킹: "{섹션 제목} 사진을 불러오지 못했어요" |
| `GET /posts` | 404 `BUSINESS_ERROR`("해당 날짜의 주제를 찾을 수 없습니다.") | 빈 상태 | "아직 올라온 사진이 없어요" |
| `GET /posts`, `GET /topics` | 응답 검증 실패(`topicDate` 불일치 등) | 해당 섹션 Error | 위와 같음 |
| `GET /posts/today` | 404 | NoOpenTopic | "지금은 참여할 수 있는 주제가 없어요" |
| `GET /posts/today` | 403 `FORBIDDEN` | Empty, 업로드 진입 때 D-08 안내, 재요청 안 함 | `"{주제}" 사진을 공유하지 않았어요` (진입 시 "이용이 정지되어 게시물을 작성할 수 없어요.") |
| `GET /posts/today` | 401 `UNAUTHORIZED` | D-17 갱신 후 1회 재전송, `REAUTHENTICATION_REQUIRED`면 로그인 화면 | — |
| `GET /posts/today` | 그 외 | Error | "사진 상태를 불러오지 못했어요" |
| `GET /posts/calendar` | 400 `BUSINESS_ERROR` | 주간 기록 Error | "기록을 불러오지 못했어요" |
| `GET /posts/calendar` | 401 | D-17 | — |
| `GET /posts/calendar` | 네트워크·5xx·응답 검증 실패 | 주간 기록 Error(히어로 썸네일은 대체 배경) | "기록을 불러오지 못했어요" |
| `GET /banners` | 400 `BUSINESS_ERROR`("조회 조건이 올바르지 않습니다.") | 클라이언트 버그로 보고 Error | "ISSUE를 불러오지 못했어요. 다시 시도" |
| `GET /banners` | 네트워크·5xx·응답 검증 실패 | 최초면 Error, 추가 페이지면 쌓인 목록 유지 + 같은 페이지 재시도 가능, 새로고침이면 기존 유지 | 최초: "ISSUE를 불러오지 못했어요. 다시 시도" / 새로고침: D-20 토스트 |
| `GET /banners` | 401 | 토큰을 붙이지 않으므로 발생하지 않는다. 발생하면 Error로 처리하고 갱신하지 않는다 | — |
| `GET /notifications/unread-status` | 모든 실패 | 점 상태를 바꾸지 않고 조용히 무시 | 없음 |

실패 문구가 새로고침 중이면 콘텐츠가 있으므로 D-20에 따라 토스트로만 알린다(REQ-HOME-039).

## 문구

공통 문구는 [common-infra.md](common-infra.md)가 따로 정하면 그쪽을 따른다. 아래는 홈에서 쓰는 것이다.

| 키 | 문구 | 상황 |
| --- | --- | --- |
| home.topic.header | {M월 d일} · 오늘의 주제 | 오늘 주제 머리글(KST 날짜) |
| home.topic.loading | 오늘의 주제를 불러오는 중 | 히어로·머리글 로딩 (D-06) |
| home.topic.error | 오늘의 주제를 불러오지 못했어요 | 주제 조회 실패 |
| home.topic.not-ready | 오늘의 주제가 아직 준비되지 않았어요 | 주제 404 |
| home.hero.no-open-topic | 지금은 참여할 수 있는 주제가 없어요 | `/posts/today` 404 |
| home.hero.empty | "{주제}" 사진을 공유하지 않았어요 | Empty. 주제 제목이 비면 "오늘의 주제"로 대체 |
| home.hero.processing | 사진을 처리하고 있어요 | VALIDATING |
| home.hero.pending-badge | 검수 대기 | PENDING 히어로 배지 |
| home.hero.error | 사진 상태를 불러오지 못했어요 | 히어로 실패 |
| home.hero.retry | 다시 시도 | 히어로·섹션 다시 시도 버튼 |
| home.weekly.title | 이번 주 기록 | 섹션 제목 |
| home.weekly.more | 보러가기 | 기록 탭으로 이동 |
| home.weekly.pending | 대기 | PENDING 칸 라벨 |
| home.weekly.error | 기록을 불러오지 못했어요 | 주간 기록 실패 |
| home.ranking.yesterday-title | 어제 랭킹 | 섹션 제목 |
| home.ranking.today-title | 오늘 인기있는 사진 | 섹션 제목 |
| home.ranking.empty | 아직 올라온 사진이 없어요 | 랭킹 빈 상태 |
| home.ranking.error | {섹션 제목} 사진을 불러오지 못했어요 | 랭킹 실패 |
| home.banner.title | ISSUE | 배너 섹션 제목, 웹뷰 화면 제목 |
| home.banner.error | ISSUE를 불러오지 못했어요. 다시 시도 | 최초 배너 실패 |
| banner.web.link-unavailable | 링크를 열 수 없어요 | 안전하지 않은 주소 |
| banner.web.load-error | 페이지를 불러오지 못했어요 | 웹뷰 로드 실패 |
| banner.web.retry | 다시 시도 | 웹뷰 오류 버튼 |
| banner.web.no-browser | 링크를 열 수 있는 브라우저가 없어요 | 외부 열기 불가 |
| banner.web.open-failed | 브라우저에서 링크를 열지 못했어요 | 외부 열기 실패 |
| home.guest.upload | 게시물을 추가하려면 로그인이 필요해요 | 게스트가 히어로 탭 (D-05) |
| home.guest.feed | 게시물 피드를 보려면 로그인이 필요해요 | 게스트가 랭킹 사진 탭 (D-05) |
| home.guest.like | 좋아요를 누르려면 로그인이 필요해요 | 게스트가 하트 탭 (D-05) |
| home.guest.notification | 로그인 후 알림을 확인할 수 있어요 | 게스트가 알림 버튼 탭 (D-05) |
| home.hero.banned | 이용이 정지되어 게시물을 작성할 수 없어요. | 403 후 업로드 진입 (D-08) |
| common.error.network | 네트워크 연결을 확인해 주세요. | 연결 실패·타임아웃 (D-20) |

고른 기준: 히어로 로딩 문구는 iOS "사진을 확인하고 있어요"/Android "사진을 확인하고 있어요" 대신 결정 문서(D-06)의 "오늘의 주제를 불러오는 중"을 쓴다. 삭제 토스트는 iOS "게시물이 삭제됐어요" 대신 D-23의 "게시물을 삭제했어요"를 쓴다([display-feed.md](display-feed.md)). 그 밖의 문구는 iOS와 Android가 같았다.

## 플랫폼별 허용 차이

- 새로고침 방식: 모바일 4종은 당겨서 새로고침, 웹은 당기기 또는 새로고침 버튼. 동작 결과(콘텐츠 유지 + 전체 재요청)는 같아야 한다.
- 이번 주 기록·랭킹 가로 목록의 스크롤 물리, 카드 모서리·간격 같은 시각 요소는 플랫폼 관례를 따른다.
- 배너 웹뷰: 모바일은 앱 안 웹뷰, 웹은 현재 탭을 유지한 채 새 탭에서 연다(임베드가 막히는 사이트 대응). 이때도 https 외 주소 차단과 "외부로 연 링크는 앱 안에서 이동하지 않음" 원칙은 같다.
- 하단바 숨김·표시, 상단 바 형태, 햅틱은 플랫폼 관례를 따른다.
- 웹 데스크톱에서 "알림 권한" 등 푸시 관련 표시는 없다(open-questions Q-04).

## 범위 밖

- 업로드 화면·편집기·성공 화면: [upload-edit.md](upload-edit.md)
- 게시물 상세, 좋아요, 전시: [display-feed.md](display-feed.md)
- AI 피드백 시트와 결과: [ai-review.md](ai-review.md)
- 기록 탭 자체: [record.md](record.md)
- 알림함, 푸시 탭 이동, 알림 권한: notification-push.md
- 스플래시 700ms 프리로드와 홈 데이터 프리로드: boot-auth.md
- 작가 공개 사진(`GET /users/{id}/posts`): 2차 범위

## 확인 필요

- 히어로가 APPROVED/PENDING 사진을 눌렀을 때의 동작이 기존 앱 문서에 없다. Android 소스상 Empty만 클릭 동작이 있어 Photo는 누를 곳이 없는 것으로 보인다[추정]. 규칙·결정이 없으므로 현재는 "눌러도 이동 없음"으로 구현하고 확인을 요청한다.
- `/posts/today`의 `topicDate`가 KST 오늘과 다른 경우(참여 기간이 KST 자정에 맞지 않는 주제, API §6.2 T11)에 머리글(KST 오늘 주제), 히어로(요청 시점의 OPEN 주제), 이번 주 기록 범위가 서로 다른 날짜를 가리킬 수 있다. 어느 쪽을 기준으로 맞출지 정책이 없다.
- 히어로가 Processing(VALIDATING)일 때 자동으로 다시 조회할지(폴링) 여부가 없다. 현재는 새로고침·복귀 때만 다시 조회한다(Q-08과 같은 맥락).
- 배너 초기 실패 처리가 iOS("ISSUE를 불러오지 못했어요. 다시 시도"를 보여 줌)와 Android(섹션 숨김)에서 다르다. 결정이 없어 D-20(콘텐츠가 없으면 오류 + 다시 시도)에 맞춰 iOS 쪽으로 적었다.
- 새로고침 실패 토스트를 섹션이 여러 개 동시에 실패했을 때 몇 건 띄울지 정해진 바 없다. 현재는 한 번의 새로고침당 최대 1건(첫 실패 섹션의 문구)으로 둔다[추정].
- 이번 주 기록 칸이 PENDING일 때 눌러서 기록 탭으로 이동하는 것이 맞는지(Android는 `post != null`이면 클릭 가능) 확인이 필요하다.
- 어제 날짜가 `FIRST_TOPIC_DATE`(2026-09-17)보다 이전일 때(최초 전시일 당일) 어제 랭킹 섹션을 숨길지, 404 빈 상태로 둘지 정해진 바 없다. 현재는 404 빈 상태.
- 새 홈 진입이 아니라 홈이 계속 보이는 상태에서 KST 자정을 지나는 경우 타이머로 자동 재로드할지는 문서에 없다. REQ-HOME-041은 홈이 다시 보이거나 포그라운드로 돌아올 때만 검사한다.
