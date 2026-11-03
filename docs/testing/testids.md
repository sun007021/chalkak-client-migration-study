# 공통 testID 표

다섯 클라이언트가 같은 식별자를 쓰므로 모바일 4종은 Maestro flow 하나로, Web은 Playwright로 같은 시나리오를 돌릴 수 있고 화면 테스트(`W`)도 같은 이름으로 요소를 찾는다([strategy.md §2](strategy.md#2-테스트하기-쉬운-코드-규칙모든-플랫폼)). 근거 화면 구성은 [legacy-ios §2](../reference/legacy-ios.md), [legacy-android §2](../reference/legacy-android.md)이고 필터·조정 항목은 [D-13](../spec/decisions.md#d-13-사진-편집-필터), 게스트 제한은 [D-05](../spec/decisions.md#d-05-게스트-제한), 홈 히어로 상태는 [D-06](../spec/decisions.md#d-06-홈-히어로-상태)을 따른다.

## 1. 플랫폼별 부착 방법

| 플랫폼            | 부착 방법                                                                                                     | 검색 방법                                                                                  | 주의                                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| iOS (SwiftUI)     | `.accessibilityIdentifier("login.kakao-button")`                                                              | XCUITest `app.buttons["login.kakao-button"]`, Maestro `id:`                                | 컨테이너에 붙이면 자식 접근성 요소가 사라지므로 `.accessibilityElement(children: .contain)`를 함께 쓴다 |
| Android (Compose) | `Modifier.testTag("login.kakao-button")` + 루트 한 곳에 `Modifier.semantics { testTagsAsResourceId = true }`  | Compose test `onNodeWithTag`, Maestro `id:` (resource-id로 노출됨)                         | `testTagsAsResourceId`가 없으면 Maestro가 태그를 못 찾는다                                              |
| Flutter           | `Semantics(identifier: 'login.kakao-button', child: ...)` 와 widget test용 `Key('login.kakao-button')`를 함께 | `find.byKey`, Maestro `id:` (Android resource-id, iOS accessibilityIdentifier로 매핑)      | `Semantics`가 자식 시맨틱을 합치지 않도록 `container: true`가 필요한 곳이 있다                          |
| React Native      | `testID="login.kakao-button"`                                                                                 | RNTL `getByTestId`, Maestro `id:`                                                          | iOS는 accessibilityIdentifier, Android는 resource-id로 매핑된다. 리스트 아이템은 항목 루트에 붙인다     |
| Web               | `data-testid="login.kakao-button"`                                                                            | Playwright `getByTestId`, Testing Library `getByTestId` (`testIdAttribute: 'data-testid'`) | 새 탭으로 열리는 약관 문서는 testID 대상이 아니다                                                       |

## 2. 규칙

- 형식은 `<화면>.<요소>` 하나로 통일한다. 둘 다 소문자 kebab(`-`)이고 점은 화면과 요소 구분에만 쓴다. 중복 이름은 쓰지 않는다(한 화면에 같은 id는 하나, 목록 항목은 `{}` 자리에 ID를 붙여 고유하게 만든다).
- `{}` 자리 값: `{postId}`, `{notificationId}`, `{bannerId}`는 소문자 정규형 UUID, `{yyyy-mm-dd}`는 KST 날짜, `{yyyy-mm}`는 연월, `{key}`는 AI 기준 키 문자열이다.
- 사용자에게 보이는 텍스트는 접근성 라벨/표시 텍스트로 따로 두고 testID와 섞지 않는다. 테스트는 요소를 testID로 찾고 문구는 `shared/copy/ko.json` 값으로 검증한다.
- **상태 노출**: 토글·체크는 `checked`, 탭·필터·정렬은 `selected`, 버튼은 `enabled`를 플랫폼 접근성 속성으로 노출한다(iOS `accessibilityValue`/traits, Compose `Role`+`stateDescription`, Flutter `Semantics(checked/selected/enabled)`, RN `accessibilityState`, Web `aria-checked`/`aria-selected`/`disabled`). 좋아요 버튼은 `selected`(isLiked)와 개수를 별도 요소(`*.like-count*`)로 노출한다.
- **존재 규칙**: "상태 표시 요소"는 해당 상태일 때만 트리에 존재한다(숨김 처리가 아니라 제거). 예를 들어 `home.notification-unread-dot`은 미읽음이 없으면 존재하지 않는다. 테스트는 `존재함/존재하지 않음`으로 검증한다.
- **상태 요소 공통 이름**: 로딩/빈/오류를 가진 화면은 `<화면>.loading`, `<화면>.empty-state`, `<화면>.error-state`, `<화면>.retry-button`을 쓴다. 이미 콘텐츠가 있을 때의 새로고침 실패는 오류 화면이 아니라 `toast.message`로 확인한다([D-20](../spec/decisions.md#d-20-오류-화면과-토스트)).
- 시트·다이얼로그는 루트에 `<이름>.dialog` 또는 `<이름>.sheet` 또는 `.root`를 붙이고 버튼은 `*-button`으로 끝낸다.
- 플랫폼 고유 요소(시스템 카메라, 시스템 사진 선택기, OS 권한 다이얼로그, 시스템 설정)는 testID 대상이 아니다. E2E에서는 텍스트·접근성 라벨로 다루거나 Fake로 대체하고 A 시나리오에서 사람이 확인한다.
- 새 화면이나 요소를 추가하면 이 표를 먼저 갱신하고, 플랫폼 PR은 자기 코드에서 이 표와 어긋난 id가 없는지 `shared/scripts/`의 id 검사로 확인한다.

## 3. 화면별 식별자

### 스플래시 · 강제 업데이트 게이트

| 화면   | 요소                | testID                      | 비고                                                       |
| ------ | ------------------- | --------------------------- | ---------------------------------------------------------- |
| splash | 스플래시 로고       | `splash.logo`               | 스플래시 동안만 존재 (BOOT)                                |
| splash | 업데이트 다이얼로그 | `update-gate.dialog`        | 닫을 수 없음. iOS 계열·Android 계열에서만 존재, Web은 없음 |
| splash | 업데이트 제목       | `update-gate.title`         | "업데이트가 필요해요"                                      |
| splash | 업데이트 본문       | `update-gate.message`       |                                                            |
| splash | 업데이트 버튼       | `update-gate.update-button` | 스토어 열기                                                |

### 로그인

| 화면  | 요소                    | testID                              | 비고                                         |
| ----- | ----------------------- | ----------------------------------- | -------------------------------------------- |
| login | 화면 루트               | `login.root`                        |                                              |
| login | 태그라인                | `login.tagline`                     |                                              |
| login | 카카오 로그인 버튼      | `login.kakao-button`                | 진행 중 비활성(enabled=false)                |
| login | 게스트 둘러보기 버튼    | `login.guest-button`                | "로그인 없이 사진 둘러보기"                  |
| login | 로그인 진행 표시        | `login.loading`                     | social-login 요청 중에만 존재                |
| login | 로그인 오류 알림        | `login.error-dialog`                | 제목 "로그인"                                |
| login | 오류 알림 확인 버튼     | `login.error-dialog-confirm-button` |                                              |
| login | 개발용 로그인 우회 버튼 | `login.dev-bypass-button`           | Web 개발 빌드 한정(Q-02). 배포 빌드에는 없음 |

### 약관 동의 (가입)

| 화면  | 요소                   | testID                      | 비고                   |
| ----- | ---------------------- | --------------------------- | ---------------------- |
| terms | 화면 루트              | `terms.root`                |                        |
| terms | 환영 제목              | `terms.title`               |                        |
| terms | 전체 동의 체크         | `terms.agree-all-checkbox`  | checked 상태 노출      |
| terms | 서비스 이용약관 체크   | `terms.service-checkbox`    | checked 상태 노출      |
| terms | 개인정보 처리방침 체크 | `terms.privacy-checkbox`    | checked 상태 노출      |
| terms | 서비스 이용약관 보기   | `terms.service-view-button` | 문서 시트 열기         |
| terms | 개인정보 처리방침 보기 | `terms.privacy-view-button` | 문서 시트 열기         |
| terms | 다음 버튼              | `terms.next-button`         | 두 필수 동의 전 비활성 |
| terms | 뒤로 버튼              | `terms.back-button`         | 로그인으로 복귀        |

### 약관 문서 시트 (가입·설정 공용)

| 화면      | 요소                 | testID                          | 비고                       |
| --------- | -------------------- | ------------------------------- | -------------------------- |
| legal-doc | 문서 시트/다이얼로그 | `legal-doc.sheet`               | Web은 새 탭이라 요소 없음  |
| legal-doc | 문서 제목            | `legal-doc.title`               |                            |
| legal-doc | 닫기 버튼            | `legal-doc.close-button`        |                            |
| legal-doc | 웹뷰 본문            | `legal-doc.web-content`         |                            |
| legal-doc | 로딩 표시            | `legal-doc.loading`             |                            |
| legal-doc | 오류 상태            | `legal-doc.error-state`         | "문서를 불러오지 못했어요" |
| legal-doc | 다시 시도 버튼       | `legal-doc.retry-button`        |                            |
| legal-doc | 열기 실패 메시지     | `legal-doc.open-failed-message` | "문서를 열 수 없어요"      |

### 사인 그리기 (가입·설정 변경 공용)

| 화면      | 요소             | testID                    | 비고                                                          |
| --------- | ---------------- | ------------------------- | ------------------------------------------------------------- |
| signature | 화면 루트        | `signature.root`          | mode(onboarding/change)는 accessibilityValue·data-mode로 노출 |
| signature | 제목             | `signature.title`         |                                                               |
| signature | 안내 문구        | `signature.guide-text`    |                                                               |
| signature | 그리기 캔버스    | `signature.canvas`        | 제스처 대상                                                   |
| signature | 캔버스 힌트      | `signature.canvas-hint`   | 획이 없을 때만 존재                                           |
| signature | 되돌리기 버튼    | `signature.undo-button`   | 획이 없으면 비활성                                            |
| signature | 전체 지우기 버튼 | `signature.clear-button`  | 획이 없으면 비활성                                            |
| signature | 제출 버튼        | `signature.submit-button` | "이 사인으로 할래요", 획이 없으면 비활성                      |
| signature | 뒤로 버튼        | `signature.back-button`   |                                                               |
| signature | 오류 메시지      | `signature.error-message` | 1MB 초과 등 로컬 검증 오류                                    |

### 사인 미리보기 (가입·설정 변경 공용)

| 화면              | 요소                 | testID                                          | 비고                                                            |
| ----------------- | -------------------- | ----------------------------------------------- | --------------------------------------------------------------- |
| signature-preview | 화면 루트            | `signature-preview.root`                        | mode는 data-mode로 노출                                         |
| signature-preview | 제목                 | `signature-preview.title`                       | "이렇게 보여요"                                                 |
| signature-preview | 사인 미리보기 이미지 | `signature-preview.image`                       |                                                                 |
| signature-preview | 다시 그리기 버튼     | `signature-preview.redraw-button`               |                                                                 |
| signature-preview | 확인 버튼            | `signature-preview.confirm-button`              | 가입 모드 "시작하기", 변경 모드 "사인 변경하기", 진행 중 비활성 |
| signature-preview | 변경 안내 문구       | `signature-preview.change-notice`               | 변경 모드에서만 존재                                            |
| signature-preview | 진행 표시            | `signature-preview.loading`                     | 가입·변경 요청 중, PENDING 재시도 중에도 유지                   |
| signature-preview | 오류 메시지          | `signature-preview.error-message`               | 서버 오류 문구                                                  |
| signature-preview | 오류 알림            | `signature-preview.error-dialog`                | 제목 "회원가입" 등                                              |
| signature-preview | 오류 알림 확인 버튼  | `signature-preview.error-dialog-confirm-button` |                                                                 |

### 홈

| 화면 | 요소                          | testID                              | 비고                                                                                             |
| ---- | ----------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------ |
| home | 화면 루트                     | `home.root`                         |                                                                                                  |
| home | 스크롤 영역                   | `home.scroll`                       | 맨 위 스크롤·위치 확인용                                                                         |
| home | 알림 벨 버튼                  | `home.notification-button`          | 게스트는 토스트                                                                                  |
| home | 미읽음 점                     | `home.notification-unread-dot`      | hasUnread=true일 때만 존재                                                                       |
| home | 오늘 주제 날짜 라벨           | `home.topic-date`                   | "M월 d일 · 오늘의 주제"                                                                          |
| home | 오늘 주제 제목                | `home.topic-title`                  |                                                                                                  |
| home | 전체 로딩                     | `home.loading`                      | 첫 로드 중                                                                                       |
| home | 전체 오류 상태                | `home.error-state`                  |                                                                                                  |
| home | 전체 오류 다시 시도           | `home.retry-button`                 |                                                                                                  |
| home | 당겨서 새로고침 표시          | `home.refresh-indicator`            |                                                                                                  |
| home | 히어로: 로딩                  | `home.hero-loading`                 | "오늘의 주제를 불러오는 중"                                                                      |
| home | 히어로: 참여 가능한 주제 없음 | `home.hero-no-open-topic`           | NoOpenTopic                                                                                      |
| home | 히어로: 사진 없음(Empty)      | `home.hero-empty`                   | "…" 사진을 공유하지 않았어요                                                                     |
| home | 히어로: 업로드 진입 버튼      | `home.hero-upload-button`           | Empty 상태 안                                                                                    |
| home | 히어로: 처리 중               | `home.hero-processing`              | VALIDATING                                                                                       |
| home | 히어로: 사진                  | `home.hero-photo`                   | PENDING·APPROVED                                                                                 |
| home | 히어로: 검수 대기 배지        | `home.hero-pending-badge`           | PENDING일 때만 존재                                                                              |
| home | 히어로: 오류                  | `home.hero-error`                   | "사진 상태를 불러오지 못했어요"                                                                  |
| home | 히어로: 오류 다시 시도        | `home.hero-retry-button`            |                                                                                                  |
| home | 이번 주 기록 섹션             | `home.week-section`                 |                                                                                                  |
| home | 이번 주 기록 날짜 칸          | `home.week-day-{yyyy-mm-dd}`        | 일~토 7칸, 날짜는 KST                                                                            |
| home | 이번 주 기록 사진             | `home.week-photo-{yyyy-mm-dd}`      | 기록이 있는 날만 존재                                                                            |
| home | 이번 주 기록 빈/오류          | `home.week-error`                   | "기록을 불러오지 못했어요"                                                                       |
| home | 랭킹 섹션                     | `home.ranking-section`              | "어제 랭킹"                                                                                      |
| home | 랭킹 더 보기 링크             | `home.ranking-more-link`            | 해당 날짜 전시로 이동                                                                            |
| home | 랭킹 항목                     | `home.ranking-item-{postId}`        | 최대 5개                                                                                         |
| home | 랭킹 빈 상태                  | `home.ranking-empty`                | "아직 올라온 사진이 없어요"                                                                      |
| home | 오늘 인기 섹션                | `home.popular-section`              | "오늘 인기있는 사진"                                                                             |
| home | 오늘 인기 항목                | `home.popular-item-{postId}`        |                                                                                                  |
| home | 오늘 인기 더 보기 링크        | `home.popular-more-link`            |                                                                                                  |
| home | AI 카드                       | `home.ai-card`                      | 오늘 승인된 내 사진일 때만 존재                                                                  |
| home | AI 카드: 요청 버튼            | `home.ai-request-button`            | "이 사진, AI에게 피드백 받아보기"                                                                |
| home | AI 카드: 진행 중              | `home.ai-processing`                | "AI 피드백이 진행중이에요"                                                                       |
| home | AI 카드: 완료                 | `home.ai-completed`                 | "AI 피드백이 완료되었어요"                                                                       |
| home | AI 카드: 자세히 보기          | `home.ai-detail-button`             |                                                                                                  |
| home | AI 카드: 실패                 | `home.ai-failed`                    | "AI 피드백을 생성하지 못했어요"                                                                  |
| home | AI 카드: 재요청               | `home.ai-retry-button`              |                                                                                                  |
| home | ISSUE 섹션                    | `home.issue-section`                | 배너 0건이거나 최초 조회 실패면 존재하지 않음(실패는 `home.issue-error`)                         |
| home | ISSUE 배너 항목               | `home.issue-item-{bannerId}`        |                                                                                                  |
| home | 이번 주 기록 N/7              | `home.week-count`                   | 기록이 있는 날 수("1/7")                                                                         |
| home | 이번 주 기록 다시 시도        | `home.week-retry-button`            | `home.week-error`와 함께                                                                         |
| home | 어제 랭킹 오류                | `home.ranking-error`                | "어제 랭킹 사진을 불러오지 못했어요"                                                             |
| home | 어제 랭킹 다시 시도           | `home.ranking-retry-button`         |                                                                                                  |
| home | 어제 랭킹 좋아요 버튼         | `home.ranking-like-button-{postId}` | selected(isLiked) 상태 노출                                                                      |
| home | 어제 랭킹 좋아요 수           | `home.ranking-like-count-{postId}`  |                                                                                                  |
| home | 오늘 인기 빈 상태             | `home.popular-empty`                | "아직 올라온 사진이 없어요"                                                                      |
| home | 오늘 인기 오류                | `home.popular-error`                | "오늘 인기있는 사진 사진을 불러오지 못했어요"                                                    |
| home | 오늘 인기 다시 시도           | `home.popular-retry-button`         |                                                                                                  |
| home | 오늘 인기 좋아요 버튼         | `home.popular-like-button-{postId}` | selected(isLiked) 상태 노출                                                                      |
| home | 오늘 인기 좋아요 수           | `home.popular-like-count-{postId}`  |                                                                                                  |
| home | ISSUE 오류                    | `home.issue-error`                  | 최초 조회 실패 "ISSUE를 불러오지 못했어요. 다시 시도"(REQ-BANR-006). `home.issue-section`은 없다 |
| home | ISSUE 다시 시도               | `home.issue-retry-button`           |                                                                                                  |

### 배너 웹 화면 (ISSUE)

| 화면  | 요소                  | testID                           | 비고                         |
| ----- | --------------------- | -------------------------------- | ---------------------------- |
| issue | 화면 루트             | `issue.root`                     |                              |
| issue | 제목                  | `issue.title`                    |                              |
| issue | 뒤로 버튼             | `issue.back-button`              |                              |
| issue | 웹뷰 본문             | `issue.web-content`              |                              |
| issue | 로딩 표시             | `issue.loading`                  |                              |
| issue | 오류 상태             | `issue.error-state`              | "페이지를 불러오지 못했어요" |
| issue | 다시 시도 버튼        | `issue.retry-button`             |                              |
| issue | 링크 열기 실패 메시지 | `issue.link-open-failed-message` | "링크를 열 수 없어요" 등     |

### 전시

| 화면    | 요소                      | testID                                  | 비고                                     |
| ------- | ------------------------- | --------------------------------------- | ---------------------------------------- |
| display | 화면 루트                 | `display.root`                          |                                          |
| display | 날짜 라벨                 | `display.date-label`                    |                                          |
| display | 이전 날짜 버튼            | `display.prev-date-button`              | FIRST_TOPIC_DATE에서 비활성              |
| display | 다음 날짜 버튼            | `display.next-date-button`              | 오늘(KST)에서 비활성                     |
| display | 날짜 선택 버튼            | `display.date-picker-button`            |                                          |
| display | 날짜 선택 시트            | `display.date-picker-sheet`             |                                          |
| display | 날짜 선택: 연             | `display.date-picker-year`              |                                          |
| display | 날짜 선택: 월             | `display.date-picker-month`             |                                          |
| display | 날짜 선택: 일             | `display.date-picker-day`               |                                          |
| display | 날짜 선택 확인            | `display.date-picker-confirm-button`    |                                          |
| display | 주제 제목                 | `display.topic-title`                   |                                          |
| display | 설명 문구                 | `display.description`                   | "가장 사람들이 좋아했던 사진들이에요" 등 |
| display | 정렬: 최신순              | `display.sort-recent-tab`               | selected 상태 노출. 오늘 날짜에서만 존재 |
| display | 정렬: 인기순              | `display.sort-popular-tab`              | selected 상태 노출                       |
| display | 정렬: 랜덤순              | `display.sort-random-tab`               | selected 상태 노출                       |
| display | 아카이브 상위 5 페이저    | `display.featured-pager`                | 과거 날짜에서만 존재                     |
| display | 아카이브 항목             | `display.featured-item-{postId}`        |                                          |
| display | 아카이브 항목 좋아요 버튼 | `display.featured-like-button-{postId}` | selected(isLiked) 상태 노출 (RN 추가)    |
| display | 아카이브 항목 좋아요 수   | `display.featured-like-count-{postId}`  | (RN 추가)                                |
| display | 그리드                    | `display.grid`                          | 스크롤·맨 위 이동 확인용                 |
| display | 그리드 항목               | `display.item-{postId}`                 | 탭하면 피드                              |
| display | 그리드 항목 좋아요 버튼   | `display.like-button-{postId}`          | selected(isLiked) 상태 노출              |
| display | 그리드 항목 좋아요 수     | `display.like-count-{postId}`           |                                          |
| display | 다음 페이지 로딩          | `display.load-more-indicator`           |                                          |
| display | 새로고침 표시             | `display.refresh-indicator`             |                                          |
| display | 로딩 표시                 | `display.loading`                       | 로딩 중에만 존재                         |
| display | 빈 상태                   | `display.empty-state`                   | 데이터 0건일 때만 존재                   |
| display | 오류 상태(콘텐츠 없음)    | `display.error-state`                   | 콘텐츠가 없을 때의 전체 오류 화면        |
| display | 다시 시도 버튼            | `display.retry-button`                  | 오류 상태 안                             |

### 게시물 상세 (피드)

| 화면 | 요소                   | testID                       | 비고                                          |
| ---- | ---------------------- | ---------------------------- | --------------------------------------------- |
| feed | 화면 루트              | `feed.root`                  |                                               |
| feed | 뒤로 버튼              | `feed.back-button`           |                                               |
| feed | 사진                   | `feed.photo`                 | 핀치 줌 대상(최대 4배)                        |
| feed | 사진 확대 내용         | `feed.photo-content`         | 핀치 변환이 적용되는 내부 뷰 (RN 추가)        |
| feed | 사인 이미지            | `feed.signature-image`       |                                               |
| feed | 날짜 라벨              | `feed.date-label`            | "M월 d일의 주제"                              |
| feed | 제목                   | `feed.title`                 | 제목 없으면 "무제"                            |
| feed | 좋아요 버튼            | `feed.like-button`           | selected(isLiked) 상태 노출                   |
| feed | 좋아요 수              | `feed.like-count`            |                                               |
| feed | 제목 수정 버튼         | `feed.edit-title-button`     | 내 게시물 + 오늘 주제일 때만 존재             |
| feed | 삭제 버튼              | `feed.delete-button`         | 내 게시물일 때만 존재                         |
| feed | AI: 피드백 받기        | `feed.ai-request-button`     | "AI 피드백 받기"                              |
| feed | AI: 상태 확인 중       | `feed.ai-checking`           | "AI 상태 확인중"                              |
| feed | AI: 요청 중            | `feed.ai-requesting`         | "AI 요청중"                                   |
| feed | AI: 분석 중            | `feed.ai-processing`         | 비활성                                        |
| feed | AI: 피드백 보기        | `feed.ai-result-button`      | COMPLETED                                     |
| feed | AI: 피드백 재요청      | `feed.ai-retry-button`       | FAILED + canRequestAgain                      |
| feed | AI: 피드백 실패        | `feed.ai-failed-button`      | FAILED                                        |
| feed | AI: 상태 다시 확인     | `feed.ai-recheck-button`     | 폴링 창 종료 뒤                               |
| feed | AI: 안내 메시지        | `feed.ai-message`            | "AI 피드백을 확인할 수 없는 게시물이에요." 등 |
| feed | 삭제 확인 다이얼로그   | `feed.delete-dialog`         | "게시물을 삭제하시겠어요?"                    |
| feed | 삭제 확인 제목         | `feed.delete-title`          | "게시물 삭제" (RN 추가)                       |
| feed | 삭제 확인 본문         | `feed.delete-body`           | "게시물을 삭제하시겠어요?" (RN 추가)           |
| feed | 삭제 확인 버튼         | `feed.delete-confirm-button` |                                               |
| feed | 삭제 취소 버튼         | `feed.delete-cancel-button`  |                                               |
| feed | 제목 수정 다이얼로그   | `feed.title-dialog`          |                                               |
| feed | 제목 입력              | `feed.title-input`           | 10 code point 상한                            |
| feed | 제목 저장 버튼         | `feed.title-save-button`     | 저장 중에는 "저장 중..." 비활성               |
| feed | 제목 취소 버튼         | `feed.title-cancel-button`   |                                               |
| feed | 제목 저장 진행         | `feed.title-saving`          |                                               |
| feed | 삭제 진행              | `feed.deleting`              |                                               |
| feed | 게시물 없음 상태       | `feed.not-found-state`       | "게시물을 찾을 수 없어요"                     |
| feed | 로딩 표시              | `feed.loading`               | 로딩 중에만 존재                              |
| feed | 오류 상태(콘텐츠 없음) | `feed.error-state`           | 콘텐츠가 없을 때의 전체 오류 화면             |
| feed | 다시 시도 버튼         | `feed.retry-button`          | 오류 상태 안                                  |

### AI 피드백 시작 시트

| 화면           | 요소           | testID                        | 비고                                                    |
| -------------- | -------------- | ----------------------------- | ------------------------------------------------------- |
| ai-start-sheet | 시트 루트      | `ai-start-sheet.root`         | "AI 피드백을 시작할까요?" / "AI 피드백을 재요청할까요?" |
| ai-start-sheet | 안내 문구      | `ai-start-sheet.description`  |                                                         |
| ai-start-sheet | 분석 시작 버튼 | `ai-start-sheet.start-button` | "분석 시작하기", 요청 중 비활성                         |
| ai-start-sheet | 닫기 버튼      | `ai-start-sheet.close-button` |                                                         |

### AI 피드백 결과 시트

| 화면            | 요소                 | testID                                 | 비고                                    |
| --------------- | -------------------- | -------------------------------------- | --------------------------------------- |
| ai-result-sheet | 시트 루트            | `ai-result-sheet.root`                 |                                         |
| ai-result-sheet | 전체 점수            | `ai-result-sheet.overall-score`        | 접근성 문구 "전체 점수 10점 만점에 X점" |
| ai-result-sheet | 기준별 점수 항목     | `ai-result-sheet.criteria-item-{key}`  |                                         |
| ai-result-sheet | 해석 돋보임 배지     | `ai-result-sheet.distinctive-badge`    | distinctivePerspective=true일 때만 존재 |
| ai-result-sheet | 요약                 | `ai-result-sheet.feedback-summary`     |                                         |
| ai-result-sheet | 좋았던 점            | `ai-result-sheet.feedback-strength`    |                                         |
| ai-result-sheet | 아쉬운 점            | `ai-result-sheet.feedback-weakness`    |                                         |
| ai-result-sheet | 다음엔 이렇게        | `ai-result-sheet.feedback-suggestion`  |                                         |
| ai-result-sheet | 기준 안내 버튼       | `ai-result-sheet.criteria-info-button` |                                         |
| ai-result-sheet | 기준 안내 다이얼로그 | `ai-result-sheet.criteria-dialog`      |                                         |
| ai-result-sheet | 닫기 버튼            | `ai-result-sheet.close-button`         |                                         |
| ai-result-sheet | 기준 안내 닫기 버튼  | `ai-result-sheet.criteria-close-button` | 기준 안내 다이얼로그 안 (RN 추가)       |

### AI 피드백 실패 시트

| 화면            | 요소        | testID                           | 비고                                             |
| --------------- | ----------- | -------------------------------- | ------------------------------------------------ |
| ai-failed-sheet | 시트 루트   | `ai-failed-sheet.root`           | "AI 피드백을 생성하지 못했어요"                  |
| ai-failed-sheet | 안내 메시지 | `ai-failed-sheet.message`        | 재요청 불가 사유 문구 포함                       |
| ai-failed-sheet | 재요청 버튼 | `ai-failed-sheet.retry-button`   | canRequestAgain=true이고 오늘 게시물일 때만 존재 |
| ai-failed-sheet | 확인 버튼   | `ai-failed-sheet.confirm-button` |                                                  |

### 기록 (캘린더)

| 화면   | 요소                   | testID                               | 비고                                           |
| ------ | ---------------------- | ------------------------------------ | ---------------------------------------------- |
| record | 화면 루트              | `record.root`                        |                                                |
| record | 현재 연월 라벨         | `record.month-label`                 |                                                |
| record | 이전 달 버튼           | `record.prev-month-button`           |                                                |
| record | 다음 달 버튼           | `record.next-month-button`           |                                                |
| record | 월 선택 버튼           | `record.month-picker-button`         |                                                |
| record | 월 선택 시트           | `record.month-picker-sheet`          |                                                |
| record | 월 선택 항목           | `record.month-picker-item-{yyyy-mm}` | 현재 달은 기록이 없어도 존재                   |
| record | 월 선택 닫기 버튼      | `record.month-picker-close-button`   | 월 선택 시트 안 (RN 추가)                      |
| record | 요일 헤더              | `record.weekday-header`              | 일월화수목금토                                 |
| record | 달력 그리드            | `record.calendar-grid`               |                                                |
| record | 날짜 칸                | `record.day-{yyyy-mm-dd}`            | 기록이 있는 날은 사진 존재, selected 상태 노출 |
| record | 선택한 날의 사진       | `record.selected-photo`              |                                                |
| record | 사진 반영 중 배지      | `record.pending-badge`               | PENDING일 때만 존재                            |
| record | 사진 반영 중 안내      | `record.pending-tooltip`             |                                                |
| record | 피드에서 보기 버튼     | `record.view-feed-button`            | APPROVED일 때만 존재                           |
| record | 전시 보러가기 버튼     | `record.view-display-button`         | APPROVED일 때만 존재                           |
| record | 이미지로 저장 버튼     | `record.save-image-button`           |                                                |
| record | 로그인 필요 상태       | `record.login-required-state`        | 401 응답                                       |
| record | 로그인 하기 버튼       | `record.login-button`                |                                                |
| record | 조회 불가 연월 메시지  | `record.invalid-month-message`       | "조회할 수 없는 연월이에요"                    |
| record | 로딩 표시              | `record.loading`                     | 로딩 중에만 존재                               |
| record | 빈 상태                | `record.empty-state`                 | 데이터 0건일 때만 존재                         |
| record | 오류 상태(콘텐츠 없음) | `record.error-state`                 | 콘텐츠가 없을 때의 전체 오류 화면              |
| record | 다시 시도 버튼         | `record.retry-button`                | 오류 상태 안                                   |
| record | 날짜 칸 썸네일         | `record.day-photo-{yyyy-mm-dd}`      | 기록이 있는 날만 존재 (RN 추가)                |
| record | 날짜 칸 반영 중 배지   | `record.day-pending-{yyyy-mm-dd}`    | PENDING인 날만 존재 (RN 추가)                  |
| record | 오늘 표시              | `record.today-marker`                | 오늘(KST) 날짜 칸 안에 하나만 존재 (RN 추가)   |
| record | 오류 메시지            | `record.error-message`               | 오류 상태 안, "기록을 불러오지 못했어요" (RN 추가) |
| record | 저장용 달력 이미지의 사진 | `calendar-image.photo-{yyyy-mm-dd}` | 화면 밖 캡처용 뷰의 썸네일, 접근성 숨김 (RN 추가) |
| record | 저장용 달력 이미지 루트 | `calendar-image.root` | 화면 밖 캡처용 뷰, 접근성 숨김 (RN 추가) |

### 알림함

| 화면          | 요소                   | testID                                          | 비고                              |
| ------------- | ---------------------- | ----------------------------------------------- | --------------------------------- |
| notifications | 화면 루트              | `notifications.root`                            |                                   |
| notifications | 뒤로 버튼              | `notifications.back-button`                     |                                   |
| notifications | 목록                   | `notifications.list`                            |                                   |
| notifications | 알림 항목              | `notifications.item-{notificationId}`           | 탭하면 읽음 처리 후 이동          |
| notifications | 항목 제목              | `notifications.item-title-{notificationId}`     |                                   |
| notifications | 항목 본문              | `notifications.item-body-{notificationId}`      |                                   |
| notifications | 항목 시각              | `notifications.item-time-{notificationId}`      | "M월 d일 HH:mm" KST               |
| notifications | 항목 썸네일            | `notifications.item-thumbnail-{notificationId}` | 없으면 대체 이미지                |
| notifications | 항목 미읽음 표시       | `notifications.item-unread-{notificationId}`    | readAt=null일 때만 존재           |
| notifications | 다음 페이지 로딩       | `notifications.load-more-indicator`             |                                   |
| notifications | 새로고침 표시          | `notifications.refresh-indicator`               |                                   |
| notifications | 로딩 표시              | `notifications.loading`                         | 로딩 중에만 존재                  |
| notifications | 빈 상태                | `notifications.empty-state`                     | 데이터 0건일 때만 존재            |
| notifications | 오류 상태(콘텐츠 없음) | `notifications.error-state`                     | 콘텐츠가 없을 때의 전체 오류 화면 |
| notifications | 다시 시도 버튼         | `notifications.retry-button`                    | 오류 상태 안                      |

### 알림 상세

| 화면                | 요소                   | testID                                     | 비고                                |
| ------------------- | ---------------------- | ------------------------------------------ | ----------------------------------- |
| notification-detail | 화면 루트              | `notification-detail.root`                 |                                     |
| notification-detail | 제목 바                | `notification-detail.screen-title`         | "알림 상세"                         |
| notification-detail | 뒤로 버튼              | `notification-detail.back-button`          |                                     |
| notification-detail | 알림 제목              | `notification-detail.title`                |                                     |
| notification-detail | 알림 본문              | `notification-detail.body`                 |                                     |
| notification-detail | 원본 사진              | `notification-detail.photo`                | 반려 알림에서만 존재                |
| notification-detail | 반려 사유 섹션         | `notification-detail.rejection-section`    | "반려 사유"                         |
| notification-detail | 반려 사유 텍스트       | `notification-detail.rejection-reason`     | 최대 500자                          |
| notification-detail | 알림함으로 버튼        | `notification-detail.back-to-inbox-button` |                                     |
| notification-detail | 찾을 수 없음 상태      | `notification-detail.not-found-state`      | "더 이상 확인할 수 없는 알림이에요" |
| notification-detail | 로딩 표시              | `notification-detail.loading`              | 로딩 중에만 존재                    |
| notification-detail | 오류 상태(콘텐츠 없음) | `notification-detail.error-state`          | 콘텐츠가 없을 때의 전체 오류 화면   |
| notification-detail | 다시 시도 버튼         | `notification-detail.retry-button`         | 오류 상태 안                        |

### 설정

| 화면     | 요소                     | testID                             | 비고                                                 |
| -------- | ------------------------ | ---------------------------------- | ---------------------------------------------------- |
| settings | 화면 루트                | `settings.root`                    |                                                      |
| settings | 사인 카드                | `settings.signature-card`          | 회원만 존재                                          |
| settings | 사인 이미지              | `settings.signature-image`         | 썸네일 우선, 없으면 원본                             |
| settings | 사인 로딩                | `settings.signature-loading`       |                                                      |
| settings | 사인 오류                | `settings.signature-error`         | "사인을 불러오지 못했어요. 다시 시도해 주세요."      |
| settings | 사인 다시 불러오기       | `settings.signature-retry-button`  |                                                      |
| settings | 사인 변경 버튼           | `settings.signature-change-button` | "변경하기" / "사인 재설정"                           |
| settings | 푸시 알림 섹션           | `settings.push-section`            | 회원만 존재. Web 표시 여부는 TC-SET-040 결정         |
| settings | 오늘 주제 알림 토글      | `settings.push-topic-toggle`       | checked 상태 노출                                    |
| settings | 승인·반려 알림 토글      | `settings.push-moderation-toggle`  | checked 상태 노출                                    |
| settings | AI 피드백 완료 알림 토글 | `settings.push-ai-toggle`          | checked 상태 노출                                    |
| settings | 푸시 설정 로딩           | `settings.push-loading`            | 토글 사용 불가                                       |
| settings | 푸시 설정 오류           | `settings.push-error`              | "알림 설정을 불러오지 못했어요. 다시 시도해 주세요." |
| settings | 푸시 설정 다시 시도      | `settings.push-retry-button`       |                                                      |
| settings | 피드백 보내기 행         | `settings.feedback-row`            | 게스트는 토스트                                      |
| settings | 개인정보처리방침 행      | `settings.privacy-row`             |                                                      |
| settings | 이용약관 행              | `settings.terms-row`               |                                                      |
| settings | 버전정보 행              | `settings.version-row`             |                                                      |
| settings | 버전 값                  | `settings.version-value`           | 앱 버전 문자열                                       |
| settings | 로그아웃 행              | `settings.logout-row`              | 회원만 존재                                          |
| settings | 회원탈퇴 행              | `settings.withdraw-row`            | 회원만 존재                                          |
| settings | 로그인 버튼              | `settings.login-button`            | 게스트만 존재                                        |
| settings | 로그아웃 확인 다이얼로그 | `settings.logout-dialog`           | "정말 로그아웃 하시겠습니까?"                        |
| settings | 로그아웃 확인 버튼       | `settings.logout-confirm-button`   |                                                      |
| settings | 로그아웃 취소 버튼       | `settings.logout-cancel-button`    |                                                      |
| settings | 회원탈퇴 확인 다이얼로그 | `settings.withdraw-dialog`         | "정말 회원탈퇴 하시겠습니까?"                        |
| settings | 회원탈퇴 확인 버튼       | `settings.withdraw-confirm-button` | 처리 중 비활성                                       |
| settings | 회원탈퇴 취소 버튼       | `settings.withdraw-cancel-button`  |                                                      |

### 피드백

| 화면     | 요소           | testID                        | 비고                                                  |
| -------- | -------------- | ----------------------------- | ----------------------------------------------------- |
| feedback | 화면 루트      | `feedback.root`               |                                                       |
| feedback | 닫기 버튼      | `feedback.close-button`       |                                                       |
| feedback | 안내 문구      | `feedback.guide-text`         |                                                       |
| feedback | 입력창         | `feedback.input`              | 플레이스홀더 "내용을 입력해 주세요."                  |
| feedback | 글자 수 카운터 | `feedback.counter`            | trim 후 code point 수                                 |
| feedback | 보내기 버튼    | `feedback.submit-button`      | trim 후 0자이면 비활성, 전송 중 "보내는 중..." 비활성 |
| feedback | 검증 메시지    | `feedback.validation-message` | "피드백은 1자 이상 1000자 이하로 입력해 주세요."      |
| feedback | 오류 메시지    | `feedback.error-message`      | 전송 실패 문구                                        |
| feedback | 안내 본문      | `feedback.guide-body`         | 안내 문구 아래 본문 (RN 추가)                         |

### 업로드 진입 게이트

| 화면         | 요소              | testID                 | 비고                                        |
| ------------ | ----------------- | ---------------------- | ------------------------------------------- |
| upload-entry | 진입 확인 중 표시 | `upload-entry.loading` | GET /posts/today 확인 중. 연타는 1회만 처리 |

### 사진 업로드

| 화면 | 요소 | testID | 비고 |
| --- | --- | --- | --- |
| upload | 화면 루트 | `upload.root` |  |
| upload | 닫기 버튼 | `upload.close-button` |  |
| upload | 주제 제목 | `upload.topic-title` | "주제 ‘…’에 맞는 한 장" |
| upload | 안내 문구 | `upload.guide-text` | "앨범에서 고르거나 지금 찍어요" |
| upload | 사진 미리보기 | `upload.photo-preview` | 탭하면 재편집 |
| upload | 앨범 버튼 | `upload.album-button` |  |
| upload | 카메라 버튼 | `upload.camera-button` | 카메라 없는 기기·웹 데스크톱에서는 존재하지 않음 |
| upload | 제목 입력 | `upload.title-input` | 10 code point 상한, 플레이스홀더 "작품 제목은 선택이에요." |
| upload | 제목 글자 수 | `upload.title-counter` |  |
| upload | 전시하기 버튼 | `upload.submit-button` | 사진 없거나 준비 중이면 정책에 따라 비활성, 제출 중 "전시 중..." 비활성 |
| upload | 사진 준비 중 표시 | `upload.preparing-indicator` | 정책 발급·WebP 인코딩 중 |
| upload | 제출 중 표시 | `upload.submitting-indicator` |  |
| upload | 오류 메시지 | `upload.error-message` | 실패 문구 |
| upload | 주제 불러오기 오류 | `upload.error-state` | 주제 조회 실패(RN 추가, 공통 상태 요소 이름 규칙) |
| upload | 주제 다시 시도 버튼 | `upload.retry-button` | 주제만 다시 받는다(RN 추가) |
| upload | 카메라 저장 권한 안내 | `upload.camera-permission-dialog` | iOS "촬영 사진 저장 권한" |
| upload | 권한 안내: 설정 열기 | `upload.camera-permission-settings-button` |  |
| upload | 권한 안내: 저장 없이 촬영 | `upload.camera-permission-shoot-button` |  |
| upload | 권한 안내: 취소 | `upload.camera-permission-cancel-button` |  |

### 사진 편집

| 화면 | 요소 | testID | 비고 |
| --- | --- | --- | --- |
| photo-edit | 화면 루트 | `photo-edit.root` |  |
| photo-edit | 취소 버튼 | `photo-edit.cancel-button` |  |
| photo-edit | 완료 버튼 | `photo-edit.done-button` |  |
| photo-edit | 자르기 탭 | `photo-edit.tab-crop` | selected 상태 노출 |
| photo-edit | 조정 탭 | `photo-edit.tab-adjust` | selected 상태 노출 |
| photo-edit | 필터 탭 | `photo-edit.tab-filter` | selected 상태 노출 |
| photo-edit | 미리보기 이미지 | `photo-edit.preview-image` |  |
| photo-edit | 자르기 영역 | `photo-edit.crop-area` |  |
| photo-edit | 90도 회전 버튼 | `photo-edit.rotate-button` |  |
| photo-edit | 초기화 버튼 | `photo-edit.reset-button` |  |
| photo-edit | 비율: 원본 | `photo-edit.ratio-original` | selected 상태 노출 |
| photo-edit | 비율: 자유 | `photo-edit.ratio-free` |  |
| photo-edit | 비율: 1:1 | `photo-edit.ratio-1-1` |  |
| photo-edit | 비율: 4:5 | `photo-edit.ratio-4-5` |  |
| photo-edit | 비율: 5:4 | `photo-edit.ratio-5-4` |  |
| photo-edit | 비율: 3:4 | `photo-edit.ratio-3-4` |  |
| photo-edit | 비율: 4:3 | `photo-edit.ratio-4-3` |  |
| photo-edit | 비율: 9:16 | `photo-edit.ratio-9-16` |  |
| photo-edit | 비율: 16:9 | `photo-edit.ratio-16-9` |  |
| photo-edit | 조정: 노출 | `photo-edit.adjust-exposure-slider` | 표시값 -100~100 |
| photo-edit | 조정: 대비 | `photo-edit.adjust-contrast-slider` |  |
| photo-edit | 조정: 하이라이트 | `photo-edit.adjust-highlights-slider` |  |
| photo-edit | 조정: 그림자 | `photo-edit.adjust-shadows-slider` |  |
| photo-edit | 조정: 블랙 포인트 | `photo-edit.adjust-black-point-slider` |  |
| photo-edit | 조정: 채도 | `photo-edit.adjust-saturation-slider` |  |
| photo-edit | 조정: 따뜻함 | `photo-edit.adjust-warmth-slider` |  |
| photo-edit | 조정 항목 선택: 자동·노출·대비·하이라이트·그림자·블랙 포인트·채도·따뜻함 | `photo-edit.adjust-item-{item}` | `{item}`은 auto, exposure, contrast, highlights, shadows, black-point, saturation, warmth. selected 상태 노출(RN 추가) |
| photo-edit | 조정 초기화 버튼 | `photo-edit.adjust-reset-button` | 자동 강도 0, 직접 값 삭제(RN 추가) |
| photo-edit | 조정: 자동 보정 토글 | `photo-edit.adjust-auto-toggle` | checked 상태 노출 |
| photo-edit | 조정: 자동 보정 강도 | `photo-edit.adjust-auto-strength-slider` | 0~1 |
| photo-edit | 필터: 원본 | `photo-edit.filter-original` | selected 상태 노출 |
| photo-edit | 필터: 흑백 | `photo-edit.filter-mono` |  |
| photo-edit | 필터: 따뜻하게 | `photo-edit.filter-warm` |  |
| photo-edit | 필터: 차갑게 | `photo-edit.filter-cool` |  |
| photo-edit | 필터: 빈티지 | `photo-edit.filter-vintage` |  |
| photo-edit | 필터: 선명하게 | `photo-edit.filter-vivid` |  |
| photo-edit | 렌더링 진행 | `photo-edit.rendering-indicator` | 완료 버튼 후 원본 크기 렌더링 중 |
| photo-edit | 편집 오류 알림 | `photo-edit.error-dialog` | "사진을 편집하지 못했어요. 다시 시도해 주세요." |
| photo-edit | 편집 오류 알림: 다시 시도 버튼 | `photo-edit.error-retry-button` | 편집용 이미지 준비를 다시 시도한다(RN 추가) |

### 업로드 성공

| 화면           | 요소            | testID                          | 비고                             |
| -------------- | --------------- | ------------------------------- | -------------------------------- |
| upload-success | 화면 루트       | `upload-success.root`           |                                  |
| upload-success | 기록 문구       | `upload-success.message`        | "‘주제’을/를 기록했어요."        |
| upload-success | 상태 안내 문구  | `upload-success.status-message` | PENDING / VALIDATING에 따라 다름 |
| upload-success | 확인했어요 버튼 | `upload-success.confirm-button` | 업로드한 날짜 전시로 이동        |

### 하단 탭바

| 화면       | 요소        | testID                     | 비고                              |
| ---------- | ----------- | -------------------------- | --------------------------------- |
| bottom-bar | 탭바 루트   | `bottom-bar.root`          | Feed 등에서는 숨김(존재하지 않음) |
| bottom-bar | 홈 탭       | `bottom-bar.tab-home`      | selected 상태 노출                |
| bottom-bar | 전시 탭     | `bottom-bar.tab-display`   | selected 상태 노출                |
| bottom-bar | 업로드 버튼 | `bottom-bar.upload-button` | 탭이 아님. selected 없음          |
| bottom-bar | 기록 탭     | `bottom-bar.tab-record`    | selected 상태 노출                |
| bottom-bar | 설정 탭     | `bottom-bar.tab-settings`  | selected 상태 노출                |

### 알림 권한 앱 안내

| 화면            | 요소            | testID                         | 비고                     |
| --------------- | --------------- | ------------------------------ | ------------------------ |
| push-permission | 안내 다이얼로그 | `push-permission.dialog`       | "알림을 허용하시겠어요?" |
| push-permission | 안내 본문       | `push-permission.message`      |                          |
| push-permission | 허용 버튼       | `push-permission.allow-button` |                          |
| push-permission | 거부 버튼       | `push-permission.deny-button`  |                          |

### 토스트 · 공통 오버레이

| 화면  | 요소             | testID                 | 비고                                                              |
| ----- | ---------------- | ---------------------- | ----------------------------------------------------------------- |
| toast | 토스트 컨테이너  | `toast.container`      | 토스트가 떠 있는 동안만 존재, 2.5초 후 제거                       |
| toast | 토스트 문구      | `toast.message`        | 문구 텍스트를 이 요소에서 검증. 같은 문구 연속 표시도 새로 그려짐 |
| toast | 전역 오류 알림   | `alert.dialog`         | 시스템 알림 형태의 공통 오류 다이얼로그                           |
| toast | 전역 알림 제목   | `alert.title`          |                                                                   |
| toast | 전역 알림 메시지 | `alert.message`        |                                                                   |
| toast | 전역 알림 확인   | `alert.confirm-button` |                                                                   |

## 4. 개수

화면 25개, 식별자 336개.
