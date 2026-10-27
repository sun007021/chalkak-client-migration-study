# 전시 · 게시물 상세 · 좋아요 (DISP, FEED, LIKE)

전시 탭은 날짜별 주제의 사진을 2열 그리드로 보여 준다. 오늘 전시는 최신순·인기순·랜덤순을 고를 수 있고, 지난 날짜는 인기순으로 고정된 아카이브(상위 5장 추천 카드 + 그리드)로 본다. 날짜는 최초 전시일(2026-09-17)부터 KST 오늘까지 이동·선택할 수 있고, 목록은 (날짜, 정렬) 단위로 캐시하며 늦게 온 응답이 최신 상태를 덮지 않도록 보호한다. 사진을 누르면 게시물 상세(피드)로 가서 확대해 보고, 내 게시물은 오늘 주제일 때 제목을 고치고 언제든 삭제할 수 있다. 좋아요는 모든 화면에서 즉시 반영하고 실패하면 되돌린다.

- 관련 규칙: [POST-005](../../reference/business-rules/rules/post.md#post-005-제목-입력), [POST-007](../../reference/business-rules/rules/post.md#post-007-공개-범위), [POST-008](../../reference/business-rules/rules/post.md#post-008-피드-정렬과-표시-정보), [POST-010](../../reference/business-rules/rules/post.md#post-010-삭제와-수정), [TOPIC-002](../../reference/business-rules/rules/topic.md#topic-002-주제-날짜), [TOPIC-005](../../reference/business-rules/rules/topic.md#topic-005-사용자-조회), [LIKE-001](../../reference/business-rules/rules/like.md#like-001-이용-자격), [LIKE-002](../../reference/business-rules/rules/like.md#like-002-대상-게시물), [LIKE-003](../../reference/business-rules/rules/like.md#like-003-중복과-취소), [LIKE-004](../../reference/business-rules/rules/like.md#like-004-표시와-집계), [LIKE-005](../../reference/business-rules/rules/like.md#like-005-게시물-삭제)
- 관련 결정: [D-01](../decisions.md#d-01-제목캡션-길이-계산), [D-02](../decisions.md#d-02-서버-오류-분기는-errorcode--http-상태--호출-api로만), [D-04](../decisions.md#d-04-좋아요는-모든-화면에서-낙관적-갱신--실패-시-롤백토스트), [D-05](../decisions.md#d-05-게스트-제한), [D-08](../decisions.md#d-08-정지banned-회원), [D-12](../decisions.md#d-12-최초-전시일), [D-20](../decisions.md#d-20-오류-화면과-토스트), [D-21](../decisions.md#d-21-네트워크-타임아웃), [D-23](../decisions.md#d-23-게시물-상세의-수정삭제-버튼)
- 근거 약어: iOS = [legacy-ios](../../reference/legacy-ios.md), AN = [legacy-android](../../reference/legacy-android.md), API = [api-contract](../../reference/api-contract.md). AN-src = 원본 `client/android/.../feature/display` 등 소스 확인.

## 화면

### 1. 전시 (탭: 전시, screen_view `display`)

- 진입 조건: 하단 탭 "전시", 홈 랭킹 더보기(어제/오늘, 인기순), 기록의 "전시 보러가기"(그 날짜), 업로드 성공 화면의 확인(업로드한 날짜). 게스트도 들어올 수 있다(D-05).
- 구성 요소:
  1. 머리글: 이전 날짜 화살표, 날짜("M월 d일", 누르면 날짜 선택), 다음 날짜 화살표, 주제 제목, 설명 문구.
  2. 정렬 탭(오늘 날짜일 때만): 최신순 / 인기순 / 랜덤순.
  3. 본문: 2열 메이슨리 그리드. 지난 날짜면 그리드 위에 추천 카드 페이저(인기 상위 5장).
  4. 날짜 선택 시트: 제목 "날짜 선택", 년/월/일 휠.
- 사용자 동작: 화살표로 하루씩 이동, 날짜 선택, 정렬 변경, 스크롤로 다음 페이지, 사진 탭(피드로), 하트 탭(좋아요), 전시 탭 다시 누르기(맨 위로 + 재검증), 오류 시 "다시 시도".

### 2. 게시물 상세 (피드, screen_view `feed`)

- 진입 조건: 전시·홈 랭킹의 사진 탭(선택한 게시물을 먼저 보여 주고 상세를 재검증), 기록의 "피드에서 보기"(postId, 내 게시물, 썸네일 전달), 푸시 `POST_APPROVED`·`AI_REVIEW_*`(postId, 내 게시물). 로그인 필요, 게스트는 진입 불가(D-05).
- 구성 요소: 하단바 숨김, 뒤로가기, 날짜 라벨("M월 d일의 주제"), 원본 사진 위의 작가 사인, 제목(없으면 "무제"), 좋아요 버튼과 개수, 수정 버튼(조건부), 삭제 버튼(조건부), AI 피드백 알약(내 게시물, [ai-review.md](ai-review.md)).
- 사용자 동작: 핀치 줌, 뒤로가기(제스처 포함), 좋아요, 제목 수정, 삭제, AI 피드백.

### 3. 제목 수정 다이얼로그

- 진입 조건: 상세에서 수정 버튼(내 게시물 + 상세의 `topic.topicDate`가 KST 오늘, D-23).
- 구성 요소: 제목 "게시물 제목 수정", 한 줄 입력(플레이스홀더 "제목을 입력해 주세요."), "취소", "저장"(저장 중에는 "저장 중...").
- 사용자 동작: 입력, 저장, 취소.

### 4. 삭제 확인 다이얼로그

- 진입 조건: 상세에서 삭제 버튼(내 게시물).
- 구성 요소: 제목 "게시물 삭제", 본문 "게시물을 삭제하시겠어요?", "취소", "삭제".

## 요구사항

### 전시: 날짜와 범위 (DISP)

| ID | 요구사항 | 근거 |
| --- | --- | --- |
| REQ-DISP-001 | 전시 탭을 처음 열면 KST 오늘 날짜의 최신순 전시를 보여 주고, 다른 화면이 날짜(와 정렬)를 지정해 열면 그 값으로 연다. | AN §2.6, iOS §2.4, AN §1.4 |
| REQ-DISP-002 | 한 날짜의 전시는 먼저 `GET /topics?date={날짜}`로 주제를 확인하고, 응답의 `topicDate`로 `GET /posts`를 부르며, 응답 `topicDate`가 요청 날짜와 다르면 잘못된 응답으로 처리한다. | iOS DisplayFeatureTests L21·L904, API §1.4 |
| REQ-DISP-003 | 머리글은 선택한 날짜를 "M월 d일"로, 그 아래 주제 제목을 보여 준다. | AN-src DisplayDateHeader |
| REQ-DISP-004 | 머리글 설명은 오늘 날짜일 때 "같은 주제에서 다른 시선을 느껴보세요", 지난 날짜(아카이브)일 때 "가장 사람들이 좋아했던 사진들이에요"로 보여 준다. | AN-src DisplayDateHeader, iOS §2.4 |
| REQ-DISP-005 | 이동·선택 가능한 날짜의 하한은 `FIRST_TOPIC_DATE`(2026-09-17), 상한은 KST 오늘이며, 하한에서는 이전 화살표를, 오늘에서는 다음 화살표를 비활성으로 보여 준다. | D-12, AN §2.6, iOS DisplayFeatureTests L314 |
| REQ-DISP-006 | 이전·다음 화살표는 선택한 날짜를 하루씩 옮기고 옮긴 날짜의 전시를 불러온다. | AN §2.6 |
| REQ-DISP-007 | 날짜를 누르면 년/월/일 휠이 있는 "날짜 선택" 시트가 열리고, 휠에는 하한~상한 사이 값만 나온다. | AN-src DisplayDatePickerSheet, iOS DisplayFeatureTests L871 |
| REQ-DISP-008 | 날짜 선택에서 첫 해는 하한 이후의 월만, 마지막 해는 오늘 이전의 월만 고를 수 있고, 첫 달은 하한 일부터, 마지막 달은 오늘까지, 그 사이 달은 말일까지만 고를 수 있다. | iOS DisplayFeatureTests L871·L879 |
| REQ-DISP-009 | 고른 날짜가 그 달에 없으면(예: 2월 30일) 말일로 맞추고, 범위 밖이면 가장 가까운 범위 끝으로 맞춘 뒤 불러온다. | iOS DisplayFeatureTests L337·L888, AN §2.6 |
| REQ-DISP-010 | 지금 선택된 날짜를 다시 고르면 다시 불러오지 않는다. | iOS DisplayFeatureTests L365 |
| REQ-DISP-011 | 첫 로딩 중에는 날짜 이동을 막는다. | iOS DisplayFeatureTests L7 |
| REQ-DISP-012 | 이동하려는 날짜의 주제가 없으면(404) 지금 보던 전시를 그대로 유지하고 "해당 날짜의 전시가 없어요"를 토스트로 알리며, 최초 전시일 값은 바꾸지 않는다. | D-12, iOS DisplayFeatureTests L289·L383, AN §2.6 |
| REQ-DISP-013 | 날짜 이동이 네트워크 오류로 실패하면 보던 전시를 복원하고 토스트로 알리며, 이동 경계를 새로 만들지 않는다. | iOS DisplayFeatureTests L405, D-20 |
| REQ-DISP-014 | 전시를 처음 여는 날짜가 404이면 빈 상태 "이 날 올라온 사진이 없어요"를, 그 밖의 실패이면 요청한 날짜를 유지한 채 "전시를 불러오지 못했어요"와 "다시 시도"를 보여 준다. | iOS DisplayFeatureTests L427, AN-src DisplayContent, API §5.2 |
| REQ-DISP-015 | 화면이 다시 보일 때 KST 오늘을 다시 계산해 상한을 갱신한다[추정]. | D-19(같은 취지), TOPIC-002 |

### 전시: 정렬과 아카이브 (DISP)

| ID | 요구사항 | 근거 |
| --- | --- | --- |
| REQ-DISP-016 | 오늘 날짜의 전시에서만 "최신순"(`recent`), "인기순"(`popular`), "랜덤순"(`random`) 정렬 탭을 보여 주고 기본은 최신순이다. | AN §2.6, API §1.3 |
| REQ-DISP-017 | 지난 날짜는 아카이브 모드로 정렬 탭 없이 `popular`로 고정해 불러오고, 오늘로 돌아오면 이전에 고른 정렬을 복원한다. | iOS DisplayFeatureTests L43, AN §2.6 |
| REQ-DISP-018 | 아카이브 모드는 인기순 상위 5장을 추천 카드 페이저로 보여 주고, 그리드에는 불러온 전체 목록을 보여 준다(상위 5장이 그리드에도 있다). | AN-src DisplayViewModel(FEATURED_PHOTO_COUNT=5), DisplayContent |
| REQ-DISP-019 | 같은 날짜의 아카이브를 다시 불러오면 보던 추천 카드 페이지를 유지하고, 다른 날짜로 가면 처음 페이지로 돌린다. | iOS DisplayFeatureTests L515·L546 |
| REQ-DISP-020 | 정렬을 바꾸면 새 결과가 올 때까지 기존 사진을 그대로 보여 주고, 이미 본 (날짜, 정렬)을 다시 고르면 캐시를 즉시 보여 준 뒤 재검증한다. | iOS DisplayFeatureTests L70 |
| REQ-DISP-021 | 랜덤순의 첫 페이지 응답 `randomSeed`를 저장해 2페이지부터 `randomSeed`로 보내고, 랜덤이 아닌 정렬에서는 시드를 보내지 않고 버린다. | POST-008, API §6.2 F3~F5, AN §2.6 |
| REQ-DISP-022 | 랜덤순 첫 페이지를 다시 불러올 때(재검증·피드 복귀)도 저장된 시드를 보내고, 같은 시드의 이미 받은 뒤쪽 페이지는 유지한다. | iOS DisplayFeatureTests L185·L242·L940 |
| REQ-DISP-023 | 랜덤 다음 페이지를 이어 붙일 때 페이지 경계에서 겹치는 게시물 `id`는 한 번만 보여 준다. | iOS DisplayFeatureTests L625, API §8.2-19 |

### 전시: 페이징, 캐시, stale 보호 (DISP)

| ID | 요구사항 | 근거 |
| --- | --- | --- |
| REQ-DISP-024 | 페이지 크기는 20이고 `page`는 1부터 하나씩 올린다. | AN §2.6, iOS §2.4 |
| REQ-DISP-025 | 스크롤이 마지막에서 세 번째 항목 이내에 도달하면 다음 페이지를 요청한다. | AN-src DisplayPhotoGrid(END_THRESHOLD=2) |
| REQ-DISP-026 | 다음 페이지를 이미 불러오는 중이거나 `hasNext=false`이거나 첫 페이지 재검증 중이면 다음 페이지를 요청하지 않는다. | AN §2.6, iOS DisplayFeatureTests L577 |
| REQ-DISP-027 | 목록은 (날짜, 정렬) 키로 캐시하고, 첫 페이지 재검증이 끝난 뒤에도 캐시된 다음 페이지들은 유지한다. | iOS §2.4, DisplayFeatureTests L142 |
| REQ-DISP-028 | 이전 (날짜, 정렬) 요청의 느린 응답은 지금 선택된 상태를 덮어쓰지 않는다. | iOS DisplayFeatureTests L672, AN §2.6 |
| REQ-DISP-029 | 전시 탭을 다시 누르면 맨 위로 스크롤하고 기존 전시를 유지한 채 첫 페이지를 재검증하며, 성공하면 새 값으로 교체하고 실패하면 기존 전시를 유지한다. | iOS DisplayFeatureTests L443·L490, AN §1.2 |
| REQ-DISP-030 | 피드에서 전시로 돌아오면 같은 방식으로 재검증하고 보던 위치와 정렬을 유지한다. | iOS DisplayFeatureTests L242 |
| REQ-DISP-031 | 재검증이나 다음 페이지가 실패했을 때 이미 보이는 사진이 있으면 목록을 유지하고 "전시를 불러오지 못했어요"를 토스트로만 알린다. | D-20, AN §2.6 |
| REQ-DISP-032 | 불러온 사진이 없는 상태에서 실패하면 오류 화면과 "다시 시도"를 보여 준다. | D-20, AN §2.6 |
| REQ-DISP-033 | 게스트도 인증 헤더 없이 `GET /topics`와 `GET /posts`로 전시 목록을 볼 수 있고 응답의 `isLiked`, `isMine`은 모두 `false`로 다룬다. | D-05, API §0.1, API §6.2 F10 |
| REQ-DISP-034 | 목록 항목은 `id`, `authorId`, `originalImageUrl`, `thumbnailImageUrl`(없으면 원본 사용), 사인 이미지 URL, `title`, `likeCount`, `isLiked`, `isMine`을 담고, 필수 필드가 없거나 `likeCount`가 음수인 항목이 있으면 그 응답을 잘못된 응답으로 처리한다. | API §1.3, iOS DisplayFeatureTests L904 |
| REQ-DISP-035 | 그리드에서 사진을 누르면 게시물 상세를 열고(선택한 게시물을 먼저 보여 주고 상세 재검증), 게스트는 열지 않고 "게시물 피드를 보려면 로그인이 필요해요"를 토스트로 보여 준다. | AN §1.4, D-05 |

### 게시물 상세 (FEED)

| ID | 요구사항 | 근거 |
| --- | --- | --- |
| REQ-FEED-001 | 상세는 `GET /posts/{postId}`로 불러오며, 전시·랭킹에서 연 경우 이미 가진 게시물을 먼저 보여 주고 응답이 오면 재검증해 교체한다. | AN §1.4·§2.7, iOS §2.5 |
| REQ-FEED-002 | 기록·푸시에서 연 경우 상세 응답 전에는 로딩을 보여 주고(기록은 전달받은 썸네일을 먼저 보여 줄 수 있다), 응답 뒤에도 내 게시물로 유지한다. | iOS FeedFeatureTests L292, AN §1.5 |
| REQ-FEED-003 | 상세는 원본 사진, 그 위에 작가 사인(`signatureOriginalImageUrl`), 제목, 날짜 라벨 "M월 d일의 주제"(`topic.topicDate`), 좋아요 수를 보여 준다. | API §1.3, AN §2.7, iOS §2.5 |
| REQ-FEED-004 | 제목이 `null`이거나 비면 "무제"를 보여 준다. | iOS §2.5, AN §2.7 |
| REQ-FEED-005 | 상세 응답에는 `isMine`이 없으므로, 응답 전에는 진입 경로 값(전시·랭킹은 목록의 `isMine`, 기록·푸시는 내 게시물)을 쓰고 응답이 오면 `authorId == 저장된 userId`로 다시 판정한다. | D-26, API §1.3, iOS FeedFeatureTests L292, AN §1.4 |
| REQ-FEED-006 | 상세 로드가 404이면 "게시물을 찾을 수 없어요", 그 밖의 실패이면 "게시물을 불러오지 못했어요", 응답 계약 위반이면 "게시물 정보를 불러오지 못했어요"를 보여 준다. | AN §2.7, iOS §2.5 |
| REQ-FEED-007 | 이미 내용이 보이는 상태에서 상세 재검증이 실패하면 내용을 유지하고 토스트만 띄운다. | AN §2.7, D-20 |
| REQ-FEED-008 | 상세 응답은 진행 중이거나 이미 끝난 좋아요 결과와 제목 수정 결과를 덮어쓰지 않는다. | iOS FeedFeatureTests L64·L259 |
| REQ-FEED-009 | 전시 목록의 게시물로 연 상세는 상세 응답이 확정되기 전까지 좋아요 버튼을 비활성으로 두고, 확정되면 활성으로 바꾼다. | iOS FeedFeatureTests L51·L107 |
| REQ-FEED-010 | 게스트는 상세에 들어갈 수 없다(진입 지점에서 토스트로 막는다). | D-05 |
| REQ-FEED-011 | 사진은 핀치로 1배~4배까지 확대하고, 손을 떼면 원래 크기로 돌아오며, 두 손가락 팬은 확대한 범위 안에서만 움직인다. | iOS §2.5, AN §2.7 |
| REQ-FEED-012 | 확대한 상태에서 손가락 아래 지점이 고정되도록 확대 중심을 맞춘다. | iOS FeedZoomRenderingTests L231 |
| REQ-FEED-013 | 뒤로가기는 상세를 닫고 열었던 화면으로 돌아가며, 전시에서 열었으면 전시의 보던 위치·정렬이 유지되고 기록에서 열었으면 기록 탭으로 돌아온다. | AN §1.4 |
| REQ-FEED-014 | 상세가 보이는 동안 하단바는 숨기고 돌아오면 다시 보인다. | AN §1.2 |
| REQ-FEED-015 | 같은 게시물 상세가 이미 열려 있는 상태에서 같은 게시물을 여는 푸시를 받으면 새로 쌓지 않고 교체한다. | D-11 |
| REQ-FEED-016 | 수정 버튼은 내 게시물이고 상세의 `topic.topicDate`가 KST 오늘일 때만 보이고, 삭제 버튼은 내 게시물이면 보인다. | D-23 |
| REQ-FEED-017 | 지난 주제의 내 게시물은 제목 수정 요청 자체를 보내지 않는다. | iOS FeedFeatureTests L234, AN §2.7 |

### 제목 수정 (FEED)

| ID | 요구사항 | 근거 |
| --- | --- | --- |
| REQ-FEED-018 | 제목 입력의 길이는 입력값의 앞뒤 공백을 제거한 뒤 Unicode code point 수로 세고, 10을 넘으면 입력을 막으며 붙여넣기는 10 code point까지만 받는다. | D-01, POST-005 |
| REQ-FEED-019 | 앞뒤 공백을 포함해 12자여도 공백 제거 후 10 code point이면 저장할 수 있고, 이모지는 한 글자(code point)로 센다(결합 이모지는 구성 code point 수만큼 센다). | D-01, API §6.2 H4·H5 |
| REQ-FEED-020 | 저장은 `PUT /posts/{postId}`에 앞뒤 공백을 제거한 제목을 `title`로 보내고, 공백만 있거나 비면 `title` 키를 `null`로 보낸다. | D-01, API §1.3·§6.2 H6, iOS FeedAPIClientTests L35·L68 |
| REQ-FEED-021 | 저장하는 동안 저장 버튼을 "저장 중..."으로 바꾸고 중복 저장 요청을 보내지 않는다. | iOS §2.5, AN §2.7 |
| REQ-FEED-022 | 저장에 성공하면 다이얼로그를 닫고 "제목을 수정했어요" 토스트를 띄우며, 응답의 `title`을 상세와 목록 캐시에 반영한다. | AN §2.7, iOS FeedFeatureTests L197 |
| REQ-FEED-023 | 저장이 실패하면 다이얼로그를 닫지 않고 입력을 유지한 채 실패 사유를 알리고 다시 저장할 수 있다. | D-20, AN §2.7 |
| REQ-FEED-024 | 제목 수정 오류는 400 "수정할 수 없는 상태이거나 주제 참여 기간이 끝났어요", 403 "이용이 제한되어 제목을 수정할 수 없어요.", 404 "게시물을 찾을 수 없어요", 401 "로그인이 필요해요", 네트워크 "네트워크 연결을 확인해 주세요.", 그 밖에는 "게시물 제목을 수정하지 못했어요"로 보여 준다. | D-02, D-08, AN §2.7, iOS §2.5 |

### 삭제 (FEED)

| ID | 요구사항 | 근거 |
| --- | --- | --- |
| REQ-FEED-025 | 삭제 버튼을 누르면 "게시물 삭제" 확인 다이얼로그를 먼저 보여 주고, "삭제"를 눌러야 `DELETE /posts/{postId}`를 보낸다. | iOS §2.5, AN §2.7 |
| REQ-FEED-026 | 내 게시물이 아니면 삭제 요청을 보내지 않는다. | iOS FeedFeatureTests L130 |
| REQ-FEED-027 | 삭제가 204로 성공하면 이전 화면으로 돌아가 전시 목록·추천 카드·기록·홈(이번 주 기록, 랭킹)에서 그 게시물을 빼고 "게시물을 삭제했어요" 토스트를 띄운다. | D-23, AN §1.4 |
| REQ-FEED-028 | 삭제 요청이 진행 중이면 중복 요청을 보내지 않는다. | AN §2.7 |
| REQ-FEED-029 | 삭제 실패는 화면에 머문 채 400 "삭제할 수 없는 상태의 게시물이에요", 403 "본인이 작성한 게시물만 삭제할 수 있어요", 404 "게시물을 찾을 수 없어요", 401 "로그인이 필요해요", 네트워크 "네트워크 연결을 확인해 주세요", 그 밖에는 "게시물을 삭제하지 못했어요"로 알리고 다시 시도할 수 있게 한다. | D-23, D-08, AN §2.7, iOS FeedFeatureTests L166 |
| REQ-FEED-030 | 삭제 404를 받으면 그 게시물은 이미 없으므로 목록·캐시에서도 뺀다. | D-04(404 규칙과 같은 취지), API §5.2 |

### 좋아요 (LIKE)

| ID | 요구사항 | 근거 |
| --- | --- | --- |
| REQ-LIKE-001 | 하트를 누르면 요청을 기다리지 않고 바로 `isLiked`를 뒤집고 `likeCount`를 1 늘리거나 줄여 보여 준다. | D-04 |
| REQ-LIKE-002 | 좋아요 등록은 `PUT /posts/{postId}/likes`, 취소는 `DELETE /posts/{postId}/likes`로 보내고, 성공 응답의 `likeCount`, `isLiked`로 화면 값을 덮어쓴다. | D-04, API §1.3 |
| REQ-LIKE-003 | 응답의 `postId`가 요청한 게시물과 다르면 잘못된 응답으로 보고 실패로 처리한다. | AN §4.2(PostRepositoryImplTest 좋아요 응답 검증) |
| REQ-LIKE-004 | 요청이 실패하면 이전 `isLiked`와 `likeCount`로 되돌리고 "좋아요를 반영하지 못했어요" 토스트를 띄운다(전시·홈·피드 모두 같다). | D-04 |
| REQ-LIKE-005 | 같은 게시물에 요청이 진행 중일 때 누르면 요청을 쌓지 않고 마지막 의도만 기억하며, 응답 뒤 최종 의도와 서버 상태가 다르면 한 번 더 보낸다. | D-04, iOS DisplayFeatureTests L750 |
| REQ-LIKE-006 | 404 응답이면 낙관적 변경을 되돌린 뒤 그 게시물을 목록과 캐시에서 뺀다(삭제·비공개). | D-04, API §5.2 |
| REQ-LIKE-007 | 등록(`PUT`)이 403이면 되돌리고 "이용이 제한되어 좋아요를 누를 수 없어요."를 보여 주며 같은 요청을 다시 보내지 않고, 취소(`DELETE`)는 정지 회원도 보낼 수 있다. | D-08, LIKE-001, API §6.2 L3 |
| REQ-LIKE-008 | 게스트가 하트를 누르면 API를 부르지 않고 "좋아요를 누르려면 로그인이 필요해요"를 토스트로 보여 준다. | D-05 |
| REQ-LIKE-009 | 목록·상세 재검증 응답이 늦게 도착해도 이미 끝난 좋아요 상태를 덮어쓰지 않는다. | D-04, iOS DisplayFeatureTests L781, AN §2.6 |
| REQ-LIKE-010 | 같은 게시물이 전시 추천 카드와 그리드에 함께 있으면 좋아요 결과가 두 곳에 같이 반영된다. | iOS DisplayFeatureTests L697 |
| REQ-LIKE-011 | 작성자는 자기 게시물에도 좋아요를 누를 수 있다. | LIKE-002, API §6.2 L4 |
| REQ-LIKE-012 | 좋아요 `PUT`/`DELETE`는 멱등 요청이므로 네트워크 오류·5xx에서 D-21의 자동 재시도(최대 2회)를 거친 뒤에도 실패해야 롤백한다. | D-21, LIKE-003 |

## 상태

### 전시 본문 상태

| 상태 | 진입 조건 | 보이는 것 | 다음 전이 |
| --- | --- | --- | --- |
| Loading | 첫 진입, 이동한 날짜의 첫 로딩 | 로딩 표시, 날짜 이동 막힘 | 성공 → Latest/Archive, 404 → Empty, 실패 → Error |
| Latest | 오늘 날짜 + 성공 | 정렬 탭 + 그리드 | 정렬 변경(Refreshing), 날짜 이동 |
| Archive | 지난 날짜 + 성공 | 추천 카드 페이저 + 그리드 | 날짜 이동 |
| Empty | 해당 날짜의 첫 로딩에서 주제 404 또는 사진 0장 | "이 날 올라온 사진이 없어요" | 날짜 이동 |
| Error | 보이는 사진이 없는 상태에서 실패 | "전시를 불러오지 못했어요" + 다시 시도 | 다시 시도 → Loading |
| Refreshing | 정렬 변경, 탭 재선택, 피드 복귀 | 기존 사진 유지 | 성공 → 교체, 실패 → 유지 + 토스트 |
| Paging | 끝 근처 도달 | 하단 로딩 표시 | 성공 → 누적, 실패 → 목록 유지 + 토스트 |

날짜 이동 중 404·네트워크 실패는 상태를 바꾸지 않고(이전 Latest/Archive 복원) 토스트만 띄운다.

### 캐시와 stale 규칙

| 항목 | 규칙 |
| --- | --- |
| 캐시 키 | (선택 날짜, 정렬). 아카이브는 `popular` 고정이라 날짜만 달라진다 |
| 캐시 유지 | 첫 페이지를 재검증해도 같은 시드(랜덤)·같은 정렬에서 이미 받은 뒤쪽 페이지는 유지한다 |
| 응답 폐기 | 요청을 보낸 시점의 (날짜, 정렬)·세대가 지금과 다르면 응답을 버린다 |
| 좋아요 병합 | 재검증 응답의 좋아요 값은 그 요청 이후에 끝난 좋아요 변경을 덮지 않는다 |

### 게시물 상세 상태

| 상태 | 진입 조건 | 보이는 것 | 다음 전이 |
| --- | --- | --- | --- |
| Loading | 시드 없이 열림 | 로딩(좋아요 비활성) | 성공 → Content, 404 → NotFound, 실패 → Error |
| Content(시드) | 시드로 열림, 상세 재검증 중 | 시드 내용, 좋아요 비활성 | 응답 → Content(확정) |
| Content(확정) | 상세 응답 수신 | 전체 내용, 좋아요 활성 | 수정, 삭제, 좋아요 |
| NotFound | 404 | "게시물을 찾을 수 없어요" | 뒤로가기 |
| Error | 404가 아닌 실패, 시드 없음 | "게시물을 불러오지 못했어요" 등 | 뒤로가기 |
| EditingTitle | 수정 버튼 | 제목 수정 다이얼로그 | 저장 성공 → Content, 취소 → Content |
| Deleting | 삭제 확인 | 삭제 요청 진행 | 204 → 이전 화면, 실패 → Content |

## API 호출

공통: 인증 헤더는 로그인 상태에서만 붙인다(게스트는 생략). GET/PUT/DELETE는 D-21에 따라 네트워크 오류·5xx에서 0.5초, 1초 간격으로 최대 2회 자동 재시도한다. 오류 본문은 `{errorCode, message}`이며 `message`로 분기하지 않고 HTTP 상태와 호출한 API로 분기한다(D-02).

### 호출 순서

| 순서 | 호출 | 핵심 요청 | 핵심 응답 |
| --- | --- | --- | --- |
| 1 | `GET /topics?date={yyyy-MM-dd}` | `date`는 KST 날짜, 미래 날짜 금지 | `{id, title, topicDate, startsAt, endsAt, phase}` |
| 2 | `GET /posts` | `topicDate`, `sort`(`recent`\|`popular`\|`random`, 소문자), `page`(1~), `pageSize=20`, `randomSeed`(random의 2페이지부터 필수, 첫 페이지 재검증에도 저장값 전달) | `{currentPage, pageSize, hasNext, randomSeed, posts[]}` |
| 3 | `GET /posts/{postId}` | — | `{id, authorId, topic{id,title,topicDate}, originalImageUrl, thumbnailImageUrl, signatureOriginalImageUrl, title, likeCount, isLiked}` |
| 4 | `PUT /posts/{postId}` | `{"title": "문자열" \| null}` (키 필수) | 200 `{postId, title}` |
| 5 | `DELETE /posts/{postId}` | — | 204 |
| 6 | `PUT /posts/{postId}/likes` | 본문 없음 | 200 `{postId, likeCount, isLiked:true}` |
| 7 | `DELETE /posts/{postId}/likes` | 본문 없음 | 200 `{postId, likeCount, isLiked:false}` |

### 실패별 처리

| 호출 | HTTP + errorCode | 동작 | 사용자 문구 |
| --- | --- | --- | --- |
| `GET /topics` | 404 `BUSINESS_ERROR` | 첫 로딩이면 Empty, 날짜 이동 중이면 이전 전시 유지 | Empty: "이 날 올라온 사진이 없어요" / 이동 중 토스트: "해당 날짜의 전시가 없어요" |
| `GET /topics`, `GET /posts` | 400 `BUSINESS_ERROR`(미래 날짜·조회 조건) | 클라이언트 버그로 보고 Error 처리, 재시도하지 않음 | "전시를 불러오지 못했어요" |
| `GET /posts` | 404 `BUSINESS_ERROR`("해당 날짜의 주제를 찾을 수 없습니다.") | 위 `GET /topics` 404와 같게 처리 | 위와 같음 |
| `GET /topics`, `GET /posts` | 네트워크 오류·타임아웃 | 자동 재시도 후에도 실패하면 콘텐츠 유무에 따라 Error 또는 토스트 | "네트워크 연결을 확인해 주세요." |
| `GET /topics`, `GET /posts` | 5xx, 응답 검증 실패 | 위와 같음 | "전시를 불러오지 못했어요" |
| `GET /posts` | 400(랜덤 2페이지 이후 시드 없음) | 시드를 잃은 경우이므로 랜덤 첫 페이지부터 다시 시작 | 없음 [추정] |
| `GET /posts/{id}` | 404 `BUSINESS_ERROR` | NotFound, 시드가 있으면 목록·캐시에서 제거 | "게시물을 찾을 수 없어요" |
| `GET /posts/{id}` | 401 `UNAUTHORIZED` | D-17 갱신 후 1회 재전송 | — |
| `GET /posts/{id}` | 네트워크·5xx | 시드 있으면 유지 + 토스트, 없으면 Error | "네트워크 연결을 확인해 주세요." / "게시물을 불러오지 못했어요" |
| `GET /posts/{id}` | 응답 검증 실패 | 시드 있으면 유지 + 토스트, 없으면 Error | "게시물 정보를 불러오지 못했어요" |
| `PUT /posts/{id}` | 400 `BUSINESS_ERROR`("현재 상태의 게시물은 수정할 수 없습니다." / "참여 기간이 종료된 게시물은 수정할 수 없습니다." / "제목은 10자 이하여야 합니다.") | 다이얼로그 유지 | "수정할 수 없는 상태이거나 주제 참여 기간이 끝났어요" |
| `PUT /posts/{id}` | 403 `FORBIDDEN` | 같은 요청 재전송 금지, 다이얼로그 유지 | "이용이 제한되어 제목을 수정할 수 없어요." |
| `PUT /posts/{id}` | 404 `BUSINESS_ERROR` | 다이얼로그 닫고 NotFound | "게시물을 찾을 수 없어요" |
| `PUT /posts/{id}` | 401 | D-17 | "로그인이 필요해요"(갱신 후에도 401일 때) |
| `PUT /posts/{id}` | 네트워크 오류 | 다이얼로그 유지 | "네트워크 연결을 확인해 주세요." |
| `PUT /posts/{id}` | 그 밖 | 다이얼로그 유지 | "게시물 제목을 수정하지 못했어요" |
| `DELETE /posts/{id}` | 400 `BUSINESS_ERROR` | 화면 유지 | "삭제할 수 없는 상태의 게시물이에요" |
| `DELETE /posts/{id}` | 403 `FORBIDDEN` | 화면 유지(정상 흐름에서는 발생하지 않음) | "본인이 작성한 게시물만 삭제할 수 있어요" |
| `DELETE /posts/{id}` | 404 `BUSINESS_ERROR` | 목록·캐시에서 제거 | "게시물을 찾을 수 없어요" |
| `DELETE /posts/{id}` | 401 | D-17 | "로그인이 필요해요" |
| `DELETE /posts/{id}` | 네트워크 | 화면 유지, 재시도 가능 | "네트워크 연결을 확인해 주세요" |
| `DELETE /posts/{id}` | 그 밖 | 화면 유지 | "게시물을 삭제하지 못했어요" |
| `PUT …/likes` | 403 `FORBIDDEN` | 롤백, 재요청 없음 | "이용이 제한되어 좋아요를 누를 수 없어요." |
| `PUT/DELETE …/likes` | 404 `BUSINESS_ERROR` | 롤백 + 목록에서 제거 | "좋아요를 반영하지 못했어요" |
| `PUT/DELETE …/likes` | 401 | D-17 | — |
| `PUT/DELETE …/likes` | 네트워크·5xx·응답 검증 실패 | 롤백 | "좋아요를 반영하지 못했어요" |

## 문구

| 키 | 문구 | 상황 |
| --- | --- | --- |
| display.sort.recent | 최신순 | 정렬 탭 |
| display.sort.popular | 인기순 | 정렬 탭 |
| display.sort.random | 랜덤순 | 정렬 탭 |
| display.header.desc_latest | 같은 주제에서 다른 시선을 느껴보세요 | 오늘 날짜 머리글 |
| display.header.desc_archive | 가장 사람들이 좋아했던 사진들이에요 | 지난 날짜 머리글 |
| display.nav.previous | 이전 날짜 | 화살표 접근성 라벨 |
| display.nav.next | 다음 날짜 | 화살표 접근성 라벨 |
| display.picker.title | 날짜 선택 | 날짜 선택 시트 제목 |
| display.picker.year | {n}년 | 휠 항목 |
| display.picker.month | {n}월 | 휠 항목 |
| display.picker.day | {n}일 | 휠 항목 |
| display.empty | 이 날 올라온 사진이 없어요 | 빈 상태 |
| display.date_missing | 해당 날짜의 전시가 없어요 | 이동하려는 날짜가 404 |
| display.error | 전시를 불러오지 못했어요 | 전시 로드 실패 |
| display.retry | 다시 시도 | 오류 화면 버튼 |
| common.error.network | 네트워크 연결을 확인해 주세요. | 연결 실패·타임아웃 |
| feed.date_label | {M}월 {d}일의 주제 | 상세 날짜 라벨 |
| feed.title_none | 무제 | 제목 없음 |
| feed.photo_alt | 작품 이미지: {제목} | 접근성 설명 |
| feed.photo_alt_none | 무제 작품 이미지 | 접근성 설명(제목 없음) |
| feed.error.not_found | 게시물을 찾을 수 없어요 | 상세·수정·삭제 404 |
| feed.error.load | 게시물을 불러오지 못했어요 | 상세 로드 일반 실패 |
| feed.error.invalid | 게시물 정보를 불러오지 못했어요 | 응답 계약 위반 |
| feed.edit.title | 게시물 제목 수정 | 다이얼로그 제목 |
| feed.edit.placeholder | 제목을 입력해 주세요. | 입력 플레이스홀더 |
| feed.edit.cancel | 취소 | 버튼 |
| feed.edit.save | 저장 | 버튼 |
| feed.edit.saving | 저장 중... | 저장 요청 중 |
| feed.edit.success | 제목을 수정했어요 | 저장 성공 토스트 |
| feed.edit.error.state | 수정할 수 없는 상태이거나 주제 참여 기간이 끝났어요 | 수정 400 |
| feed.edit.error.banned | 이용이 제한되어 제목을 수정할 수 없어요. | 수정 403 (D-08) |
| feed.edit.error.login | 로그인이 필요해요 | 수정·삭제 401 |
| feed.edit.error.other | 게시물 제목을 수정하지 못했어요 | 수정 그 밖 실패 |
| feed.delete.title | 게시물 삭제 | 확인 다이얼로그 제목 |
| feed.delete.body | 게시물을 삭제하시겠어요? | 확인 본문 |
| feed.delete.confirm | 삭제 | 확인 버튼 |
| feed.delete.cancel | 취소 | 취소 버튼 [추정: 기존 앱 문서에는 확인 문구만 있음] |
| feed.delete.success | 게시물을 삭제했어요 | 삭제 성공 토스트 (D-23) |
| feed.delete.error.state | 삭제할 수 없는 상태의 게시물이에요 | 삭제 400 |
| feed.delete.error.forbidden | 본인이 작성한 게시물만 삭제할 수 있어요 | 삭제 403 |
| feed.delete.error.other | 게시물을 삭제하지 못했어요 | 삭제 그 밖 실패 |
| like.error.generic | 좋아요를 반영하지 못했어요 | 좋아요 실패 롤백 토스트 (D-04) |
| like.error.banned | 이용이 제한되어 좋아요를 누를 수 없어요. | 등록 403 (D-08) |
| guest.feed | 게시물 피드를 보려면 로그인이 필요해요 | 게스트가 사진 탭 (D-05) |
| guest.like | 좋아요를 누르려면 로그인이 필요해요 | 게스트가 하트 탭 (D-05) |

고른 기준:
- 빈 상태는 iOS "이 날의 전시가 아직 없어요"와 Android "이 날 올라온 사진이 없어요" 중 Android를 골랐다(주제는 있고 사진이 0장인 상태를 가장 정확히 설명). iOS의 "해당 날짜의 전시가 없어요"는 주제 404로 날짜 이동이 막힐 때의 토스트로 따로 쓴다.
- 좋아요 실패 문구는 iOS "좋아요를 변경하지 못했어요" 대신 D-04가 정한 "좋아요를 반영하지 못했어요"를 쓴다.
- 삭제 성공 토스트는 iOS(홈) "게시물이 삭제됐어요" 대신 D-23의 "게시물을 삭제했어요"를 쓴다.
- 네트워크 문구는 iOS 일부에 마침표가 없던 것을 D-20의 "네트워크 연결을 확인해 주세요."로 통일한다.

## 플랫폼별 허용 차이

- 뒤로가기: iOS는 화면 왼쪽 가장자리 스와이프·아래로 끌어 닫기, Android는 시스템 뒤로가기, 웹은 브라우저 뒤로가기와 닫기 버튼을 쓴다. 닫으면 이전 화면과 스크롤 위치가 복원되어야 한다. 참고: 기존 iOS의 제스처 수치는 가장자리 24pt, 최소 12pt, 완전 전환 300pt, 닫힘 판정 120pt, 확대 애니메이션 0.3초/0.7초다.
- 핀치 줌: 웹 데스크톱은 Ctrl+휠·더블 클릭 등 입력 방식이 달라도 되지만 최대 4배, 놓으면 복귀는 같다.
- 날짜 선택 시트: 모바일은 휠 피커, 웹은 네이티브 `<input type="date">` 또는 같은 범위 제약의 선택기를 써도 된다(하한·상한·말일 보정 규칙은 같다).
- 공유 요소 전환(그리드 → 상세 사진 확대 애니메이션)은 플랫폼 관례를 따르며 필수가 아니다.
- 메이슨리 그리드 구현 방식, 스크롤 임계값 계산 방식(항목 수 기준 마지막 3개 이내라는 결과는 같아야 한다).
- 토스트 위치·스타일, 다이얼로그 모양은 플랫폼 관례를 따른다. 표시 시간은 2.5초(공통 상수 `TOAST_DURATION`).

## 범위 밖

- AI 피드백 알약·시트: [ai-review.md](ai-review.md)
- 홈의 랭킹 섹션 구성: [home.md](home.md)
- 기록 탭과 기록에서 여는 흐름: [record.md](record.md)
- 푸시 탭 라우팅·알림함: notification-push.md
- 작가 공개 사진 이어보기(`GET /users/{id}/posts`): 2차 범위
- 신고·공유·저장 기능: 기존 앱에 없다

## 확인 필요

- (해결) 상세의 내 게시물 판정은 D-26으로 정했다.
- 제목 수정 `PUT`의 403은 서버가 "차단된 회원입니다."(정지)와 "본인의 게시물만…"(소유자 아님)을 같은 `FORBIDDEN`으로 준다. D-08 표에 따라 정지 문구를 쓰지만, 정상 흐름(버튼이 내 게시물에만 보임)에서 소유자 오류는 발생하지 않는다고 가정했다.
- 삭제 시 서버가 이미 삭제된 본인 게시물의 반복 `DELETE`에 204 대신 404를 줄 수 있는지 코드로 확정되지 않았다(API §8.2-22). 404도 목록에서 제거하는 방향으로 처리했다.
- 날짜 상한(KST 오늘)을 화면이 열린 채로 KST 자정이 지났을 때 자동으로 갱신할지 정해진 바 없다. REQ-DISP-015는 화면이 다시 보일 때 갱신하는 것으로 [추정] 표시했다.
- 랜덤 정렬에서 시드를 잃었을 때(앱 재시작 후 캐시 복원 등) 2페이지 이후 요청이 400이 되는 경우의 사용자 안내가 없다. 첫 페이지부터 다시 불러오는 것으로 [추정]했다.
- 아카이브(지난 날짜) 상세 진입 시 상세 응답 전 좋아요 비활성(REQ-FEED-009)이 iOS 기준이다. Android에서 같은지는 소스 확인이 되지 않았다.
- 마지막 페이지를 넘어 요청했을 때(`page=99`)는 서버가 빈 목록 + `hasNext=false`를 주므로 별도 처리가 없다. 클라이언트가 이 응답을 오류로 보지 않아야 한다.
- D-12는 주제가 없는 날짜(404)에서 "기존 전시를 유지하고 빈 상태를 보여 준다"고만 적었다. 이 문서는 "이미 보던 전시가 있으면 유지 + 토스트(REQ-DISP-012), 보던 전시가 없는 첫 로딩이면 빈 상태(REQ-DISP-014)"로 해석했다. 의도와 다르면 알려 주어야 한다.
- 삭제 다이얼로그의 취소 버튼 문구는 기존 앱 문서에 없어 "취소"로 적었다[추정].
