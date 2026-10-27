# 설정과 피드백 (SET, FDBK)

설정 탭은 사인 카드, 푸시 수신 설정 스위치 3개, 계정(로그아웃·회원탈퇴), 피드백 진입, 약관 문서와 버전 정보를 보여 준다. 푸시 수신 설정은 낙관적으로 바꾸고 실패한 항목만 되돌리며, 기기 알림 권한이 꺼져 있을 때 스위치를 켜면 시스템 알림 설정으로 보낸다. 게스트는 "로그인" 버튼만 본다. 피드백 화면은 앞뒤 공백을 뺀 1~1000자(code point)를 `POST /feedbacks`로 보낸다. 로그아웃·탈퇴의 동작은 [boot-auth.md](boot-auth.md), 사인 카드와 변경 흐름은 [onboarding-signature.md](onboarding-signature.md), 약관 문서 열기 규칙은 같은 문서의 REQ-ONB-007~009를 따른다.

- 관련 규칙: [NOTIFICATION-006](../../reference/business-rules/rules/notification.md#notification-006-본인-푸시-수신-설정-조회수정), [USER-003](../../reference/business-rules/rules/user.md), [FEEDBACK-001~003](../../reference/business-rules/rules/feedback.md)
- 관련 결정: [D-05](../decisions.md#d-05-게스트-제한), [D-08](../decisions.md#d-08-정지banned-회원), [D-16](../decisions.md#d-16-로그아웃탈퇴), [D-20](../decisions.md#d-20-오류-화면과-토스트), [D-21](../decisions.md#d-21-네트워크-타임아웃), [D-22](../decisions.md#d-22-분석-이벤트), [D-25](../decisions.md#d-25-약관-동의)
- 관련 열린 질문: [Q-13](../open-questions.md)(앱 버전은 피드백에 보내지 않음)
- 근거 약어: iOS = [legacy-ios](../../reference/legacy-ios.md), AN = [legacy-android](../../reference/legacy-android.md), API = [api-contract](../../reference/api-contract.md).
- 공통 상수: `FEEDBACK_MAX` 1000(앞뒤 공백 제거 후 code point), 최소 1.

## 화면

### 설정 탭 (회원)

- 진입 조건: 하단 바 설정 탭(회원).
- 구성 요소(위에서 아래로):
  1. 앱 설정: 사인 카드(제목 "사인 재설정", 현재 사인, "변경하기").
  2. 푸시 알림: 스위치 3개 `push-setting-topic`("오늘 주제 알림"), `push-setting-moderation`("게시물 승인·반려 알림"), `push-setting-ai-review`("AI 피드백 완료 알림").
  3. 계정: "로그아웃" `settings-logout-row`, "회원탈퇴" `settings-withdraw-row`.
  4. 피드백: "피드백 보내기" `settings-feedback-row`.
  5. 정보 및 약관: "개인정보처리방침" `settings-privacy-row`, "이용약관" `settings-terms-row`, "버전정보" `settings-version-row`(값 표시).
- 사용자 동작: 스위치 토글, 행 탭, 사인 "변경하기".

### 설정 탭 (게스트)

- 진입 조건: 게스트가 설정 탭을 열었을 때.
- 구성 요소: "로그인" 버튼 `settings-login-button` 하나뿐이다.
- 사용자 동작: "로그인" → 게스트 플래그를 지우고 로그인 화면으로 이동([navigation.md](navigation.md) REQ-NAV-020).

### 확인 대화상자 (로그아웃·탈퇴)

- 본문과 버튼은 [boot-auth.md](boot-auth.md)의 키(`auth.logout.confirm.*`, `auth.withdraw.confirm.*`)를 쓴다.

### 약관 문서

- 개인정보처리방침, 이용약관 행을 누르면 열리는 웹뷰. 동작과 오류는 [onboarding-signature.md](onboarding-signature.md) REQ-ONB-007~009.

### 피드백 보내기

- 진입 조건: 회원이 설정의 "피드백 보내기"를 눌렀을 때. 게스트는 토스트로 막힌다.
- 구성 요소: 안내 제목(`fdbk.intro.title`), 안내 설명(`fdbk.intro.body`), 입력 필드 `feedback-input`(라벨 "피드백 내용", 플레이스홀더 "내용을 입력해 주세요."), 글자 수 카운터 `feedback-counter`, "보내기" `feedback-send-button`.
- 사용자 동작: 입력, 보내기, 뒤로.

## 요구사항

### SET: 설정 탭 구성

| ID | 요구사항 | 근거 |
| --- | --- | --- |
| REQ-SET-001 | 회원의 설정 탭은 위에서부터 앱 설정(사인), 푸시 알림, 계정, 피드백, 정보 및 약관 섹션을 이 순서로 보인다. | iOS §2.11, AN §2.11 |
| REQ-SET-002 | 게스트의 설정 탭은 "로그인" 버튼만 보이고 사인·푸시 설정·계정·피드백·약관 행은 보이지 않으며, 설정 API를 부르지 않는다. | D-05, AN §2.11 |
| REQ-SET-003 | 설정 탭이 보일 때 분석 이벤트 `screen_view(settings)`를 보낸다. | D-22 |
| REQ-SET-004 | 사인 카드는 설정 탭이 보일 때마다 사인을 다시 조회하고 "변경하기"로 사인 변경 흐름을 연다(세부는 SIGN 요구사항). | D-18, REQ-SIGN-013~029 |
| REQ-SET-005 | "버전정보" 행은 앱 버전 문자열(iOS `MARKETING_VERSION`, Android `versionName`, Flutter·RN은 앱 설정 버전, Web은 빌드 버전)을 값으로 보이고 탭해도 아무 동작이 없다. | AN §2.11, iOS §2.11 |
| REQ-SET-006 | "개인정보처리방침"과 "이용약관" 행을 누르면 해당 약관 문서를 열고(허용 호스트·오류 규칙은 REQ-ONB-007~009), 문서가 보이는 동안 분석 이벤트 `screen_view`를 각각 `privacy_policy`, `terms_of_service`로 보낸다. | D-25, D-22, iOS §2.11 |
| REQ-SET-007 | "로그아웃"과 "회원탈퇴" 행은 확인 대화상자를 거쳐 REQ-AUTH-032~042를 따른다. | D-16 |

### SET: 푸시 수신 설정

| ID | 요구사항 | 근거 |
| --- | --- | --- |
| REQ-SET-008 | 설정 탭이 보일 때 `GET /notification-settings`로 `topicPushEnabled`, `moderationPushEnabled`, `aiReviewPushEnabled`를 불러와 세 스위치에 각각 반영하며, 로딩 중에는 스위치를 비활성화한다. | NOTIFICATION-006, AN §2.11, iOS §2.10 |
| REQ-SET-009 | 스위치 라벨은 "오늘 주제 알림"(`topicPushEnabled`), "게시물 승인·반려 알림"(`moderationPushEnabled`), "AI 피드백 완료 알림"(`aiReviewPushEnabled`)이다. | iOS §2.10, NOTIFICATION-006 |
| REQ-SET-010 | 설정 조회가 실패하면 토스트 `settings.push.load-error`를 보이고 스위치를 비활성 상태로 둔다(켜짐·꺼짐 값을 지어내 보이지 않는다). 설정 탭이 다시 보일 때 재조회한다. | iOS §2.10, AN §2.11 [추정: 실패 시 스위치 표시] |
| REQ-SET-011 | 스위치를 누르면 요청 응답을 기다리지 않고 즉시 새 값으로 바꿔 보인다. | iOS §2.10, AN §2.11 |
| REQ-SET-012 | 저장은 `PATCH /notification-settings`에 바뀐 항목 하나만 보내고(나머지 필드는 생략), 성공은 204이며 서버 값으로 다시 덮어쓰지 않는다. | NOTIFICATION-006, iOS §2.10 |
| REQ-SET-013 | 저장이 실패하면 실패한 항목만 이전 값으로 되돌리고 토스트 `settings.push.save-error`를 보이며, 다른 항목의 값과 진행 중인 요청에는 영향이 없다. | iOS §2.10, AN §2.11 (SettingsViewModelTest) |
| REQ-SET-014 | 같은 항목의 저장이 진행 중일 때 그 스위치의 추가 입력은 무시하고, 다른 항목은 독립적으로 동시에 저장할 수 있다. | AN §2.11 |
| REQ-SET-015 | 기기 알림 권한이 꺼져 있는 상태(iOS 거부, Android 알림 비허용)에서 스위치를 켜려고 하면 서버 값을 바꾸지 않고 스위치도 바꾸지 않은 채 시스템 알림 설정 화면으로 이동한다. [임시 동작: 확인 필요 1번] | iOS §2.10, AN §2.11, §5.1-6 |
| REQ-SET-016 | 기기 알림 권한이 꺼져 있어도 스위치를 끄는 것은 정상 저장 흐름(REQ-SET-011~013)을 따른다. | NOTIFICATION-006 [추정] |
| REQ-SET-017 | 앱이 포그라운드로 돌아올 때(시스템 설정에서 돌아온 경우 포함) 기기 알림 권한 상태를 다시 확인하고, 스위치 값은 서버 값 그대로 둔다. | AN §2.11, NOTIFICATION-006 |
| REQ-SET-018 | 기기 알림 권한이 아직 결정되지 않은 상태(iOS 미결정)에서 스위치를 켜면 시스템 권한 요청을 띄우고, 허용되면 켜는 저장을 진행하며 거부되면 스위치를 켜지 않는다. [임시 동작: 확인 필요 1번] | iOS §2.10 [추정] |
| REQ-SET-019 | Web은 기기 알림 권한을 확인하거나 시스템 설정으로 이동하지 않고 스위치를 서버 설정에만 연결한다. | Q-04 |
| REQ-SET-020 | 푸시 수신 설정은 계정 단위이며 로그아웃·계정 전환 시 이전 계정의 설정 값을 화면에 남기지 않는다. | NOTIFICATION-006, D-16 |
| REQ-SET-021 | 정지 회원도 푸시 수신 설정을 조회·수정할 수 있다. | NOTIFICATION-006, API §0.1 |

### FDBK: 피드백 보내기

| ID | 요구사항 | 근거 |
| --- | --- | --- |
| REQ-FDBK-001 | 설정의 "피드백 보내기"는 회원에게 피드백 화면을 열고, 게스트에게는 화면 없이 토스트 `nav.guest.feedback`를 보이며 요청을 보내지 않는다. | D-05, FEEDBACK-001 |
| REQ-FDBK-002 | 피드백 화면은 안내 제목, 안내 설명, 입력 필드(플레이스홀더 "내용을 입력해 주세요."), 글자 수 카운터, "보내기" 버튼을 보인다. | AN §2.12, iOS §2.12 |
| REQ-FDBK-003 | 글자 수는 입력값의 앞뒤 공백을 제거한 뒤 Unicode code point(grapheme가 아님) 수로 세고 카운터에 "현재 수/1000" 형태로 보인다. | FEEDBACK-002, iOS §2.12 |
| REQ-FDBK-004 | 공백 제거 후 글자 수가 0이면 "보내기"가 비활성이다. | AN §2.12 |
| REQ-FDBK-005 | 글자 수가 1000을 넘으면 요청을 보내지 않고 `fdbk.error.invalid`를 보인다. | iOS §2.12 [추정: 입력 자체는 막지 않고 보내기 시점에 검증] |
| REQ-FDBK-006 | "보내기"를 누르면 요청이 끝날 때까지 "보내는 중..."으로 표시하고 버튼을 비활성화하며, 연타해도 요청은 한 번만 보낸다. | AN §2.12, iOS §2.12 |
| REQ-FDBK-007 | 요청은 `POST /feedbacks`에 `{content}`(앞뒤 공백을 제거한 내용)만 보내며 앱 버전·기기 정보 등 다른 필드는 보내지 않는다. | FEEDBACK-002, Q-13 |
| REQ-FDBK-008 | 요청은 201이면 성공이고, 토스트 `fdbk.success`를 보이고 피드백 화면을 닫아 설정으로 돌아간다. [추정: 화면 닫기는 기존 문서에 명시 없음] | AN §2.12, iOS §2.12 |
| REQ-FDBK-009 | 요청이 실패하면 입력 내용을 그대로 유지하고 다시 보낼 수 있다. | iOS §2.12 [추정] |
| REQ-FDBK-010 | `400`은 `fdbk.error.invalid`, 연결 실패·타임아웃은 "네트워크 연결을 확인해 주세요.", 그 밖의 실패는 `fdbk.error.generic`을 보인다. | AN §2.12, iOS §2.12, D-02, D-20 |
| REQ-FDBK-011 | `401`은 토큰 갱신 후에도 실패하면 로그인 화면으로 이동한다. | iOS §2.12, AN §2.12 |
| REQ-FDBK-012 | 피드백 요청은 자동 재시도하지 않는다. | D-21 |
| REQ-FDBK-013 | 정지 회원도 피드백을 보낼 수 있고, 제출 횟수와 간격 제한은 두지 않는다. | FEEDBACK-001 |
| REQ-FDBK-014 | 피드백 화면이 보일 때 `screen_view(feedback)`를 보내고, 피드백 작성 중에는 푸시 탭 이동을 보류한다. | D-22, D-11 |
| REQ-FDBK-015 | 제출한 피드백을 앱에서 다시 조회·수정·삭제하는 화면은 없다. | FEEDBACK-003 |

## 상태

### 푸시 수신 설정 (항목별)

| 상태 | 조건 | 표시 | 전이 |
| --- | --- | --- | --- |
| 로딩 | 설정 탭 진입, 조회 중 | 스위치 비활성 | 성공 → 대기, 실패 → 로드 실패 |
| 로드 실패 | 조회 실패 | 스위치 비활성 + 토스트 | 설정 탭 재노출 → 로딩 |
| 대기 | 서버 값 반영됨 | 스위치 활성(켜짐/꺼짐) | 입력 → 저장 중(권한 정상) / 시스템 설정 이동(켜기 + 권한 꺼짐) |
| 저장 중 | 해당 항목 PATCH 진행 | 새 값 표시, 그 스위치 추가 입력 무시 | 204 → 대기, 실패 → 이전 값 복원 + 토스트 → 대기 |

### 피드백 화면

| 상태 | 조건 | 표시 | 전이 |
| --- | --- | --- | --- |
| 입력 전 | 공백 제거 후 0자 | "보내기" 비활성 | 입력 → 입력 중 |
| 입력 중 | 1자 이상 | "보내기" 활성, 카운터 | 보내기 → 전송 중(1000 초과면 검증 문구) |
| 전송 중 | 요청 진행 | "보내는 중...", 비활성 | 201 → 닫기 + 토스트, 실패 → 입력 중 + 오류 문구 |

## API 호출

### 푸시 수신 설정

| 시점 | 호출 | 요청 핵심 | 응답 핵심 |
| --- | --- | --- | --- |
| 설정 탭 진입 | `GET /notification-settings` | | `topicPushEnabled`, `moderationPushEnabled`, `aiReviewPushEnabled`(최초 모두 true) |
| 스위치 변경 | `PATCH /notification-settings` | 바꾼 항목의 Boolean 하나(나머지 생략). 값이 하나도 없으면 400 | 204 |

| 호출 | HTTP + errorCode | 동작 | 사용자 문구 |
| --- | --- | --- | --- |
| GET | 연결 실패·5xx·해석 불가·그 밖 | 스위치 비활성 | `settings.push.load-error` |
| GET·PATCH | 401 `UNAUTHORIZED`(갱신 후에도) | 로그인 화면 | 없음 |
| GET·PATCH | 401 `REAUTHENTICATION_REQUIRED` | 세션 삭제, 로그인 화면 | 없음 |
| PATCH | 연결 실패·타임아웃·5xx·그 밖 | 해당 항목만 복원 | `settings.push.save-error` |
| PATCH | 400 `BUSINESS_ERROR` | 클라이언트 버그(빈 요청). 복원 + 토스트 | `settings.push.save-error` |

`PATCH`는 멱등 요청이라 연결 실패·5xx에서 D-21대로 최대 2회 자동 재시도한 뒤 위 실패로 본다. 같은 항목의 요청은 직렬이라 마지막 요청의 값이 서버에 남는다.

### 피드백

`POST /feedbacks` `{content}` → 201 `{feedbackId, createdAt}`(응답 값은 사용하지 않는다).

| HTTP + errorCode | 동작 | 사용자 문구 |
| --- | --- | --- |
| 201 | 토스트, 화면 닫기 | `fdbk.success` |
| 400 `BUSINESS_ERROR` | 입력 유지 | `fdbk.error.invalid` |
| 401 `UNAUTHORIZED`(갱신 후에도) / `REAUTHENTICATION_REQUIRED` | 로그인 화면 | 없음 |
| 연결 실패·타임아웃 | 입력 유지, 재시도 없음 | "네트워크 연결을 확인해 주세요." |
| 5xx·해석 불가·그 밖 | 입력 유지 | `fdbk.error.generic` |

## 문구

| 키 | 문구 | 상황 |
| --- | --- | --- |
| settings.section.app | 앱 설정 | 섹션 제목. iOS·Android |
| settings.section.push | 푸시 알림 | 섹션 제목. Android |
| settings.section.account | 계정 | 섹션 제목 |
| settings.section.feedback | 피드백 | 섹션 제목. iOS |
| settings.section.info | 정보 및 약관 | 섹션 제목 |
| settings.row.feedback | 피드백 보내기 | 행 |
| settings.row.privacy | 개인정보처리방침 | 행 |
| settings.row.terms | 이용약관 | 행 |
| settings.row.version | 버전정보 | 행(값은 앱 버전) |
| settings.row.logout | 로그아웃 | 행 |
| settings.row.withdraw | 회원탈퇴 | 행 |
| settings.guest.login | 로그인 | 게스트 전용 버튼 |
| settings.push.topic | 오늘 주제 알림 | 스위치. iOS 문구 채택(Android는 "주제 알림"이라 무엇의 알림인지 불분명) |
| settings.push.moderation | 게시물 승인·반려 알림 | 스위치. iOS 문구 채택 |
| settings.push.ai-review | AI 피드백 완료 알림 | 스위치. iOS 문구 채택, D-03 용어 "AI 피드백" |
| settings.push.load-error | 알림 설정을 불러오지 못했어요. 다시 시도해 주세요. | 조회 실패 토스트. iOS 문구 채택(Android "푸시 알림 설정을 불러오지 못했어요."보다 다음 행동을 안내) |
| settings.push.save-error | 알림 설정을 저장하지 못했어요. 다시 시도해 주세요. | 저장 실패 토스트. iOS 문구 채택 |
| fdbk.title | 피드백 | 화면 제목 [추정: 기존 문서에 제목 문구 없음, 행 이름 재사용] |
| fdbk.intro.title | 찰칵을 사용하며\n느낀 점을 알려주세요. | 안내 제목. 기존 iOS 소스의 "찰캌"은 오타로 보고 "찰칵" 사용 |
| fdbk.intro.body | 서비스 이용 중 불편한 점이나 개선되었으면 하는 점을\n자유롭게 남겨주세요. | 안내 설명. Android(iOS에는 없음) |
| fdbk.field.label | 피드백 내용 | 입력 필드 라벨. Android |
| fdbk.field.placeholder | 내용을 입력해 주세요. | 플레이스홀더 |
| fdbk.send | 보내기 | 버튼 |
| fdbk.sending | 보내는 중... | 전송 중 버튼 |
| fdbk.success | 피드백을 보내주셔서 감사해요. | 성공 토스트 |
| fdbk.error.invalid | 피드백은 1자 이상 1000자 이하로 입력해 주세요. | 400, 1000자 초과 |
| fdbk.error.generic | 피드백을 보내지 못했어요. 다시 시도해 주세요. | 그 밖의 실패 |

로그아웃·탈퇴 확인 문구와 오류 문구는 [boot-auth.md](boot-auth.md), 게스트 토스트는 [navigation.md](navigation.md), 사인 카드 문구는 [onboarding-signature.md](onboarding-signature.md)를 따른다.

## 플랫폼별 허용 차이

- 시스템 알림 설정으로 이동하는 방법: iOS는 앱 설정 URL, Android는 앱 알림 설정 화면(`ACTION_APP_NOTIFICATION_SETTINGS`), Flutter·RN은 각 플러그인으로 같은 목적지를 연다.
- 스위치 모양, 설정 목록 스타일(iOS 그룹 목록, Android 머티리얼 목록, Web 폼)은 자유다.
- 확인 대화상자·문서 시트·토스트 모양은 자유다. 문구와 표시 시간(2.5초)은 같아야 한다.
- 키보드 처리, 입력 필드의 줄 수(여러 줄)는 자유다. 글자 수 규칙은 같아야 한다.
- Web은 기기 알림 권한 연동이 없다(REQ-SET-019).

## 범위 밖

- 앱 버전을 피드백과 함께 서버로 보내는 방법(Q-13).
- 알림 "모두 읽음" UI.
- 계정 정보(이메일 등) 표시와 프로필 편집(기존 두 앱 모두 없음).
- 게스트에게 약관·버전 행을 보이는 것(D-05가 "로그인" 버튼만 보인다고 정함).

## 확인 필요

1. 기기 알림 권한이 꺼져 있을 때 스위치를 켜는 동작의 세부. 기존 문서는 "시스템 알림 설정으로 이동한다"까지만 적는다. 임시 동작: 스위치와 서버 값은 바꾸지 않는다(REQ-SET-015). 권한 미결정 상태에서 켜면 시스템 권한 요청을 띄운다(REQ-SET-018). 이 둘은 [추정]이며, 켜는 `PATCH`를 먼저 보내고 이동하는 방식이 기존 구현일 수 있다.
2. 설정 섹션 구성은 iOS(별도 "피드백" 섹션)와 Android(피드백 보내기를 "정보 및 약관" 아래에도 나열)가 다르다. 임시: iOS 구성(피드백 섹션 + 정보 및 약관 섹션).
3. 피드백: 1000자 초과 입력을 막을지 보내기 시점에 검증할지(iOS는 검증 문구, Android는 서버 400 문구만 있음), 카운터 표시 형식, 성공 뒤 화면 닫기는 기존 문서에 명시가 없다(임시: 위 요구사항의 [추정]).
4. 버전 문자열 표시 형식("1.1.1" 또는 "v1.1.1"). 임시: 접두 없이 버전 문자열만.
5. 설정 조회 실패 시 스위치를 어떻게 보일지(임시: 비활성).
