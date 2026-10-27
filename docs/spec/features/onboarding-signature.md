# 온보딩과 사인 (ONB, SIGN)

카카오 로그인이 `SIGN_UP_REQUIRED`로 끝나면 약관 동의 → 사인 그리기 → 미리보기 → 가입 완료 순서로 회원가입을 마친다. 사인은 흰색 선의 투명 배경 PNG(1024×512)로 만들어 업로드하고, 서버가 처리를 끝낼 때까지 `SIGNATURE_PROCESSING_PENDING`이면 1초 간격으로 최대 10회 다시 요청한다. 같은 그리기·미리보기 화면을 설정의 "사인 변경"에서도 쓴다. 로그인 자체는 [boot-auth.md](boot-auth.md), 설정 화면의 나머지 행은 [settings-feedback.md](settings-feedback.md)가 다룬다.

- 관련 규칙: [USER-001](../../reference/business-rules/rules/user.md), [SIGN-001~006](../../reference/business-rules/rules/sign.md)
- 관련 결정: [D-02](../decisions.md#d-02-서버-오류-분기는-errorcode--http-상태--호출-api로만), [D-08](../decisions.md#d-08-정지banned-회원), [D-18](../decisions.md#d-18-사인-변경-결과-표시), [D-21](../decisions.md#d-21-네트워크-타임아웃), [D-22](../decisions.md#d-22-분석-이벤트), [D-25](../decisions.md#d-25-약관-동의)
- 근거 약어: iOS = [legacy-ios](../../reference/legacy-ios.md), AN = [legacy-android](../../reference/legacy-android.md), API = [api-contract](../../reference/api-contract.md).
- 공통 상수([00-overview §6](../00-overview.md#6-다섯-클라이언트-공통-상수)): `SIGNATURE_PNG_SIZE` 1024×512(패딩 48, 획 14, 투명 배경 + 흰 획), `SIGNATURE_MAX_BYTES` 1,048,576, `SIGNUP_PENDING_RETRY` 1초 간격 최대 10회.

## 화면

### 약관 동의 (가입 1단계)

- 진입 조건: `social-login`이 `SIGN_UP_REQUIRED`를 돌려주고 `idToken`·`rawNonce`가 메모리에 있다.
- 구성 요소: 제목(`onb.terms.title`), 전체 동의 `terms-agree-all`, (필수) 서비스 이용약관 체크 `terms-agree-service`와 "보기" `terms-view-service`, (필수) 개인정보 처리방침 체크 `terms-agree-privacy`와 "보기" `terms-view-privacy`, "다음" `terms-next-button`.
- 사용자 동작: 체크 토글, "보기"로 문서 열기, "다음"으로 사인 그리기 이동.

### 약관 문서 보기

- 진입 조건: 약관 화면(가입)이나 설정에서 "보기"/"이용약관"/"개인정보처리방침".
- 구성 요소: 닫기 버튼, 앱 안 웹뷰(Web은 새 탭), 로드 실패 시 오류 문구와 "다시 시도".

### 사인 그리기 (가입 2단계 / 설정 사인 변경 1단계)

- 진입 조건: 약관 "다음", 설정 사인 카드의 "변경하기".
- 구성 요소: 제목(`onb.sign.title`), 안내(`onb.sign.guide`), 그리기 영역 `signature-pad`(힌트 `onb.sign.pad-hint`), "되돌리기" `signature-undo-button`, "전체 지우기" `signature-clear-button`, "이 사인으로 할래요" `signature-confirm-button`(획이 없으면 비활성).
- 사용자 동작: 연속 획 그리기, 마지막 획 되돌리기, 전체 지우기, 확정 → 미리보기.

### 사인 미리보기 (가입 3단계 / 설정 사인 변경 2단계)

- 진입 조건: 그리기 화면에서 확정.
- 구성 요소: 제목 "이렇게 보여요", 사인 미리보기 `signature-preview`, "다시 그리기" `signature-redraw-button`, 가입 모드 확정 버튼 "시작하기" `signature-start-button`, 변경 모드 확정 버튼 "사인 변경하기" `signature-change-button`과 안내 문구.
- 사용자 동작: 다시 그리기(그리기 화면으로), 확정(서버 요청 시작).

### 설정의 사인 카드 (SIGN)

- 진입 조건: 회원(게스트 아님)이 설정 탭을 볼 때. 카드 위치와 나머지 행은 [settings-feedback.md](settings-feedback.md).
- 구성 요소: 제목 "사인 재설정", 현재 사인 이미지 `signature-card-image`, "변경하기" `signature-card-change-button`.

## 요구사항

### ONB: 약관

| ID | 요구사항 | 근거 |
| --- | --- | --- |
| REQ-ONB-001 | 약관 화면은 제목, "전체 동의", "(필수) 서비스 이용약관", "(필수) 개인정보 처리방침"(각각 "보기" 포함), "다음"을 보인다. | AN §2.2, iOS §2.2 |
| REQ-ONB-002 | 화면에 처음 들어오면 모든 체크가 꺼져 있고 "다음"은 비활성이다. | AN §2.2 |
| REQ-ONB-003 | "전체 동의"를 켜면 두 필수 항목이 모두 켜지고, 끄면 모두 꺼진다. | AN §2.2 |
| REQ-ONB-004 | 두 필수 항목을 모두 켜면 "전체 동의"가 켜지고, 하나라도 끄면 "전체 동의"가 꺼진다. | AN §2.2 [추정: 연동 방향은 기존 문서에 명시 없음] |
| REQ-ONB-005 | 두 필수 항목에 모두 동의해야 "다음"이 활성화된다. | D-25, AN §2.2 |
| REQ-ONB-006 | 동의 사실은 저장하거나 서버로 전송하지 않으며, 가입 화면을 벗어났다 다시 오면 다시 동의받는다. | D-25, API §8.2-1 |
| REQ-ONB-007 | "보기"를 누르면 해당 약관 문서(공통 상수 URL)를 앱 안 웹뷰로 열고, Web은 새 탭으로 연다. | D-25, iOS §2.2 |
| REQ-ONB-008 | 문서 URL은 https이고 호스트가 `notion.com`, `notion.so`, `notion.site`(하위 도메인 포함)일 때만 앱 안에서 열고, 그 밖의 URL은 외부 브라우저로 연다. | D-25, iOS §2.11, AN §2.2 |
| REQ-ONB-009 | 문서 로드에 실패하면 "문서를 불러오지 못했어요"와 "다시 시도" 버튼을 보이고, 열 수 없는 URL이면 "문서를 열 수 없어요"를 보인다. | AN §2.2, iOS §2.11 |
| REQ-ONB-010 | 약관 화면에서 "다음"을 누르면 사인 그리기 화면으로 이동한다. | 00-overview §5 |
| REQ-ONB-011 | 분석 이벤트 `screen_view`를 약관 화면은 `terms`, 서비스 이용약관 문서는 `terms_of_service`, 개인정보 처리방침 문서는 `privacy_policy`로 보낸다. | D-22 |

### ONB / SIGN: 사인 그리기

| ID | 요구사항 | 근거 |
| --- | --- | --- |
| REQ-SIGN-001 | 그리기 화면은 제목, 안내 문구, 그리기 영역, "되돌리기", "전체 지우기", "이 사인으로 할래요"를 보인다. | AN §2.3, iOS §2.2 |
| REQ-SIGN-002 | 그리기 영역에서 손가락·마우스 드래그로 여러 획을 이어서 그릴 수 있고, 화면에 보이는 획 색은 배경과 구별되면 자유지만 내보내는 PNG의 획은 항상 흰색이다. | AN §2.3, §5.2-17 |
| REQ-SIGN-003 | 획이 하나도 없으면 "되돌리기", "전체 지우기", "이 사인으로 할래요"가 비활성이다. | AN §2.3 |
| REQ-SIGN-004 | "되돌리기"는 마지막 획 하나를 지우고, "전체 지우기"는 모든 획을 지운다. | iOS §2.2, AN §2.3 |
| REQ-SIGN-005 | 점 하나만 찍은 입력도 하나의 획으로 인정하고 PNG에서는 원으로 그린다. | AN §2.3 |
| REQ-SIGN-006 | 사인 PNG는 1024×512 픽셀, 투명 배경, 흰색 획, 패딩 48px, 획 두께 14px(둥근 끝·둥근 이음)로 만들고, 획 경로는 이차 곡선으로 부드럽게 잇는다. | 00-overview §6, iOS §2.2, AN §2.3 |
| REQ-SIGN-007 | 그린 점들의 외곽 박스는 캔버스 대비 비율로 정규화하며 한 변이 0.02보다 작으면 0.02로 취급하고, 비율을 유지한 채 패딩 안쪽 영역에 중앙 정렬로 맞춘다. [추정: 맞춤 방식. 확인 필요 1번] | iOS §2.2, AN §2.3 |
| REQ-SIGN-008 | 인코딩한 PNG가 1,048,576바이트를 넘으면 서버를 부르지 않고 `sign.error.too-large`를 보이며 그리기 내용은 유지한다. | SIGN-002, iOS §2.2, AN §2.3 |
| REQ-SIGN-009 | "이 사인으로 할래요"를 연달아 눌러도 미리보기 화면은 한 번만 열린다. | AN §2.3 (ChalkakNavHostTest) |
| REQ-SIGN-010 | 미리보기는 내보낼 PNG를 흰 획이 보이는 배경 위에 그려서 보여 준다. [추정: 흰 획은 밝은 배경에서 보이지 않는다] | AN §5.2-17 |
| REQ-SIGN-011 | 미리보기에서 "다시 그리기"를 누르면 그리기 화면으로 돌아가 새로 그린다. [추정: 이전 획은 지운 상태. 확인 필요 2번] | iOS §2.2, AN §2.3 |
| REQ-SIGN-012 | 분석 이벤트 `screen_view`를 가입 흐름은 `onboarding_signature`, `onboarding_signature_preview`로, 설정 변경 흐름은 `change_signature`, `change_signature_preview`로 보낸다. | D-22 |

### ONB: 회원가입 요청

| ID | 요구사항 | 근거 |
| --- | --- | --- |
| REQ-ONB-012 | 미리보기의 "시작하기"를 누르면 요청이 끝날 때까지 버튼을 비활성화하고 진행 표시를 보이며, 연타해도 가입 흐름은 한 번만 실행한다. | iOS §2.2 [추정], D-21 |
| REQ-ONB-013 | 가입은 (1) `POST /auth/social-signup/signature/uploads {provider, idToken, rawNonce}` → (2) 받은 `uploadUrl`로 PNG `PUT` → (3) `POST /auth/social-signup {signupToken}` 순서로 진행한다. | iOS §2.2, AN §2.3, API §2.1 |
| REQ-ONB-014 | PNG `PUT`은 `Content-Type: image/png`로, 인증 헤더 없이 보내며, 업로드가 실패하면 (3)을 호출하지 않는다. | AN §2.3, API §3.2 |
| REQ-ONB-015 | (3)이 `400`이고 `errorCode`가 `SIGNATURE_PROCESSING_PENDING`이면 같은 `signupToken`으로 1초 뒤에 다시 요청하고, 최초 요청 뒤 최대 10회까지 반복한다. | 00-overview §6, iOS §2.2, AN §2.3, API §5.1 |
| REQ-ONB-016 | 재시도 10회를 모두 쓰고도 `SIGNATURE_PROCESSING_PENDING`이면 `onb.signup.error.timeout`을 보이고 요청을 멈춘다. | iOS §2.2, AN §2.3 |
| REQ-ONB-017 | 재시도 대기 중에도 진행 표시를 유지하고 버튼은 비활성이다. | API §5.1 |
| REQ-ONB-018 | (3)이 200이면 응답의 `userId`, `accessToken`, `expiresIn`, `refreshToken`, `refreshTokenExpiresIn`을 저장하고 추가 로그인 호출 없이 가입 완료로 처리한다. | API §2.1, §1.1 (Android 기존 앱의 재로그인 호출은 따르지 않는다) |
| REQ-ONB-019 | 가입이 끝나면 메모리의 `idToken`·`rawNonce`·`signupToken`을 폐기하고, 푸시 기기 등록을 시작하고, 가입 화면(약관·사인·미리보기)을 백스택에서 제거한 채 메인(홈)으로 이동한다. | AN §1.3-4, API §7.2-3 |
| REQ-ONB-020 | 가입 요청 중 어떤 단계가 실패해도 사용자가 입력한 사인(획)은 유지하고, 다시 "시작하기"를 누르면 (1)부터 새로 시작한다. | iOS §2.2, D-14 취지 [추정] |
| REQ-ONB-021 | `social-signup` 계열 `POST`는 자동 재시도하지 않는다(위 `SIGNATURE_PROCESSING_PENDING` 반복은 사용자 재시도가 아니라 정해진 폴링이다). | D-21 |
| REQ-ONB-022 | (1)이 `400`이면(이미 가입된 소셜 계정) 같은 `idToken`·`rawNonce`로 `social-login`을 다시 호출해 `LOGIN_SUCCESS`이면 로그인 성공 처리하고 `SIGN_UP_REQUIRED`가 다시 나오면 `onb.signup.error.generic`을 보인다. | API §2.1, D-02 (message가 아니라 호출 API로 분기) |
| REQ-ONB-023 | (1)·(3)이 `401`이거나 `idToken`·`rawNonce` 컨텍스트가 없으면 가입 컨텍스트를 폐기하고 로그인 화면으로 돌아가 `sign.error.expired`를 보인다. | iOS §2.2, API §5.1 |
| REQ-ONB-024 | (3)의 `400 BUSINESS_ERROR`는 `sign.error.invalid`로 처리하고, `404`는 `onb.signup.error.reupload`로 처리하며, 두 경우 모두 다시 그릴 수 있게 한다. | iOS §2.2, AN §2.3, D-02 |
| REQ-ONB-025 | (1)·(3)이 `403 FORBIDDEN`(차단된 소셜 계정)이면 서버 `message`를 그대로 보여 준다. [임시 동작: 확인 필요 3번] | API §2.1, USER-002 |
| REQ-ONB-026 | 연결 실패와 타임아웃은 `sign.error.network`, 그 밖의 실패(5xx, 업로드 `PUT` 오류, 해석 불가 응답)는 `onb.signup.error.generic`을 보인다. | iOS §2.2, AN §2.3, D-20 |
| REQ-ONB-027 | 가입 화면에서 뒤로 가면 사인 → 약관 → 로그인 순으로 돌아가고, 로그인 화면으로 돌아가면 가입 컨텍스트를 폐기한다. | AN §1.3-4 [추정: 뒤로 가기 동작은 기존 문서에 명시 없음] |
| REQ-ONB-028 | 가입 직후 사용자는 정상 회원(ACTIVE)이므로 별도 안내 없이 홈이 열린다. | USER-001 |

### SIGN: 설정에서 사인 변경

| ID | 요구사항 | 근거 |
| --- | --- | --- |
| REQ-SIGN-013 | 회원의 설정 탭 사인 카드는 `GET /users/me/signature`로 현재 사인을 불러와 `signatureThumbnailImageUrl`로 보여 주고, 썸네일이 `null`이면 `signatureOriginalImageUrl`을 보여 준다. | D-18, API §1.2 |
| REQ-SIGN-014 | 설정 탭이 보일 때마다 사인을 다시 조회하되, 조회가 진행 중이면 중복 요청하지 않는다. | AN §2.11, D-18 |
| REQ-SIGN-015 | 사인 조회가 실패하면 이미 보이던 사인은 그대로 두고 토스트 `sign.load.error`를 보이며, 보이던 사인이 없으면 이미지 자리를 빈 상태로 둔다. | AN §2.11, iOS §2.11 |
| REQ-SIGN-016 | 사인 조회가 `400 SIGNATURE_REGISTRATION_REQUIRED`이면 사인 이미지 자리를 빈 상태로 두고 "변경하기"로 새로 등록할 수 있게 한다. [임시 동작: 확인 필요 4번] | SIGN-004, API §5.1 |
| REQ-SIGN-017 | 게스트에게는 사인 카드를 보이지 않고 사인 API를 호출하지 않는다. | D-05 |
| REQ-SIGN-018 | "변경하기"를 누르면 가입과 같은 그리기 화면(변경 모드)이 열리고, 그리기 규칙(REQ-SIGN-001~011)은 가입과 같다. | iOS §2.11, AN §2.3 |
| REQ-SIGN-019 | 변경 모드 미리보기는 확정 버튼 "사인 변경하기"와 "사인 변경까지 시간이 조금 걸릴 수 있어요" 안내를 보인다. | AN §2.3 |
| REQ-SIGN-020 | 변경은 (1) `POST /users/me/signature/uploads` → (2) `PUT uploadUrl`(PNG, 인증 헤더 없음) → (3) `PUT /users/me/signature {signatureOriginalUploadId}` 순서로 진행하며, 앞 단계가 실패하면 다음 단계를 호출하지 않는다. | iOS §2.11, AN §2.3, API §3.2 |
| REQ-SIGN-021 | 변경 요청 중에는 확정 버튼을 비활성화하고 진행 표시를 보이며 연타해도 한 번만 실행한다. | AN §2.3 |
| REQ-SIGN-022 | 변경이 성공하면 설정 화면으로 돌아가(그리기·미리보기 화면은 백스택에서 제거) 토스트 `sign.change.done`을 보이고, `PUT` 응답의 URL이 아니라 `GET /users/me/signature`를 다시 불러 그 썸네일을 사인 카드에 쓴다. | D-18, AN §1.4, §5.2-1 |
| REQ-SIGN-023 | 변경 직후 서버가 아직 처리 중이면 `GET` 응답이 이전 사인을 돌려줄 수 있으며, 설정 탭이 다시 보일 때마다 재조회해 새 사인으로 바뀐다. | D-18, API §3.2 |
| REQ-SIGN-024 | 변경 `PUT`이 `400 SIGNATURE_REUPLOAD_REQUIRED`이면 `onb.signup.error.reupload`를 보이고 다음 시도는 (1)부터 새로 시작한다. | API §5.1 |
| REQ-SIGN-025 | 변경 `PUT`의 `400 BUSINESS_ERROR`는 `sign.error.invalid`, `404`는 `sign.change.error.not-found`를 보인다. | iOS §2.11, AN §2.3, D-02 |
| REQ-SIGN-026 | 변경 흐름에서 `403 FORBIDDEN`(정지 회원)은 `auth.banned.signature`를 보이고 같은 요청을 다시 보내지 않는다. | D-08 |
| REQ-SIGN-027 | 변경 흐름의 `401`은 토큰 갱신 후에도 실패하면 로그인 화면으로 보내고 `sign.error.expired`를 보인다. | AN §2.3, D-17 |
| REQ-SIGN-028 | 변경 흐름의 연결 실패·타임아웃은 `sign.error.network`, 그 밖의 실패는 `sign.change.error.generic`을 보이며, 실패해도 기존 사인과 그린 내용은 유지된다. | iOS §2.11, AN §2.3, SIGN-003 |
| REQ-SIGN-029 | 이미 처리 중인 사인이 있어도 새로 변경을 요청할 수 있으며 횟수 제한을 두지 않는다. | SIGN-003 |

## 상태

### 가입 흐름 상태

| 상태 | 진입 조건 | 보이는 것 | 전이 |
| --- | --- | --- | --- |
| 약관 | `SIGN_UP_REQUIRED` | 약관 화면, "다음" 비활성 | 두 항목 동의 → "다음" 활성; "다음" → 사인 그리기; 뒤로 → 로그인(컨텍스트 폐기) |
| 사인 그리기 | 약관 "다음" | 그리기 화면 | 확정 → 미리보기; 뒤로 → 약관 |
| 미리보기 | 그리기 확정 | 미리보기, "시작하기" 활성 | "시작하기" → 가입 진행; "다시 그리기" → 사인 그리기 |
| 가입 진행(업로드 발급) | "시작하기" | 버튼 비활성, 진행 표시 | 성공 → 업로드; 실패 → 오류 후 미리보기 |
| 가입 진행(업로드) | 발급 성공 | 같음 | 성공 → 가입 확정; 실패 → 오류 후 미리보기 |
| 가입 진행(확정/대기) | `PUT` 성공 | 같음 | 200 → 메인; `SIGNATURE_PROCESSING_PENDING` → 1초 후 재요청(최대 10회); 소진 → 시간 초과 오류; 기타 실패 → 오류 |
| 완료 | 200 | 홈 | 메모리 컨텍스트 폐기 |

### 설정 사인 카드 상태

| 상태 | 조건 | 표시 | 전이 |
| --- | --- | --- | --- |
| 로딩 | 설정 탭 진입, 조회 중 | 이전 사인(있으면) 또는 자리 표시 | 성공 → 콘텐츠; 실패 → 이전 사인 유지 + 토스트 |
| 콘텐츠 | 조회 성공 | 사인 이미지 | 탭이 다시 보임 → 로딩 |
| 재등록 필요 | `SIGNATURE_REGISTRATION_REQUIRED` | 빈 이미지 + "변경하기" | "변경하기" → 변경 모드 |
| 변경 진행 | 변경 모드 확정 후 | 확정 버튼 비활성, 진행 표시 | 성공 → 설정 + 토스트 + 재조회; 실패 → 오류 후 미리보기 |

## API 호출

### 회원가입

| 순서 | 호출 | 요청 핵심 | 응답 핵심 |
| --- | --- | --- | --- |
| 1 | `POST /auth/social-signup/signature/uploads` | `provider`, `idToken`, `rawNonce` | `uploadId`, `uploadUrl`, `expiresInSeconds`(300), `signupToken`(5분) |
| 2 | `PUT {uploadUrl}` | 본문 PNG 바이트, `Content-Type: image/png`, 인증 헤더 없음, 타임아웃 60초 | 2xx |
| 3 | `POST /auth/social-signup` | `{signupToken}` | `userId`, `accessToken`, `expiresIn`, `refreshToken`, `refreshTokenExpiresIn` |

| 단계 | HTTP + errorCode | 동작 | 사용자 문구 |
| --- | --- | --- | --- |
| 1 | 400 `BUSINESS_ERROR` | `social-login` 재호출, `LOGIN_SUCCESS`면 로그인 성공 처리 | 재호출도 `SIGN_UP_REQUIRED`면 `onb.signup.error.generic` |
| 1·3 | 401 `UNAUTHORIZED` | 가입 컨텍스트 폐기, 로그인 화면 | `sign.error.expired` |
| 1·3 | 403 `FORBIDDEN` | 서버 `message` 표시, 재요청 없음 | 서버 message |
| 3 | 400 `SIGNATURE_PROCESSING_PENDING` | 1초 후 같은 `signupToken`으로 재요청(최대 10회) | 소진 시 `onb.signup.error.timeout` |
| 3 | 400 `BUSINESS_ERROR` | 다시 그리기 유도 | `sign.error.invalid` |
| 3 | 404 `BUSINESS_ERROR` | 업로드 없음, (1)부터 다시 | `onb.signup.error.reupload` |
| 2 | 네트워크·타임아웃 | `PUT`은 D-21대로 최대 2회 재시도 후 실패 | `sign.error.network` |
| 1·3 | 네트워크·타임아웃 | 재시도 없음 | `sign.error.network` |
| 1·2·3 | 5xx, 해석 불가, 그 밖 | 재시도 없음 | `onb.signup.error.generic` |
| 로컬 | PNG > 1 MiB | 서버 호출 없음 | `sign.error.too-large` |

### 사인 조회 / 변경 (설정)

| 순서 | 호출 | 요청 핵심 | 응답 핵심 |
| --- | --- | --- | --- |
| 조회 | `GET /users/me/signature` | Bearer | `signatureOriginalImageUrl`, `signatureThumbnailImageUrl`(null 가능) |
| 변경 1 | `POST /users/me/signature/uploads` | 본문 없음 | `uploadId`, `uploadUrl`, `expiresInSeconds`(`contentType`·`maxBytes` 없음, 클라이언트 상수) |
| 변경 2 | `PUT {uploadUrl}` | PNG, `Content-Type: image/png`, 인증 헤더 없음 | 2xx |
| 변경 3 | `PUT /users/me/signature` | `{signatureOriginalUploadId}` | `signatureOriginalImageUrl`(처리 완료 전에는 기존 사인) |

| 호출 | HTTP + errorCode | 동작 | 사용자 문구 |
| --- | --- | --- | --- |
| 조회 | 400 `SIGNATURE_REGISTRATION_REQUIRED` | 사인 비움, 변경 유도 | 없음(임시) |
| 조회 | 401·네트워크·그 밖 | 기존 사인 유지, 401은 갱신 후에도 실패 시 로그인 화면 | `sign.load.error`(401은 없음) |
| 변경 1·3 | 403 `FORBIDDEN` | 재요청 없음 | `auth.banned.signature` |
| 변경 1·3 | 401 `UNAUTHORIZED` | 갱신 후에도 실패 시 로그인 화면 | `sign.error.expired` |
| 변경 3 | 400 `SIGNATURE_REUPLOAD_REQUIRED` | 다음 시도는 새 업로드부터 | `onb.signup.error.reupload` |
| 변경 3 | 400 `BUSINESS_ERROR` | 다시 그리기 유도 | `sign.error.invalid` |
| 변경 3 | 404 `BUSINESS_ERROR` | 업로드 없음 | `sign.change.error.not-found` |
| 변경 전체 | 네트워크·타임아웃 | `POST` 발급·`PUT`은 D-21 재시도 후 실패 | `sign.error.network` |
| 변경 전체 | 5xx·그 밖 | | `sign.change.error.generic` |
| 로컬 | PNG > 1 MiB | 서버 호출 없음 | `sign.error.too-large` |

## 문구

| 키 | 문구 | 상황 |
| --- | --- | --- |
| onb.terms.title | 찰칵에\n오신 것을 환영합니다. | 약관 화면 제목. 기존 iOS 소스의 "찰캌"은 오타로 보고 "찰칵" 사용, Android 동일 |
| onb.terms.agree-all | 전체 동의 | 전체 동의 체크 |
| onb.terms.service | (필수) 서비스 이용약관 | 항목 라벨 |
| onb.terms.privacy | (필수) 개인정보 처리방침 | 항목 라벨 |
| onb.terms.view | 보기 | 항목별 문서 열기 |
| onb.terms.next | 다음 | 약관 화면 다음 버튼 |
| onb.terms.doc.title.service | 이용약관 | 문서 시트 제목 [추정: 설정 행 이름 재사용] |
| onb.terms.doc.title.privacy | 개인정보처리방침 | 문서 시트 제목 [추정: 설정 행 이름 재사용] |
| onb.terms.doc.error | 문서를 불러오지 못했어요 | 문서 로드 실패 |
| onb.terms.doc.retry | 다시 시도 | 문서 로드 실패 버튼 |
| onb.terms.doc.cannot-open | 문서를 열 수 없어요 | 열 수 없는 URL |
| onb.sign.title | 작가님의\n사인을 그려주세요 | 그리기 화면 제목 |
| onb.sign.guide | 모든 사진에 함께할 사인이에요.\n자유롭게 남겨주시고, 실제 서명은 피해 주세요. | 그리기 화면 안내 |
| onb.sign.pad-hint | 여기에 손가락으로 그리기 | 그리기 영역 힌트. Android 문구, 마우스 환경은 플랫폼에서 바꿀 수 있다 |
| onb.sign.undo | 되돌리기 | 버튼 |
| onb.sign.clear | 전체 지우기 | 버튼 |
| onb.sign.confirm | 이 사인으로 할래요 | 버튼 |
| onb.sign.preview.title | 이렇게 보여요 | 미리보기 제목 |
| onb.sign.preview.redraw | 다시 그리기 | 미리보기 버튼 |
| onb.sign.preview.start | 시작하기 | 가입 모드 확정 버튼 |
| sign.change.confirm | 사인 변경하기 | 변경 모드 확정 버튼 |
| sign.change.notice | 사인 변경까지 시간이 조금 걸릴 수 있어요 | 변경 모드 미리보기 안내 |
| sign.change.done | 사인 반영까지 시간이 좀 걸릴 수 있어요! | 변경 성공 토스트(D-18) |
| sign.card.title | 사인 재설정 | 설정 사인 카드 제목 |
| sign.card.change | 변경하기 | 설정 사인 카드 버튼 |
| sign.load.error | 사인을 불러오지 못했어요. 다시 시도해 주세요. | 사인 조회 실패. iOS·Android 동일 |
| sign.error.too-large | 사인 이미지가 1MB를 초과했어요. | PNG 1 MiB 초과. iOS·Android 동일 |
| sign.error.network | 네트워크 연결을 확인해 주세요. | 연결 실패·타임아웃 |
| sign.error.invalid | 사용할 수 없는 사인이에요. 다시 그려주세요. | 서버가 사인 이미지를 거절. iOS·Android 동일 |
| sign.error.expired | 로그인 정보가 만료되었어요. 다시 로그인해 주세요. | 401. iOS 문구 채택(Android는 "인증 정보가 만료되었어요."이며 같은 뜻, "로그인" 용어를 쓰는 쪽으로 통일) |
| onb.signup.error.timeout | 사인 처리에 시간이 걸리고 있어요. 다시 시도해 주세요. | 재시도 10회 소진. iOS·Android 동일 |
| onb.signup.error.reupload | 사인을 다시 업로드해 주세요. | 업로드 없음(가입 404), 변경 `SIGNATURE_REUPLOAD_REQUIRED`. iOS·Android 동일 |
| onb.signup.error.generic | 회원가입을 완료하지 못했어요. 다시 시도해 주세요. | 그 밖의 가입 실패. iOS·Android 동일 |
| sign.change.error.not-found | 사인 업로드를 찾을 수 없어요. 다시 시도해 주세요. | 변경 `PUT` 404. iOS·Android 동일 |
| sign.change.error.generic | 사인을 저장하지 못했어요. 다시 시도해 주세요. | 그 밖의 변경 실패. iOS·Android 동일 |

정지 회원 문구 `auth.banned.signature`는 [boot-auth.md](boot-auth.md)의 표를 따른다.

## 플랫폼별 허용 차이

- 약관 문서 보기: iOS 시트, Android 다이얼로그, Flutter·RN 모달, Web 새 탭. 호스트 허용 규칙과 오류 문구는 같아야 한다.
- 가입 오류 표시: iOS 알림 대화상자(제목 "회원가입", 버튼 "확인"), Android 토스트·스낵바. 문구는 같아야 한다.
- 그리기 입력: 터치(손가락), 펜, 마우스 입력은 플랫폼 입력 API대로. 화면에서 획을 그리는 색과 굵기는 자유지만 내보내는 PNG 규격은 같아야 한다.
- 설정 사인 카드의 모양, 그리기·미리보기 화면의 전환 애니메이션은 자유다.
- 토스트와 스낵바 구분은 자유다(표시 시간은 `TOAST_DURATION` 2.5초).

## 범위 밖

- Apple·Google 가입(`authorizationCode`, Apple 임시 인증 정보 흐름).
- 약관 동의 이력의 서버 저장·버전 관리(서버 API에 필드가 없다. API §8.2-1).
- 사인의 해상도·비율·알파에 대한 서버 검증 규칙(SIGN-002는 PNG와 1 MiB만 확정).

## 확인 필요

1. 사인 PNG의 정확한 배치 식(박스 정규화 뒤 패딩 영역에 맞추는 방식, 점 하나일 때 원 반지름). 기존 문서는 "콘텐츠 박스 정규화(최소 0.02)"까지만 적는다. 플랫폼 간 같은 입력에서 같은 PNG가 나오려면 원본 `SignaturePngEncoder` 소스를 확인해 `shared/` 샘플 입력·기대 PNG로 고정해야 한다.
2. 미리보기의 "다시 그리기"가 이전 획을 남겨 둘지 지울지(임시: 지움). 기존 문서에 명시가 없다.
3. 차단된 소셜 계정(`403 FORBIDDEN`)으로 로그인·가입할 때의 전용 문구가 없다(임시: 서버 `message` 표시).
4. 설정의 `400 SIGNATURE_REGISTRATION_REQUIRED`(처리 실패·시간 초과로 재등록이 필요한 상태)에서 보일 안내 문구와 화면. 기존 두 앱에는 이 분기가 없다(임시: 문구 없이 빈 사인 + "변경하기" 유지).
5. `POST /auth/social-signup`의 `400 BUSINESS_ERROR`는 서버가 "이미 가입된 소셜 계정"(탈퇴 회원), "이미 사용된 회원가입 토큰", "사용할 수 없는 사인 이미지"를 같은 코드·상태로 돌려주므로, D-02(message로 분기 금지)에 따라 모두 `sign.error.invalid`로 처리한다. 앞의 둘이 더 정확한 안내를 필요로 하는지 백엔드 확인이 필요하다.
