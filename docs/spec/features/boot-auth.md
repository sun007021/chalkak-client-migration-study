# 앱 시작과 인증 (BOOT, AUTH)

앱을 켜면 스플래시 → 강제 업데이트 게이트 → 인증 게이트 순서로 목적지(메인, 로그인)를 정한다. 로그인은 카카오만 구현하고(Apple·Google은 보류), 로그인 없이 둘러보는 게스트 모드가 있다. 이 문서는 카카오 로그인(nonce 생성·해시 포함), 게스트, 토큰 저장·갱신 정책, 로그아웃·탈퇴, 정지 회원 처리를 다룬다. 가입 화면(약관·사인)은 [onboarding-signature.md](onboarding-signature.md), 401 갱신의 네트워크 쪽 동작은 [common-infra.md](common-infra.md), 푸시 기기 등록은 [notification-push.md](notification-push.md)가 소유한다.

- 관련 규칙: [USER-001~006](../../reference/business-rules/rules/user.md), [NOTIFICATION-005](../../reference/business-rules/rules/notification.md#notification-005-현재-로그인-기기-등록해제)(로그아웃·탈퇴 시 기기 정리는 서버가 한다)
- 관련 결정: [D-05](../decisions.md#d-05-게스트-제한), [D-08](../decisions.md#d-08-정지banned-회원), [D-15](../decisions.md#d-15-강제-업데이트), [D-16](../decisions.md#d-16-로그아웃탈퇴), [D-17](../decisions.md#d-17-토큰-저장갱신), [D-20](../decisions.md#d-20-오류-화면과-토스트), [D-21](../decisions.md#d-21-네트워크-타임아웃)
- 관련 열린 질문: [Q-02, Q-03, Q-05, Q-07, Q-09, Q-15](../open-questions.md)
- 근거 약어: iOS = [legacy-ios](../../reference/legacy-ios.md), AN = [legacy-android](../../reference/legacy-android.md), API = [api-contract](../../reference/api-contract.md). 다섯 클라이언트 공통 상수는 [00-overview §6](../00-overview.md#6-다섯-클라이언트-공통-상수).

## 화면

### 스플래시

- 진입 조건: 프로세스 시작(콜드 스타트).
- 구성 요소: 앱 로고(플랫폼 기본 스플래시 사용 가능). 사용자 입력 없음.
- 동작: 강제 업데이트 확인과 홈 프리로드가 끝나거나 `SPLASH_PRELOAD_MAX`(700ms)가 지나면 사라진다.

### 강제 업데이트 다이얼로그

- 진입 조건: 강제 업데이트 게이트가 "업데이트 필요"로 판정했을 때(Web 제외).
- 구성 요소: 제목(`boot.update.title`), 본문(`boot.update.body`), 버튼 `update-button`("업데이트").
- 동작: 닫을 수 없다(바깥 탭, 뒤로가기 무효). 버튼은 스토어(iOS 계열) 또는 Play 즉시 업데이트 흐름(Android 계열)을 연다.

### 로그인

- 진입 조건: 인증 게이트가 "세션 없음"으로 판정, 재인증 필요(`REAUTHENTICATION_REQUIRED`), 로그아웃·탈퇴 완료, 설정의 게스트 "로그인" 버튼.
- 구성 요소: 태그라인(`auth.login.tagline`), 카카오 버튼 `kakao-login-button`, 게스트 링크 `guest-browse-button`. Apple·Google 버튼은 만들지 않는다.
- 사용자 동작: 카카오 버튼 → 카카오 인증 → 서버 로그인. 게스트 링크 → 게스트 플래그 저장 후 메인(홈).
- 진행 중에는 두 버튼을 비활성화하고 진행 표시를 보인다.

## 요구사항

### BOOT: 시작과 게이트

| ID | 요구사항 | 근거 |
| --- | --- | --- |
| REQ-BOOT-001 | 앱 시작은 스플래시 → 강제 업데이트 게이트 → 인증 게이트 순서로 진행하고, 앞 단계가 끝나기 전에는 다음 화면을 보이지 않는다. | 00-overview §5, iOS §1.2, AN §1.3 |
| REQ-BOOT-002 | 강제 업데이트 확인이 진행되는 동안 스플래시를 유지한다. | AN §1.3-1 |
| REQ-BOOT-003 | 게이트를 통과한 뒤에는 홈 데이터 프리로드가 끝날 때까지 스플래시를 유지하되, 프리로드가 끝나지 않아도 `SPLASH_PRELOAD_MAX`(700ms)가 지나면 스플래시를 해제한다. | AN §1.3-1, §5.1-2, 00-overview §6 |
| REQ-BOOT-004 | 인증 게이트 결과가 로그인(세션 없음)이면 홈 프리로드를 기다리지 않고 스플래시를 해제한다. [추정: 로그인 화면에는 프리로드할 홈이 없다] | AN §1.3-1 |
| REQ-BOOT-005 | 강제 업데이트가 필요하다고 판정되면 닫을 수 없는 다이얼로그를 보이고, 사용자는 다이얼로그 뒤의 어떤 화면(로그인, 메인, 푸시 탭 이동 포함)에도 접근할 수 없다. | D-15, iOS §1.2 |
| REQ-BOOT-006 | iOS 계열(iOS native, Flutter iOS, RN iOS)은 스토어 조회(iTunes lookup: 번들 ID, 스토어프론트 국가, software)로 얻은 버전의 major 또는 minor가 설치 버전보다 높을 때만 "업데이트 필요"로 판정하고, patch만 높으면 통과한다. | D-15, iOS §1.2, AppVersionGateTests |
| REQ-BOOT-007 | iOS 계열의 스토어 조회 타임아웃은 3초이며 초과하면 조회 실패로 본다. | iOS §1.2 |
| REQ-BOOT-008 | Android 계열(Android native, Flutter Android, RN Android)은 Play In-App Update의 `updatePriority`가 1 이상이면 즉시(IMMEDIATE) 업데이트를 시작하고, 0이면 통과한다. | D-15, AN §1.3-2 |
| REQ-BOOT-009 | Android 계열에서 즉시 업데이트를 취소하거나 실패하면 앱을 종료하고, 업데이트 후에도 우선순위가 남아 있으면 다시 강제 업데이트를 시작한다. | AN §1.3-2 |
| REQ-BOOT-010 | 스토어 조회가 실패하거나 기기가 오프라인이면 앱을 막지 않고 통과시키며, 이미 "업데이트 필요"로 확인된 상태는 이후 조회가 실패해도 유지한다. | D-15, iOS §1.2, AN §1.3 |
| REQ-BOOT-011 | 온라인인데 확인에 실패해도(Android의 "업데이트를 확인할 수 없어요" 차단 화면) 앱을 막지 않고 통과시킨다. | D-15 |
| REQ-BOOT-012 | iOS 계열은 앱이 다시 활성화될 때, Android 계열은 오프라인에서 온라인으로 바뀔 때 게이트를 다시 확인한다. | iOS §1.2, AN §1.3-2 |
| REQ-BOOT-013 | Web은 강제 업데이트 게이트를 만들지 않는다. | D-15 |
| REQ-BOOT-014 | 게이트 로직은 구현하되 실제 스토어 조회는 설정 값(`FORCE_UPDATE_CHECK_ENABLED`, 기본 꺼짐) 하나로 끌 수 있고, 꺼져 있으면 조회 없이 통과한다. 테스트는 가짜 조회기를 주입해 판정을 검증한다. | D-15 |
| REQ-BOOT-015 | 인증 게이트는 저장된 세션을 읽어 로딩, 로그아웃(SignedOut), 게스트(Guest), 인증(Authenticated) 중 하나로 판정하며, 로딩 동안에는 빈 화면(스플래시)만 보인다. | AN §1.3-3, iOS §1.2 |
| REQ-BOOT-016 | userId가 있고 만료되지 않은 refresh token이 있으면 게스트 플래그 유무와 관계없이 인증 상태로 판정하고, 메인(홈)을 열고 푸시 기기 등록을 시작한다. | 00-overview §5, iOS §1.2, D-17 |
| REQ-BOOT-017 | 인증 세션이 없고 게스트 플래그가 있으면 게스트 제한 모드로 메인(홈)을 열고, 서버 호출 없이 공개 API만 쓴다. | iOS §1.2, D-05 |
| REQ-BOOT-018 | 인증 세션도 게스트 플래그도 없으면 로그인 화면을 연다. | 00-overview §5 |
| REQ-BOOT-019 | refresh token이 만료됐거나 저장된 세션을 읽을 수 없으면(손상·복호화 실패) 저장된 세션을 모두 지우고 로그인 상태로 판정한다. | AN §3.2 |
| REQ-BOOT-020 | access token의 만료만으로는 로그아웃으로 판정하지 않는다(갱신은 첫 인증 요청에서 일어난다). | D-17, API §2.3 |
| REQ-BOOT-021 | 로그인 화면이 보일 때 분석 이벤트 `screen_view(login)`를 보낸다. | D-22 |

### AUTH: 카카오 로그인

| ID | 요구사항 | 근거 |
| --- | --- | --- |
| REQ-AUTH-001 | 로그인 화면은 태그라인, "카카오로 계속하기" 버튼, "로그인 없이 사진 둘러보기" 링크만 보이고 Apple·Google 로그인은 노출하지 않는다. | iOS §2.1, AN §2.1, 00-overview §2 |
| REQ-AUTH-002 | 카카오 버튼을 누를 때마다 보안 난수 32바이트를 base64url(패딩 없음)로 인코딩한 새 `rawNonce`를 만든다. | AN §2.1, API §2.1 |
| REQ-AUTH-003 | 카카오 SDK에는 `rawNonce` 문자열(UTF-8)의 SHA-256 해시를 소문자 16진수(64자)로 바꾼 값을 nonce로 전달하고, 서버에는 해시가 아닌 `rawNonce` 원문을 보낸다. | iOS §2.1, AN §2.1, API §2.1 |
| REQ-AUTH-004 | `rawNonce`와 SDK가 돌려준 `idToken`은 로그인 시도 동안 메모리에만 두고(가입 흐름이 끝나거나 취소될 때까지) 디스크 저장과 로그 출력을 하지 않는다. | API §2.1, 비밀값 원칙 |
| REQ-AUTH-005 | 카카오톡 앱 로그인이 가능하면 앱 로그인을 먼저 쓰고, 불가능하면 카카오계정(웹) 로그인을 쓴다. | iOS §2.1, AN §2.1 |
| REQ-AUTH-006 | 카카오톡 앱 로그인이 사용자 취소가 아닌 이유로 실패하면 카카오계정 로그인으로 폴백하고, 사용자 취소이면 폴백하지 않는다. | AN §2.1, §5.1-11 |
| REQ-AUTH-007 | 사용자가 카카오 인증을 취소하면 오류 문구 없이 로그인 화면의 초기 상태(버튼 활성)로 돌아간다. | iOS §2.1, AN §2.1 |
| REQ-AUTH-008 | SDK 결과에 `idToken`이 없으면 서버를 부르지 않고 설정 오류 문구(`auth.login.error.config`)를 보인다. | AN §2.1 (KakaoIdTokenClientTest) |
| REQ-AUTH-009 | 서버 로그인은 `POST /auth/social-login`에 `{provider: "KAKAO", idToken, rawNonce}`를 보내며 `authorizationCode` 필드는 포함하지 않는다. | API §1.1, §1.6 |
| REQ-AUTH-010 | 로그인 요청이 진행되는 동안 카카오 버튼과 게스트 링크를 비활성화해 중복 요청을 보내지 않는다. | AN §2.1 |
| REQ-AUTH-011 | 응답 `status`가 `LOGIN_SUCCESS`이면 userId와 토큰 정보를 저장하고 게스트 플래그를 지운 뒤 푸시 기기 등록을 시작하고 메인(홈)으로 이동한다. [추정: 게스트 플래그 삭제는 두 앱 문서에 명시가 없으나 인증 세션이 우선이라 남겨 둘 이유가 없다] | iOS §2.1, AN §2.1, API §1.1 |
| REQ-AUTH-012 | 응답 `status`가 `SIGN_UP_REQUIRED`이면 토큰을 저장하지 않고 `idToken`·`rawNonce`를 메모리에 유지한 채 약관 화면으로 이동한다. | API §2.1, onboarding-signature.md |
| REQ-AUTH-013 | `401 UNAUTHORIZED`(ID Token·nonce 검증 실패)는 토큰 갱신을 시도하지 않고 `auth.login.error.kakao-account`를 보이며, 다음 시도는 새 nonce와 새 ID Token으로 처음부터 한다. | API §5.1, AN §2.1 |
| REQ-AUTH-014 | 연결 실패와 타임아웃은 `auth.login.error.network`를 보이고, `social-login`은 자동 재시도하지 않는다. | D-20, D-21 |
| REQ-AUTH-015 | 응답을 해석할 수 없거나(필수 필드 누락, 알 수 없는 `status`) 그 밖의 서버 오류이면 각각 `auth.login.error.invalid-response`, `auth.login.error.generic`을 보인다. | iOS §2.1, AN §2.1 |
| REQ-AUTH-016 | `403 FORBIDDEN`(차단된 소셜 계정)은 서버 `message`를 그대로 보여 준다. [임시 동작: 확인 필요 항목 참조] | API §2.1, §2.6, USER-005 |
| REQ-AUTH-017 | 같은 문구의 로그인 오류가 연달아 발생해도 매번 다시 표시한다. | AN §2.1, D-20 |
| REQ-AUTH-018 | 로그인 오류 표시 방식(알림 대화상자 또는 토스트)과 상관없이 오류가 표시된 뒤에는 버튼이 다시 활성화되어 재시도할 수 있다. | iOS §2.1, AN §2.1 |

### AUTH: 게스트

| ID | 요구사항 | 근거 |
| --- | --- | --- |
| REQ-AUTH-019 | "로그인 없이 사진 둘러보기"를 누르면 서버 호출 없이 저장된 자격 증명을 지우고 게스트 플래그를 저장한 뒤 메인(홈)으로 이동한다. | iOS §2.1, AN §2.1 |
| REQ-AUTH-020 | 게스트 플래그 저장에 실패하면 로그인 화면에 머물고 `auth.login.error.guest`를 보인다. | AN §2.1 |
| REQ-AUTH-021 | 게스트의 모든 요청은 `Authorization` 헤더 없이 보내며, 게스트 요청의 401에는 토큰 갱신을 시도하지 않는다. | iOS §3.1, D-17 |
| REQ-AUTH-022 | 게스트 플래그는 앱을 다시 켜도 유지되고, 설정의 "로그인" 버튼(게스트 전용)이나 로그인 성공 때 지워진다. | iOS §3.2, AN §3.2, D-05 |

### AUTH: 토큰 저장과 갱신

| ID | 요구사항 | 근거 |
| --- | --- | --- |
| REQ-AUTH-023 | 세션 저장소에는 userId, accessToken, accessToken 만료 시각, refreshToken, refreshToken 만료 시각, 게스트 플래그만 저장한다. | D-17, iOS §3.2, AN §3.2 |
| REQ-AUTH-024 | 토큰은 플랫폼 보안 저장소(iOS Keychain, Android Keystore 암호화, Flutter `flutter_secure_storage`, RN `expo-secure-store` 또는 Keychain)에 저장한다. Web은 [Q-03](../open-questions.md) 결론 전까지 access는 메모리, refresh는 IndexedDB 임시안을 쓴다. | D-17, Q-03 |
| REQ-AUTH-025 | 만료 시각은 응답의 `expiresIn`, `refreshTokenExpiresIn`(초)을 받은 시각에 더한 절대 시각으로 저장하며 수명 값을 코드에 고정하지 않는다. | API §2.2, Q-06 |
| REQ-AUTH-026 | 만료된 access token은 요청 헤더에 붙이지 않는다. | D-17, AN §3.1 |
| REQ-AUTH-027 | refresh 응답의 access·refresh 두 토큰은 받은 즉시 함께(원자적으로) 저장한다. | D-17, API §2.3-3 |
| REQ-AUTH-028 | `401 REAUTHENTICATION_REQUIRED`를 받으면(refresh 응답이든 일반 API 응답이든) 저장된 세션과 사용자 캐시를 모두 지우고 로그인 화면으로 이동하며, 이때 refresh를 다시 호출하지 않는다. | D-17, iOS §3.1, AN §3.1 |
| REQ-AUTH-029 | 토큰 갱신이 네트워크 오류나 5xx로 실패하면 그 요청만 실패시키고 세션은 유지한다(로그아웃하지 않는다). | D-17, API §2.3-4 |
| REQ-AUTH-030 | 토큰 갱신이 진행되는 도중 로그아웃이나 계정 전환이 일어나면 갱신 결과를 저장하지 않고 폐기한다. | D-17, AN §3.1 |
| REQ-AUTH-031 | 토큰, `idToken`, `rawNonce`, `signupToken`, FCM 토큰은 로그·분석 이벤트·크래시 리포트에 출력하지 않는다. | 비밀값 원칙 |

### AUTH: 로그아웃과 탈퇴

| ID | 요구사항 | 근거 |
| --- | --- | --- |
| REQ-AUTH-032 | 설정의 "로그아웃"을 누르면 확인 대화상자("정말 로그아웃 하시겠습니까?")를 먼저 보이고, 취소하면 아무 변화가 없다. | D-16, iOS §2.11 |
| REQ-AUTH-033 | 로그아웃을 확인하면 로컬 토큰·사용자 캐시를 먼저 지운 뒤 `POST /auth/logout {refreshToken}`을 보내고(`Authorization` 없음), 응답이 실패해도 무시하고 로그인 화면으로 이동한다. | D-16, iOS §2.1, AN §2.11 |
| REQ-AUTH-034 | 로그아웃 요청은 자동 재시도하지 않으며, 푸시 기기를 해제하는 별도 API를 부르지 않는다(서버가 세션과 함께 지운다). | D-16, D-21, API §2.4 |
| REQ-AUTH-035 | 로그아웃 후 다시 로그인하면 푸시 기기를 새로 등록한다(이전 등록 중복 제거 캐시는 로그아웃 때 비운다). | API §7.2-7, notification-push.md |
| REQ-AUTH-036 | 로그아웃 시점에 보류 중이던 푸시 탭 이동은 폐기한다. [추정: D-11이 로그아웃 상태의 푸시 탭을 버린다고 정하므로 같은 취급] | D-11 |
| REQ-AUTH-037 | 설정의 "회원탈퇴"를 누르면 확인 대화상자("정말 회원탈퇴 하시겠습니까?")를 먼저 보이고, 취소하면 아무 변화가 없다. | D-16, iOS §2.11 |
| REQ-AUTH-038 | 탈퇴를 확인하면 `DELETE /users/me`를 보내고, 응답이 `204`일 때만 로컬 세션·캐시를 지우고 로그인 화면으로 이동한다. | D-16, USER-003, AN §2.11 |
| REQ-AUTH-039 | 탈퇴 요청이 실패하면 세션을 유지하고 화면에 머무르며 토스트 `auth.withdraw.error`를 보인다. | D-16, iOS §2.11 |
| REQ-AUTH-040 | 탈퇴·로그아웃 요청이 진행되는 동안 해당 버튼을 비활성화해 중복 요청을 막는다. | AN §2.11 [추정] |
| REQ-AUTH-041 | 탈퇴 후 카카오 SDK 연결 해제(unlink)를 호출하지 않는다. | D-16, Q-05 |
| REQ-AUTH-042 | 정지 회원도 로그아웃과 탈퇴를 할 수 있고 같은 흐름을 따른다. 탈퇴한 같은 카카오 계정으로 다시 로그인하면 `SIGN_UP_REQUIRED`가 되어 새 회원 가입 흐름을 밟는다(정지 상태로 탈퇴한 계정은 REQ-AUTH-016). | USER-002, USER-005, API §2.5 |

### AUTH: 정지(BANNED) 회원

| ID | 요구사항 | 근거 |
| --- | --- | --- |
| REQ-AUTH-043 | 정지 회원도 `LOGIN_SUCCESS`로 로그인되며, 로그인 직후 정지 안내를 따로 보이지 않는다. | D-08, Q-09, USER-002 |
| REQ-AUTH-044 | 정지 여부를 로컬에 저장하거나 추측하지 않고, 쓰기 요청이 `403 FORBIDDEN`을 받을 때만 D-08 표의 위치별 문구를 보인다. | D-08, API §0.1 |
| REQ-AUTH-045 | 정지 문구를 보인 같은 요청은 자동으로 다시 보내지 않는다. | D-08 |
| REQ-AUTH-046 | 정지 회원에게도 조회, 본인 게시물 삭제, 좋아요 취소, 알림, 알림 설정, 푸시 기기 등록, 피드백, 탈퇴 UI를 막지 않는다. | USER-002, API §2.6 |

## 상태

### 시작 흐름 상태

| 상태 | 진입 조건 | 보이는 것 | 전이 |
| --- | --- | --- | --- |
| 스플래시 | 프로세스 시작 | 스플래시 | 게이트 확인 종료 + (프리로드 완료 또는 700ms) → 인증 게이트 결과 상태 |
| 업데이트 필요 | 게이트가 필요로 판정 | 닫을 수 없는 다이얼로그 | 앱 업데이트 후 재실행(앱 내 해제 없음) |
| 세션 로딩 | 인증 게이트 읽는 중 | 빈 화면 | 읽기 완료 → 로그인 / 게스트 / 인증 |
| 로그인 | 세션 없음, 재인증, 로그아웃, 탈퇴, 게스트 "로그인" | 로그인 화면 | 카카오 성공 → 메인, `SIGN_UP_REQUIRED` → 약관, 게스트 → 메인 |
| 게스트 | 게스트 플래그 | 메인(제한 모드) | 설정 "로그인" → 로그인 |
| 인증 | 유효 세션 | 메인 | 로그아웃·탈퇴·`REAUTHENTICATION_REQUIRED` → 로그인 |

### 로그인 화면 상태

| 상태 | 조건 | 표시 | 전이 |
| --- | --- | --- | --- |
| 대기 | 초기, 취소 후, 오류 표시 후 | 두 버튼 활성 | 카카오 탭 → 인증 중, 게스트 탭 → 게스트 저장 |
| 인증 중 | 카카오 SDK 진행 | 버튼 비활성 + 진행 표시 | 취소 → 대기, ID Token 수신 → 서버 로그인 중, SDK 실패 → 오류 |
| 서버 로그인 중 | `social-login` 요청 | 버튼 비활성 + 진행 표시 | `LOGIN_SUCCESS` → 메인, `SIGN_UP_REQUIRED` → 약관, 실패 → 오류 |
| 오류 | 위 실패 | 오류 문구 | 확인 또는 시간 경과 → 대기 |

## API 호출

### 카카오 로그인

순서: (1) nonce 생성·해시 → (2) 카카오 SDK로 `idToken` 획득 → (3) `POST /auth/social-login`.

- 요청 본문: `provider="KAKAO"`, `idToken`, `rawNonce`. 응답: `status`, `LOGIN_SUCCESS`일 때만 `userId`, `accessToken`, `expiresIn`, `refreshToken`, `refreshTokenExpiresIn`.

| 결과 | 동작 | 사용자 문구 |
| --- | --- | --- |
| 200 `LOGIN_SUCCESS` | 세션 저장, 푸시 등록 시작, 메인 | 없음 |
| 200 `SIGN_UP_REQUIRED` | 약관 화면 | 없음 |
| 401 `UNAUTHORIZED` | 갱신 시도 없음, 오류 표시, 새 nonce로 재시도 가능 | `auth.login.error.kakao-account` |
| 403 `FORBIDDEN` | 서버 `message` 표시 | 서버 message |
| 400 `BUSINESS_ERROR` | 클라이언트 버그로 보고 일반 오류(필드 구성 확인) | `auth.login.error.generic` |
| 네트워크·타임아웃 | 재시도 없음 | `auth.login.error.network` |
| 5xx | 재시도 없음 | `auth.login.error.generic` |
| 200이지만 해석 불가 | 세션 저장 안 함 | `auth.login.error.invalid-response` |
| SDK 오류(카카오 설정 누락) | 서버 호출 없음 | `auth.login.error.config` |
| SDK 오류(그 밖) | 서버 호출 없음 | `auth.login.error.kakao-failed` |

### 토큰 갱신(요약)

`POST /auth/refresh {refreshToken}` → `accessToken`, `expiresIn`, `refreshToken`, `refreshTokenExpiresIn`. 요청 시점·single-flight·재전송 규칙은 [common-infra.md](common-infra.md) REQ-NET-017~024가 정한다.

### 로그아웃

`POST /auth/logout {refreshToken}` → 204. 어떤 응답도 UI에 영향이 없다(로컬 정리가 먼저).

### 탈퇴

`DELETE /users/me` (Bearer) → 204.

| 결과 | 동작 | 사용자 문구 |
| --- | --- | --- |
| 204 | 로컬 세션·캐시 삭제, 로그인 화면 | 없음 |
| 401 `UNAUTHORIZED`(갱신 후에도) | 세션은 그대로 두고 로그인 화면으로 보냄 | 없음 |
| 401 `REAUTHENTICATION_REQUIRED` | REQ-AUTH-028 | 없음 |
| 네트워크·타임아웃·5xx·그 밖 | 세션 유지, 화면 유지 | `auth.withdraw.error` |

### 정지 회원 403 문구 (공통 표)

D-08의 문구를 이 표의 키로 고정하고, 각 기능 문서는 이 키를 재사용한다.

| 위치 | 키 | 호출 API |
| --- | --- | --- |
| 업로드 진입 | `auth.banned.upload` | `GET /posts/today` |
| AI 피드백 요청 | `auth.banned.ai-review` | `POST /posts/{id}/ai-review` |
| 좋아요 등록 | `auth.banned.like` | `PUT /posts/{id}/likes` |
| 사인 변경 | `auth.banned.signature` | `POST /users/me/signature/uploads`, `PUT /users/me/signature` |
| 제목 수정 | `auth.banned.title-edit` | `PUT /posts/{id}` |

## 문구

한 줄 안의 `\n`은 줄바꿈이다. 브랜드 표기는 "찰칵"이다.

| 키 | 문구 | 상황 |
| --- | --- | --- |
| boot.update.title | 업데이트가 필요해요 | 강제 업데이트 다이얼로그 제목. iOS·D-15 동일 |
| boot.update.body | 원활한 서비스 이용을 위해 최신 버전으로 업데이트해 주세요. | 같은 다이얼로그 본문 |
| boot.update.button | 업데이트 | 같은 다이얼로그 버튼 |
| auth.login.tagline | 매일 하나의 주제,\n각자의 한 장 | 로그인 화면 상단. iOS·Android 동일 |
| auth.login.kakao | 카카오로 계속하기 | 카카오 버튼 |
| auth.login.guest | 로그인 없이 사진 둘러보기 | 게스트 링크 |
| auth.login.error.network | 네트워크 연결을 확인해 주세요. | 연결 실패·타임아웃(D-20 통일 문구) |
| auth.login.error.kakao-account | 카카오 계정을 확인할 수 없어요. 다시 시도해 주세요. | 서버 401. Android 문구 채택(제공자 이름이 들어가는 형태, iOS에는 해당 분기가 없음) |
| auth.login.error.config | 카카오 로그인 설정을 확인해 주세요. | ID Token 없음, SDK 설정 오류. Android 문구 채택(iOS "로그인 설정을 확인해 주세요."보다 구체적) |
| auth.login.error.kakao-failed | 카카오 로그인에 실패했어요. 다시 시도해 주세요. | SDK 일반 실패. Android 채택 |
| auth.login.error.invalid-response | 로그인 응답을 확인할 수 없어요. 다시 시도해 주세요. | 응답 해석 불가. iOS 채택(Android에 해당 분기 없음) |
| auth.login.error.generic | 로그인하지 못했어요. 다시 시도해 주세요. | 그 밖의 실패. iOS·Android 동일 |
| auth.login.error.guest | 화면을 불러오지 못했어요. 다시 시도해 주세요. | 게스트 플래그 저장 실패. Android |
| auth.logout.confirm.message | 정말 로그아웃 하시겠습니까? | 로그아웃 확인. iOS·Android 동일 |
| auth.logout.confirm.ok | 로그아웃 | 확인 버튼 [추정: 기존 문서에 버튼 라벨 없음] |
| auth.withdraw.confirm.message | 정말 회원탈퇴 하시겠습니까? | 탈퇴 확인. iOS·Android 동일 |
| auth.withdraw.confirm.ok | 회원탈퇴 | 확인 버튼 [추정] |
| auth.confirm.cancel | 취소 | 두 확인 대화상자의 취소 버튼 [추정] |
| auth.withdraw.error | 요청을 처리하지 못했어요. 다시 시도해 주세요. | 탈퇴 실패 토스트(D-16) |
| auth.banned.upload | 이용이 정지되어 게시물을 작성할 수 없어요. | D-08 |
| auth.banned.ai-review | 이용이 제한되어 AI 피드백을 요청할 수 없어요. | D-08 |
| auth.banned.like | 이용이 제한되어 좋아요를 누를 수 없어요. | D-08, 신규 문구 |
| auth.banned.signature | 이용이 제한되어 사인을 변경할 수 없어요. | D-08, 신규 문구 |
| auth.banned.title-edit | 이용이 제한되어 제목을 수정할 수 없어요. | D-08, 신규 문구 |

## 플랫폼별 허용 차이

- 스플래시는 플랫폼 기본 스플래시(iOS LaunchScreen, Android SplashScreen API)나 앱 내 로딩 화면 어느 쪽이든 된다. 시간 규칙(700ms)은 같아야 한다.
- 로그인 오류는 iOS 알림 대화상자(제목 "로그인", 버튼 "확인"), Android 토스트·스낵바 어느 쪽이든 된다. 문구는 같아야 한다.
- 확인 대화상자(로그아웃·탈퇴)의 모양(iOS 알림/액션 시트, Android 다이얼로그, Web 모달)은 자유다.
- 강제 업데이트 방식은 D-15대로 플랫폼 계열별로 다르다. Web은 게이트가 없다.
- 카카오 SDK 연동 방식(앱 URL 스킴, 웹 SDK)은 플랫폼 몫이다. Web 로그인은 [Q-02](../open-questions.md) 결론 전까지 게스트 + 개발용 우회(개발 빌드 한정)로 대체할 수 있다.
- Android 전용: SDK가 호스트 Activity를 얻지 못할 때 "카카오 로그인을 시작할 수 없어요."를 보일 수 있다.

## 범위 밖

- Apple·Google 로그인(보류). 서버는 지원하지만 이번 범위가 아니며 로그인 화면에 버튼도 만들지 않는다.
- 로그인 직후 정지 회원 안내(Q-09), 탈퇴 시 카카오 unlink(Q-05), refresh 응답 유실 복구(Q-07).
- 레거시 로컬 리마인더 정리 코드(기존 앱 전용).

## 확인 필요

1. 재인증이 필요해져 로그인 화면으로 보낼 때(`REAUTHENTICATION_REQUIRED`) 사유를 알리는 문구를 보일지. 기존 앱은 가입 흐름에서만 "로그인 정보가 만료되었어요. 다시 로그인해 주세요."를 쓰고 그 밖에는 문구 없이 로그인 화면으로 간다. 임시 동작: 문구 없음.
2. 정지된 상태로 탈퇴한 카카오 계정의 로그인·가입 시도(`403 FORBIDDEN`)에 보일 문구. 기존 두 앱에는 이 분기가 없다. 임시 동작: 서버 `message`를 그대로 표시(D-02는 message를 표시용으로 허용).
3. 로그아웃·탈퇴 확인 대화상자의 버튼 라벨. 기존 문서에는 본문만 있다. 임시: "취소"/"로그아웃", "취소"/"회원탈퇴".
4. 강제 업데이트 설정 키 이름(`FORCE_UPDATE_CHECK_ENABLED`)과 기본값은 이 문서의 제안이다.
5. 갱신 후에도 남는 일반 `401 UNAUTHORIZED`에서 저장 세션을 지울지. D-17은 `REAUTHENTICATION_REQUIRED`만 지운다고 정한다. 임시 동작: 세션은 지우지 않고 로그인 화면으로만 보낸다([common-infra.md](common-infra.md) REQ-NET-023).
