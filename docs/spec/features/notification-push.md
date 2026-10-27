# 알림함과 푸시 (NOTI, PUSH)

알림함은 본인 알림을 최신순 20개씩 보여 주고, 항목을 누르면 읽음 처리 후 유형별 화면으로 이동한다. 홈 상단 알림 버튼에는 미읽음 점을 표시한다. 푸시는 로그인 후 FCM 토큰을 서버에 등록해 받고, 알림 권한은 인증 사용자가 메인에 처음 들어올 때 한 번만 요청한다. 푸시를 누르면 `type`별 목적지로 이동하되 로그아웃 상태는 버리고 작성 중 화면에서는 보류한다. 모든 날짜·시각은 KST "M월 d일 HH:mm"로 표시한다. 푸시 수신 설정 토글은 [settings-feedback.md](settings-feedback.md)가 다룬다.

- 관련 규칙: [NOTIFICATION-002~006, 015](../../reference/business-rules/rules/notification.md), 가이드 [notification-inbox](../../reference/business-rules/guides/notification-inbox.md), [notification-push-contract](../../reference/business-rules/guides/notification-push-contract.md), [push-device-registration](../../reference/business-rules/guides/push-device-registration.md)
- 관련 결정: [D-09](../decisions.md#d-09-알림-시각-표시), [D-10](../decisions.md#d-10-알림-미읽음-표시), [D-11](../decisions.md#d-11-푸시-탭-처리), [D-20](../decisions.md#d-20-오류-화면과-토스트), [D-21](../decisions.md#d-21-네트워크-타임아웃), [D-24](../decisions.md#d-24-알림-읽음-404-문구)
- 관련 열린 질문: [Q-04, Q-11, Q-12, Q-16](../open-questions.md)
- 근거 약어: iOS = [legacy-ios](../../reference/legacy-ios.md), AN = [legacy-android](../../reference/legacy-android.md), API = [api-contract](../../reference/api-contract.md).

## 화면

### 알림함 목록

- 진입 조건: 인증 사용자가 홈 상단 알림 버튼을 누를 때, 또는 푸시 폴백(알 수 없는 type 등). 게스트는 진입하지 못한다([navigation.md](navigation.md) REQ-NAV-017).
- 구성 요소: 제목, 알림 행 `notification-item-{id}`(썸네일, 제목, 본문, 시각, 미읽음 표시), 당겨서 새로고침, 로딩 `notification-loading`, 빈 상태 `notification-empty`, 오류 `notification-error`와 `retry-button`.
- 사용자 동작: 행 탭(읽음 처리 후 이동), 당겨서 새로고침, 아래로 스크롤해 다음 페이지, 뒤로.

### 알림 상세

- 진입 조건: `POST_REJECTED`, `NOTICE` 알림 행 탭 또는 푸시 탭.
- 구성 요소: 제목 "알림 상세", 알림 제목, 본문, 원본 사진(있을 때), "반려 사유" 섹션(있을 때), 반려 알림의 "알림함으로" 버튼 `notification-detail-to-inbox-button`. "새로 올리기" 버튼은 없다.
- 사용자 동작: 보기, "알림함으로", 뒤로.

### 홈 알림 버튼의 미읽음 점

- 위치: 홈 상단 알림 버튼 `home-notification-button` 위의 점 `home-notification-unread-dot`. 버튼의 나머지는 home.md가 정의한다.

### 알림 권한 요청

- 진입 조건: 인증 사용자가 메인에 처음 들어온 직후(앱 설치당 한 번). 운영체제 권한 대화상자만 사용한다.

### 포그라운드 알림

- 앱이 화면에 떠 있을 때 도착한 푸시를 시스템 배너(또는 앱이 만든 알림)로 보여 준다.

## 요구사항

### NOTI: 알림함 목록

| ID | 요구사항 | 근거 |
| --- | --- | --- |
| REQ-NOTI-001 | 알림함에 들어오면 `GET /notifications?page=1&pageSize=20`을 불러오고 응답 순서(최신순)대로 보여 준다. | NOTIFICATION-002, iOS §2.10, AN §2.13 |
| REQ-NOTI-002 | 첫 로딩 동안 "알림을 불러오는 중이에요" 로딩 상태를 보인다. | iOS §2.10 |
| REQ-NOTI-003 | 각 행은 알림 제목, 본문, 시각, 썸네일(`thumbnailImageUrl`이 있을 때만)을 보이고, 읽지 않은 알림(`readAt`이 null)에는 미읽음 표시를 한다. | NOTIFICATION-002, API §1.5 |
| REQ-NOTI-004 | 제목·본문은 서버가 준 문자열을 그대로 보여 주며 문구로 알림 종류를 판단하지 않는다. | notification-inbox 가이드, API §7.1 |
| REQ-NOTI-005 | 마지막 4개 항목 근처까지 스크롤하면 `hasNext`가 true일 때 다음 페이지(`page+1`)를 불러와 목록 뒤에 붙인다. | AN §2.13 |
| REQ-NOTI-006 | 다음 페이지 요청이 진행 중이거나 `hasNext`가 false면 추가 요청을 보내지 않는다. | AN §2.13 [추정: 중복 방지] |
| REQ-NOTI-007 | 오프셋 페이징 중 같은 `id`가 다시 오면 중복해서 보여 주지 않는다. [추정] | API §1 (오프셋 방식) |
| REQ-NOTI-008 | 알림이 하나도 없으면 "아직 알림이 없어요"와 "승인이나 반려 소식이 생기면 여기에 모아둘게요"를 보인다. | iOS §2.10, AN §2.13 |
| REQ-NOTI-009 | 콘텐츠가 없는 상태에서 첫 로딩이 실패하면 오류 화면(연결 오류는 "네트워크 연결을 확인해 주세요.", 그 밖은 "알림을 불러오지 못했어요")과 "다시 시도" 버튼을 보인다. | iOS §2.10, AN §2.13, D-20 |
| REQ-NOTI-010 | 당겨서 새로고침은 첫 페이지를 다시 불러와 목록을 교체하고, 실패하면 기존 목록을 유지한 채 토스트 `noti.inbox.refresh-error`를 보인다. | iOS §2.10, D-20 |
| REQ-NOTI-011 | 다음 페이지 요청이 실패하면 기존 목록을 유지한 채 토스트 `noti.inbox.more-error`를 보이고, 사용자가 다시 스크롤하면 같은 페이지를 다시 요청한다. | iOS §2.10, D-20 |
| REQ-NOTI-012 | 알림함이 다시 보일 때(상세·피드에서 돌아올 때 포함) 읽음 상태가 반영되도록 첫 페이지를 조용히 다시 불러오며, 실패해도 기존 목록을 유지하고 토스트를 띄우지 않는다. [추정] | NOTIFICATION-003 |
| REQ-NOTI-013 | "모두 읽음" 처리 UI는 만들지 않는다(`PATCH /notifications/read-all`은 호출하지 않는다). | 00-overview §2, iOS §5.1-7 |
| REQ-NOTI-014 | 알림함이 보일 때 `screen_view(notifications)`, 알림 상세가 보일 때 `screen_view(notification_detail)`을 보낸다. | D-22 |

### NOTI: 행 탭과 읽음 처리

| ID | 요구사항 | 근거 |
| --- | --- | --- |
| REQ-NOTI-015 | 알림 행을 누르면 목적지가 정해지는 알림(REQ-PUSH-023~025의 표)은 `PATCH /notifications/{id}/read`를 먼저 보내고 결과에 따라 이동한다. | D-11, iOS §1.4, AN §1.5 |
| REQ-NOTI-016 | 읽음 요청이 성공(204)하면 해당 행을 읽음으로 바꾸고 목적지로 이동한다. | D-11 |
| REQ-NOTI-017 | 읽음 요청이 연결 실패·타임아웃이면 토스트 `noti.read.error.network`를 보이고 그래도 목적지로 이동하며 행의 미읽음 표시는 유지한다. | D-11, AN §2.13 |
| REQ-NOTI-018 | 읽음 요청이 404이면 이동하지 않고 토스트 `noti.gone`을 보인 뒤 알림함 목록과 미읽음 상태를 다시 불러온다(항목은 사라질 수 있다). | D-11, D-24 |
| REQ-NOTI-019 | 읽음 요청이 그 밖의 오류(5xx 등)이면 404와 같게 처리한다(이동하지 않고 `noti.gone`, 목록·미읽음 갱신). | D-11 |
| REQ-NOTI-020 | 알림 행 탭 중에는 같은 행의 중복 탭을 무시해 읽음 요청과 이동이 한 번만 일어난다. | AN §1.4 [추정] |
| REQ-NOTI-021 | `type`이 알 수 없는 값이거나 필요한 필드(`sourceId`가 UUID 형식)가 없는 행은 목록에 보이되 탭해도 이동·읽음 요청을 하지 않는다. | D-11, API §1.5 |
| REQ-NOTI-022 | `type`이 `TOPIC` 또는 `REMINDER`인 행이 오면(Q-11) 목록에 보이고, 탭하면 읽음 요청 없이 홈으로 이동한다. | Q-11, D-11 |

### NOTI: 알림 상세

| ID | 요구사항 | 근거 |
| --- | --- | --- |
| REQ-NOTI-023 | 알림 상세는 `GET /notifications/{id}`로 제목, 본문, 원본 사진, 반려 사유를 불러오며, 조회만으로는 읽음 처리하지 않고 상세 화면에서 읽음 요청을 따로 보내지 않는다(읽음은 이동 전 단계에서 처리). | NOTIFICATION-003, D-11, API §4.3 |
| REQ-NOTI-024 | `POST_REJECTED`는 원본 사진과 "반려 사유" 섹션을 보이고, 값이 없는 필드(`originalImageUrl`, `rejectionReason`이 null)는 해당 영역을 숨긴다. | NOTIFICATION-002, iOS §2.10 |
| REQ-NOTI-025 | `NOTICE`는 제목과 본문만 보이고 사진·반려 사유 영역은 없다. | notification-inbox 가이드 |
| REQ-NOTI-026 | 반려 알림 상세에는 "알림함으로" 버튼을 보이고, 누르면 알림함 목록으로 이동한다(이미 알림함이 아래에 있으면 상세만 닫는다). "새로 올리기" 버튼은 두지 않는다. | NOTIFICATION-002, AN §2.13 |
| REQ-NOTI-027 | 상세가 로딩 중이면 로딩 표시, 404이면 `noti.gone`을 보이고 알림함·미읽음을 새로고침하며, 연결 실패는 "네트워크 연결을 확인해 주세요."와 "다시 시도", 그 밖의 실패는 "알림을 불러오지 못했어요"와 "다시 시도"를 보인다. | iOS §2.10, AN §2.13, D-24 |

### NOTI: 미읽음 표시

| ID | 요구사항 | 근거 |
| --- | --- | --- |
| REQ-NOTI-028 | 홈 상단 알림 버튼에 `GET /notifications/unread-status`의 `hasUnread`가 true일 때 미읽음 점을 표시하고 false일 때 숨긴다. | D-10 |
| REQ-NOTI-029 | 미읽음 상태는 홈이 보일 때, 앱이 포그라운드로 올 때, 알림함에서 돌아올 때, 푸시를 받았을 때, 읽음 요청이 성공했을 때 다시 조회한다. | D-10, D-11 |
| REQ-NOTI-030 | 게스트는 미읽음 상태를 조회하지 않고 점을 표시하지 않는다. | D-10 |
| REQ-NOTI-031 | 미읽음 조회가 실패하면 이전 표시를 유지하고 오류를 보이지 않는다. [추정] | D-10 |
| REQ-NOTI-032 | 로그아웃·탈퇴 시 미읽음 점 상태를 초기화한다. | D-16 [추정] |

### NOTI: 시각 표시

| ID | 요구사항 | 근거 |
| --- | --- | --- |
| REQ-NOTI-033 | 알림 시각(`createdAt`)은 기기 시간대와 관계없이 KST로 변환해 "M월 d일 HH:mm"(월·일은 0 없이, 시·분은 24시간제 두 자리)로 표시한다. 예: `2026-10-20T05:00:00Z` → "10월 20일 14:00". | D-09, AN §2.13 |
| REQ-NOTI-034 | `createdAt`은 소수 초가 있거나 없는 UTC ISO-8601 모두 파싱한다. | iOS §2.13 |

### PUSH: 알림 권한

| ID | 요구사항 | 근거 |
| --- | --- | --- |
| REQ-PUSH-001 | 알림 권한은 인증 사용자가 메인에 처음 들어온 직후 한 번만 요청하고, 요청을 띄운 시점에 "요청함" 표시를 로컬에 저장해 다시 요청하지 않는다. | iOS §2.10, AN §1.3-6 |
| REQ-PUSH-002 | 게스트, 로그인 화면, 가입(약관·사인) 화면에서는 권한을 요청하지 않는다. | iOS §2.10 |
| REQ-PUSH-003 | 요청은 운영체제 기본 권한 대화상자(iOS: 알림·배지·소리, Android 13 이상: `POST_NOTIFICATIONS`)로만 하며, Android 12 이하와 Web은 요청하지 않는다. | iOS §2.10, AN §1.3-6, Q-04 |
| REQ-PUSH-004 | 권한이 이미 허용 또는 거부로 결정된 상태이면 대화상자 없이 "요청함" 표시만 저장한다. [임시 동작: 확인 필요 1번] | AN §1.3-6 |
| REQ-PUSH-005 | 권한 결과(허용·거부)에 따라 서버 푸시 수신 설정(`PATCH /notification-settings`)을 바꾸지 않는다. [임시 동작: 확인 필요 1번] | AN §2.11, API §7.1 |
| REQ-PUSH-006 | 권한 요청 호출 자체가 실패하면 토스트 `noti.perm.error`를 보이고 "요청함" 표시는 저장한다. | iOS §2.10 |

### PUSH: 기기 등록

| ID | 요구사항 | 근거 |
| --- | --- | --- |
| REQ-PUSH-007 | 기기 등록은 `PUT /push-devices/current`에 `{fcmToken}`만 보내며(Bearer 필요, 기기 ID·플랫폼은 보내지 않음) 성공은 204다. | NOTIFICATION-005, API §7.2 |
| REQ-PUSH-008 | 등록은 로그인 성공·가입 완료 직후, FCM 토큰이 변경될 때, 인증된 상태로 앱을 시작할 때, 앱이 포그라운드로 올 때 시도한다(FCM 토큰이 아직 없으면 토큰이 준비된 뒤). | NOTIFICATION-005, AN §1.6, API §7.2 |
| REQ-PUSH-009 | 같은 프로세스에서 이미 성공한 (userId, FCM 토큰) 쌍은 다시 보내지 않고, 등록 요청은 동시에 하나만 실행한다. | AN §1.6 |
| REQ-PUSH-010 | 액세스 토큰(JWT)에 `session_id` 클레임이 없으면 등록 전에 `POST /auth/refresh`로 토큰을 갱신하고 새 토큰으로 등록한다. | push-device-registration 가이드, AN §1.6 |
| REQ-PUSH-011 | 등록이 `401 REAUTHENTICATION_REQUIRED`이면 토큰을 한 번 갱신한 뒤 한 번만 다시 등록하고, 갱신도 `REAUTHENTICATION_REQUIRED`이면 세션을 지우고 로그인 화면으로 이동한다. | iOS §2.10, API §2.3 |
| REQ-PUSH-012 | 등록이 연결 실패·5xx·그 밖의 이유로 실패해도 로그인 상태를 유지하고 사용자에게 오류를 보이지 않으며, 다음 시도는 다음 트리거(앱 시작, 포그라운드, 토큰 변경)에 한다. | iOS §2.10, API §7.2-5 |
| REQ-PUSH-013 | 게스트와 로그아웃 상태에서는 등록을 시도하지 않고, 정지 회원은 등록한다. | API §7.2-8, USER-002 |
| REQ-PUSH-014 | OS 알림 권한이 거부 상태여도 토큰 등록은 시도한다. [추정] | API §7.2-9 |
| REQ-PUSH-015 | 로그아웃·탈퇴 때 기기 해제 API를 부르지 않고(서버가 정리), 로그아웃 후 다시 로그인하면 새로 등록한다. 등록 중복 제거 기록은 로그아웃 때 비운다. | D-16, API §7.2-7 |
| REQ-PUSH-016 | 같은 기기에서 다른 계정으로 로그인하면 새 계정으로 다시 등록한다(서버는 같은 토큰의 이전 연결을 지운다). | API §7.2-6 |
| REQ-PUSH-017 | Web은 푸시 수신과 기기 등록을 하지 않는다(알림함은 제공한다). | Q-04 |
| REQ-PUSH-018 | FCM 토큰 원문은 로그·분석 이벤트·화면에 출력하지 않는다. | 비밀값 원칙 |

### PUSH: 포그라운드 표시

| ID | 요구사항 | 근거 |
| --- | --- | --- |
| REQ-PUSH-019 | 앱이 포그라운드일 때 푸시가 도착하면 OS 알림 권한이 허용된 경우에만 서버가 준 제목·본문으로 알림을 표시하고, 권한이 없으면 아무것도 표시하지 않는다. 본문이 비어 있으면 "새 알림이 있어요. 알림함에서 확인해 주세요."를 쓴다. | AN §1.5, notification-push-contract |
| REQ-PUSH-020 | 푸시를 받으면(포그라운드·백그라운드 모두 앱이 처리할 수 있는 시점에) 미읽음 상태를 다시 조회한다. | D-10 |

### PUSH: 푸시 탭 이동

| ID | 요구사항 | 근거 |
| --- | --- | --- |
| REQ-PUSH-021 | 푸시 탭은 `data`의 `type`, `notificationId`, `sourceType`, `sourceId`로 목적지를 정하며 `eventId`와 알림 제목·본문은 분기에 쓰지 않는다. | API §7.1, D-11 |
| REQ-PUSH-022 | `TOPIC`은 홈으로 이동해 맨 위로 스크롤하고 새로고침하며(이미 홈이면 화면을 더 쌓지 않음), `REMINDER`는 홈으로 이동한다. 둘 다 읽음 요청을 보내지 않는다. | D-11, iOS §1.4 |
| REQ-PUSH-023 | `POST_APPROVED`는 읽음 처리 후 `sourceId` 게시물 상세(내 게시물)로 이동한다. | D-11, API §7.1 |
| REQ-PUSH-024 | `AI_REVIEW_COMPLETED`·`AI_REVIEW_FAILED`는 읽음 처리 후 `sourceId` 게시물 상세로 이동하고 AI 피드백 시트를 최신 `GET` 결과 기준으로 한 번 자동으로 연다. | D-11, AN §2.9 |
| REQ-PUSH-025 | `POST_REJECTED`·`NOTICE`는 읽음 처리 후 `notificationId`로 알림 상세를 연다. | D-11, API §7.1 |
| REQ-PUSH-026 | 알 수 없는 `type`, 필수 필드 누락, `notificationId`·`sourceId`가 UUID 형식이 아님, AI 리뷰 type인데 `sourceType`이 `POST`가 아님이면 읽음 요청 없이 알림함 목록으로 이동한다. | D-11, iOS §1.4 |
| REQ-PUSH-027 | 푸시 탭의 읽음 요청 결과는 알림함 행 탭과 같게 처리한다: 성공이면 이동, 연결 실패면 `noti.read.error.network` 토스트 후 이동, 404와 그 밖의 오류면 `noti.gone` 토스트와 목록·미읽음 새로고침 후 이동하지 않는다. | D-11, D-24 |
| REQ-PUSH-028 | 다른 계정에 온 푸시를 눌러 읽음 요청이 404가 되는 경우도 REQ-PUSH-027의 404 처리를 따르며, 접근할 수 없는 알림 내용을 임의로 보여 주지 않는다. | API §7.1, notification-inbox 가이드 |
| REQ-PUSH-029 | 같은 게시물 상세가 이미 열려 있으면 새로 쌓지 않고 교체한다. | D-11 |
| REQ-PUSH-030 | 로그아웃·게스트 상태의 푸시 탭은 이동 없이 버리고 앱만 열린다(로그인 뒤 목적지 복귀는 하지 않는다). | D-11, Q-12 |
| REQ-PUSH-031 | 로그인·약관·사인 화면이나 업로드·피드백 작성 화면이 열려 있으면 푸시 탭 처리를 보류했다가 그 화면을 벗어난 뒤 처리하고, 콜드 스타트 탭은 메인이 준비된 뒤 처리한다. | D-11, navigation.md REQ-NAV-041~043 |
| REQ-PUSH-032 | 백그라운드·종료 상태의 푸시 탭 페이로드는 플랫폼 방식(iOS `userInfo` 최상위 키, Android 인텐트 extra와 `google.message_id` 판별)으로 받아 같은 라우팅에 넘긴다. | iOS §1.4, AN §1.5 |

## 상태

### 알림함 목록 상태

| 상태 | 조건 | 표시 | 전이 |
| --- | --- | --- | --- |
| 로딩 | 첫 진입, 콘텐츠 없음 | "알림을 불러오는 중이에요" | 성공(1건 이상) → 콘텐츠, 성공(0건) → 빈, 실패 → 오류 |
| 콘텐츠 | 1건 이상 | 알림 행들 | 당겨서 새로고침 → 콘텐츠 유지 + 갱신 중; 끝 근처 → 다음 페이지 요청 |
| 다음 페이지 로딩 | `hasNext` true, 끝 근처 | 목록 끝 진행 표시 | 성공 → 콘텐츠, 실패 → 콘텐츠 + 토스트 |
| 빈 | 0건 | "아직 알림이 없어요" + 설명 | 당겨서 새로고침 |
| 오류 | 콘텐츠 없이 실패 | 오류 문구 + "다시 시도" | 다시 시도 → 로딩 |
| 행 처리 중 | 행 탭 → 읽음 요청 진행 | 같은 행 중복 탭 무시 | 성공/네트워크 실패 → 이동, 404/그 밖 → 토스트 + 새로고침 |

### 알림 상세 상태

| 상태 | 조건 | 표시 | 전이 |
| --- | --- | --- | --- |
| 로딩 | 진입 | 로딩 표시 | 성공 → 콘텐츠, 404 → 없음, 실패 → 오류 |
| 콘텐츠 | 성공 | 제목, 본문, 사진?, 사유? | |
| 없음 | 404 | `noti.gone` | 뒤로 |
| 오류 | 연결 실패·그 밖 | 오류 문구 + "다시 시도" | 다시 시도 → 로딩 |

### 푸시 탭 처리 상태

| 상태 | 조건 | 전이 |
| --- | --- | --- |
| 수신 대기 | 탭 이벤트 도착 | 로그아웃·게스트 → 폐기; 로그인·가입·업로드·피드백 화면 → 보류; 메인 미준비 → 보류; 그 외 → 처리 |
| 보류 | 위 조건 | 조건이 풀리면 처리, 프로세스 복원에도 유지 |
| 처리(읽음 요청) | notificationId 필요 type | 성공/네트워크 실패 → 이동; 404/그 밖 → 토스트 + 새로고침 |
| 이동 | 목적지 결정 | 같은 상세 열려 있으면 교체 |

### 권한 요청 상태

| 상태 | 조건 | 전이 |
| --- | --- | --- |
| 미요청 | "요청함" 표시 없음, 인증 사용자 메인 첫 진입 | 요청(미결정이면 OS 대화상자) → 요청함 |
| 요청함 | 표시 저장 | 이후 다시 요청하지 않음(OS 설정 변경은 설정 화면에서 안내, settings-feedback.md) |

## API 호출

### 호출 목록

| 순서·시점 | 호출 | 요청 핵심 | 응답 핵심 |
| --- | --- | --- | --- |
| 알림함 진입·새로고침 | `GET /notifications` | `page`(1부터), `pageSize=20` | `currentPage`, `pageSize`, `hasNext`, `notifications[{id, type, sourceType?, sourceId?, title, body, thumbnailImageUrl?, readAt?, createdAt}]` |
| 알림 상세 | `GET /notifications/{id}` | | `id`, `type`, `title`, `body`, `originalImageUrl?`, `rejectionReason?`, `readAt`, `createdAt` |
| 행·푸시 탭 | `PATCH /notifications/{id}/read` | 본문 없음 | 204 |
| 미읽음 점 | `GET /notifications/unread-status` | | `hasUnread` |
| 기기 등록 | `PUT /push-devices/current` | `{fcmToken}` | 204 |
| 토큰 갱신(필요 시) | `POST /auth/refresh` | `{refreshToken}` | 새 토큰 쌍 |

### 실패별 처리

| 호출 | HTTP + errorCode | 동작 | 사용자 문구 |
| --- | --- | --- | --- |
| 목록 | 연결 실패·타임아웃(콘텐츠 없음) | 오류 화면 | "네트워크 연결을 확인해 주세요." + 다시 시도 |
| 목록 | 연결 실패(콘텐츠 있음, 새로고침) | 목록 유지 | `noti.inbox.refresh-error` |
| 목록 | 연결 실패(다음 페이지) | 목록 유지 | `noti.inbox.more-error` |
| 목록 | 5xx·해석 불가·그 밖(콘텐츠 없음) | 오류 화면 | `noti.inbox.error` + 다시 시도 |
| 목록·상세·읽음·미읽음 | 401 `UNAUTHORIZED`(갱신 후에도) | 로그인 화면 | 없음 |
| 목록·상세·읽음·미읽음 | 401 `REAUTHENTICATION_REQUIRED` | 세션 삭제, 로그인 화면 | 없음 |
| 상세 | 404 `BUSINESS_ERROR` | 없음 상태, 알림함·미읽음 새로고침 | `noti.gone` |
| 상세 | 연결 실패 / 그 밖 | 오류 상태 | "네트워크 연결을 확인해 주세요." / `noti.detail.error` + 다시 시도 |
| 읽음 | 204 | 이동 | 없음 |
| 읽음 | 연결 실패·타임아웃 | 토스트 후 이동 | `noti.read.error.network` |
| 읽음 | 404 `BUSINESS_ERROR` | 이동 안 함, 목록·미읽음 새로고침 | `noti.gone` |
| 읽음 | 5xx·그 밖 | 404와 같음 | `noti.gone` |
| 미읽음 | 모든 실패 | 이전 표시 유지 | 없음 |
| 기기 등록 | 401 `REAUTHENTICATION_REQUIRED` | 갱신 1회 후 재등록 1회, 또 실패하면 로그인 | 없음 |
| 기기 등록 | 400 `BUSINESS_ERROR`(빈 토큰) | 클라이언트 버그로 보고 로그만 남기고 중단 | 없음 |
| 기기 등록 | 연결 실패·5xx·그 밖 | 로그인 유지, 다음 트리거에 재시도 | 없음 |

연결 실패·5xx에서 멱등 요청(`GET`, `PUT`, `PATCH`)은 D-21대로 0.5초, 1초 간격으로 최대 2회 자동 재시도한 뒤 위 표의 실패로 본다.

### 푸시 `data` 페이로드(받는 쪽 계약)

모든 값은 문자열이다. `type`: `POST_APPROVED`, `POST_REJECTED`, `AI_REVIEW_COMPLETED`, `AI_REVIEW_FAILED`, `NOTICE`, `TOPIC`, `REMINDER`. `TOPIC`·`REMINDER`에는 `notificationId`가 없다. 목적지 표는 REQ-PUSH-022~026이다.

## 문구

서버가 알림 목록·푸시로 주는 제목·본문(예: "AI 피드백이 도착했어요")은 클라이언트 문구가 아니다.

| 키 | 문구 | 상황 |
| --- | --- | --- |
| noti.inbox.title | 알림 | 알림함 화면 제목 [추정: 기존 문서에 제목 문구 없음] |
| noti.inbox.loading | 알림을 불러오는 중이에요 | 첫 로딩. iOS |
| noti.inbox.empty.title | 아직 알림이 없어요 | 빈 상태 제목. iOS(Android는 끝에 마침표, 마침표 없는 쪽 채택) |
| noti.inbox.empty.body | 승인이나 반려 소식이 생기면 여기에 모아둘게요 | 빈 상태 설명. iOS 문구(Android에는 없음) |
| noti.inbox.error | 알림을 불러오지 못했어요 | 목록·상세 일반 실패. iOS·Android 동일 |
| noti.inbox.retry | 다시 시도 | 오류 화면 버튼 |
| noti.inbox.refresh-error | 알림을 새로고침하지 못했어요. 다시 시도해 주세요. | 새로고침 실패 토스트. iOS |
| noti.inbox.more-error | 다음 알림을 불러오지 못했어요. 다시 시도해 주세요. | 다음 페이지 실패 토스트. iOS |
| noti.network | 네트워크 연결을 확인해 주세요. | 연결 실패 오류 화면(D-20 통일 문구) |
| noti.read.error.network | 읽음 상태를 저장하지 못했어요. 네트워크 연결을 확인해 주세요. | 읽음 요청 연결 실패. D-11이 정한 Android 문구(iOS "읽음 처리하지 못했어요. 다시 열어 주세요." 대신) |
| noti.gone | 더 이상 확인할 수 없는 알림이에요. | 읽음·상세 404 및 그 밖의 읽음 실패. D-11, D-24 (iOS 문구에 마침표를 붙임) |
| noti.detail.title | 알림 상세 | 상세 화면 제목. Android |
| noti.detail.reason | 반려 사유 | 반려 사유 섹션. iOS |
| noti.detail.to-inbox | 알림함으로 | 반려 알림 상세 버튼. Android |
| noti.detail.error | 알림을 불러오지 못했어요 | 상세 일반 실패 |
| noti.perm.error | 알림 권한을 요청하지 못했어요. 기기 설정에서 확인해 주세요. | 권한 요청 호출 실패. iOS |
| push.default.body | 새 알림이 있어요. 알림함에서 확인해 주세요. | 포그라운드 알림 기본 본문. Android |
| push.channel.name | 게시물 검수 알림 | Android 알림 채널 이름(채널 ID `moderation_push`). Android 전용 |

## 플랫폼별 허용 차이

- 알림 권한: iOS는 `UNUserNotificationCenter` 요청, Android 13 이상은 `POST_NOTIFICATIONS` 런타임 권한, Android 12 이하는 요청 없음, Web은 푸시 자체가 없다. 요청 시점과 1회 제한은 같아야 한다.
- iOS: APNs 토큰을 Firebase에 수동 전달하고(시뮬레이터는 sandbox 타입), `willPresent`에서 포그라운드 표시를 결정한다. Android: 앱이 포그라운드 알림을 직접 만들고 채널을 쓴다. Flutter·RN은 각 메시징 플러그인이 위를 감싼다. 관찰되는 동작(표시 조건, 탭 이동)은 같아야 한다.
- 알림함 목록의 행 모양, 당겨서 새로고침 표시, 미읽음 점 모양(점, 굵은 글씨 등)은 자유다.
- 토스트·스낵바 구분은 자유다(표시 시간 2.5초).
- 알림 상세의 사진 확대 같은 부가 상호작용은 자유다.

## 범위 밖

- 알림 "모두 읽음" UI(두 앱 모두 UI 미연결).
- Web 푸시 수신·기기 등록(Q-04).
- 로그아웃 상태에서 푸시를 눌렀을 때 로그인 후 목적지 복귀(Q-12, D-11이 버리기로 정함).
- 레거시 로컬 일일 리마인더 정리 코드(iOS·Android 전용, 새 앱에는 없음).
- 푸시 서버 발송 규칙(NOTIFICATION-007~016).

## 확인 필요

1. 알림 권한 요청 뒤 서버 수신 설정 처리가 두 앱에서 다르다. iOS는 최초 요청 결과로 세 설정을 `PATCH`하고 그 밖의 경우 앱 안내 대화상자("알림을 허용하시겠어요?" / 본문 "오늘 주제와 게시물 승인 반려 소식을 알려드려요." / 거부·허용)를 거치지만, Android는 `PATCH` 없이 권한만 요청한다. 규칙이 서버 설정과 OS 권한을 별개로 정하므로(NOTIFICATION-006) 임시 동작은 Android 방식(OS 대화상자만, `PATCH` 없음, 이미 결정된 상태면 요청 생략)이다.
2. 포그라운드 푸시 표시 정책: 규칙은 AI 피드백 화면을 보는 중에는 "생략할 수 있다"고만 한다. 임시 동작은 모든 type을 생략 없이 표시한다.
3. 알림함 행 중 이미 읽은 알림(`readAt != null`)을 누를 때 읽음 요청을 다시 보낼지. 임시 동작: 서버가 멱등이므로 항상 보낸다.
4. 알림함에서 `TOPIC`·`REMINDER` 행(Q-11)을 눌렀을 때 읽음 요청을 보낼지. 임시 동작: 보내지 않는다(푸시 규칙과 같음).
5. 알림함 화면 제목, 알림 상세에서 시각을 보일지, 푸시를 받았을 때 열려 있는 알림함을 자동 새로고침할지는 기존 문서에 없다(제목은 [추정] "알림", 나머지는 하지 않음).
6. Android 알림 채널 이름 "게시물 검수 알림"은 기존 앱 이름이다. 지금은 주제·AI 피드백·공지도 같은 채널로 오므로 이름을 유지할지 정해야 한다(임시: 유지).
