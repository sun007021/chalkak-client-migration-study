# 공통 인프라 (NET, TIME, ANL)

다섯 클라이언트가 같은 방식으로 서버와 통신하고, 시간을 다루고, 분석 이벤트를 보내기 위한 공통 규칙이다. 서버 오류는 `{errorCode, message}`로 파싱하고 알 수 없는 코드는 `BUSINESS_ERROR`로 취급하며 `message`로 분기하지 않는다. 일반 API는 연결 10초·응답 15초, presigned PUT은 60초이고 멱등 요청만 최대 2회 재시도한다. 401은 single-flight 갱신 후 원 요청을 한 번만 다시 보낸다. 모든 날짜는 KST 기준이고, 분석은 `screen_view`와 `bottom_navigation_selected` 두 이벤트만 수동으로 보낸다. 모든 상호작용 요소에는 5개 플랫폼에서 같은 testID를 단다.

- 관련 규칙: [TOPIC-002, TOPIC-005](../../reference/business-rules/rules/topic.md)(KST 날짜 기준). 이 문서의 나머지는 서비스 정책이 아닌 클라이언트 공통 구현 규칙이다.
- 관련 결정: [D-02](../decisions.md#d-02-서버-오류-분기는-errorcode--http-상태--호출-api로만), [D-09](../decisions.md#d-09-알림-시각-표시), [D-12](../decisions.md#d-12-최초-전시일), [D-17](../decisions.md#d-17-토큰-저장갱신), [D-19](../decisions.md#d-19-기록-탭의-현재-달), [D-20](../decisions.md#d-20-오류-화면과-토스트), [D-21](../decisions.md#d-21-네트워크-타임아웃), [D-22](../decisions.md#d-22-분석-이벤트)
- 관련 열린 질문: [Q-01, Q-03, Q-06, Q-07, Q-13, Q-14, Q-16](../open-questions.md)
- 근거 약어: iOS = [legacy-ios](../../reference/legacy-ios.md), AN = [legacy-android](../../reference/legacy-android.md), API = [api-contract](../../reference/api-contract.md), 테스트 전략 = [strategy](../../testing/strategy.md).
- 이 문서에는 사용자가 직접 보는 화면이 없다. `## 화면`은 공통 UI 요소(토스트, 오류 화면)만 다룬다.

## 화면

### 토스트

- 구성 요소: 한 줄 또는 두 줄 문구, 화면 기준 고정 위치, `toast` 식별자.
- 동작: 화면이 보일 때만 `TOAST_DURATION`(2.5초) 동안 보였다가 사라진다. 사용자 입력을 막지 않는다.

### 오류 화면(콘텐츠가 없을 때)

- 구성 요소: 오류 문구 `error-state`, "다시 시도" 버튼 `retry-button`.
- 동작: 버튼을 누르면 실패한 요청을 처음부터 다시 한다.

### 로딩·빈 상태

- 구성 요소: `loading-indicator`, `empty-state`. 문구는 각 기능 문서가 정한다.

## 요구사항

### NET: 서버 주소와 설정

| ID | 요구사항 | 근거 |
| --- | --- | --- |
| REQ-NET-001 | API 서버 주소는 빌드 설정 값 `API_BASE_URL`(iOS Info.plist 키, Android `local.properties`, Flutter 빌드 인자, RN 환경 변수, Web 빌드 환경 변수) 하나로 지정하며 https 주소만 허용하고 http 주소는 거부한다. | AN §0, iOS §3.4, 테스트 전략 §2 |
| REQ-NET-002 | `API_BASE_URL`이 없거나 올바르지 않으면 코드에 넣어 둔 개발 서버 주소로 대신하지 않고, 요청을 보내지 않은 채 설정 오류 `common.error.config`를 보인다. | iOS §3.4, §5.1-8 |
| REQ-NET-003 | 모든 API 경로는 `/api/v1` 아래에 있으며, 클라이언트가 `API_BASE_URL`(서버 origin)에 `/api/v1`을 붙여 호출한다. [추정: 기존 Android는 base URL이 접두를 포함하는지 분석 문서에 없음] | API §0, AN §3.1 |
| REQ-NET-004 | 빌드 설정만 바꾸어 `API_BASE_URL`을 mock 서버로 돌릴 수 있고, 서버 주소·키·시크릿은 저장소에 커밋하지 않는다. Web은 개발 중 로컬 프록시를 통해 호출한다(Q-01). | 테스트 전략 §2, Q-01, 비밀값 원칙 |

### NET: 오류 바디와 errorCode

| ID | 요구사항 | 근거 |
| --- | --- | --- |
| REQ-NET-005 | 4xx·5xx 응답 본문은 `{ "errorCode": string, "message": string }`로 파싱하고, 본문이 비었거나 JSON이 아니면(게이트웨이 HTML 등) HTTP 상태만 가진 오류로 다룬다. | API §0, §5.1, AN §3.1 |
| REQ-NET-006 | 알 수 없는 `errorCode`(예: `RESOURCE_STATE_CHANGED`, `USER_METRICS_AGGREGATION_IN_PROGRESS`, 앞으로 생길 코드)는 `BUSINESS_ERROR`와 같게 처리하고 앱이 깨지지 않는다. | D-02, API §5.1, §9-1 |
| REQ-NET-007 | `message`(서버의 한국어 문구)는 표시용으로만 쓰고, 어떤 분기 조건에도 `message` 문자열 비교를 쓰지 않는다. | D-02 |
| REQ-NET-008 | `400 BUSINESS_ERROR`처럼 코드만으로 원인을 구분할 수 없는 응답은 호출한 API와 후속 조회로 판정한다(`POST /posts`는 `GET /posts/today`로 다시 확인). 세부 판정은 upload-edit.md가 정한다. | D-02, D-07 |
| REQ-NET-009 | 오류 응답은 아래 "errorCode 공통 동작" 표를 따르고, 화면별 문구는 각 기능 문서가 정한다. | API §5.1 |
| REQ-NET-010 | 응답 JSON의 알 수 없는 키는 무시하고, 필수 필드 누락·타입 불일치·정의되지 않은 enum 값(기능 문서가 허용하지 않은 것)은 "해석 불가 응답"으로 보고 해당 화면의 "불러오지 못했어요" 계열 문구를 보인다. | AN §3.1, iOS §2.5 |

### NET: 타임아웃과 재시도

| ID | 요구사항 | 근거 |
| --- | --- | --- |
| REQ-NET-011 | 일반 API 요청은 연결 10초, 응답 15초 타임아웃을 쓰고, 초과하면 연결 실패와 같은 "네트워크 오류"로 다룬다. | D-21 |
| REQ-NET-012 | presigned `PUT`(게시물 사진, 사인 PNG)은 60초 타임아웃을 쓰고, 인증 헤더 없이 정책이 준 `Content-Type`(사인은 `image/png`)으로 보낸다. | D-21, API §3, §9-5 |
| REQ-NET-013 | `GET`, `PUT`, `DELETE`, `PATCH`와 업로드 정책 발급(`POST /posts/uploads`, `POST /users/me/signature/uploads`)은 연결 실패·타임아웃·5xx일 때 0.5초, 1초 간격의 지수 백오프로 최대 2회 자동 재시도한다. 4xx는 재시도하지 않는다. | D-21 |
| REQ-NET-014 | `POST /posts`, `POST /auth/refresh`, `POST /feedbacks`, `POST /posts/{id}/ai-review`, `POST /auth/social-login`, `POST /auth/social-signup/signature/uploads`, `POST /auth/social-signup`, `POST /auth/logout`은 자동 재시도하지 않는다. | D-21, API §5.1 |
| REQ-NET-015 | 재시도 대상 요청이 `429` 또는 `503`과 `Retry-After`(초)를 받으면 백오프 대신 그 시간만큼 기다린 뒤 같은 재시도 횟수 안에서 다시 보내고, 재시도 대상이 아닌 요청은 기다림 없이 실패 처리한다. | D-21, Q-14 |
| REQ-NET-016 | 비 https로의 리다이렉트는 따라가지 않고 실패 처리한다. | iOS §3.1, AN §3.1 |

### NET: 인증 헤더와 401 갱신

| ID | 요구사항 | 근거 |
| --- | --- | --- |
| REQ-NET-017 | 저장된 access token이 만료되지 않았을 때만 `Authorization: Bearer`로 붙이고, 만료됐거나 토큰이 없으면(게스트) 헤더를 생략한다. presigned `PUT`, `POST /auth/refresh`, `POST /auth/logout`, `GET /banners`에는 붙이지 않는다. | D-17, AN §3.1, iOS §3.1 |
| REQ-NET-018 | `401`이고 `errorCode`가 `UNAUTHORIZED`이며 요청 시점에 저장된 세션(만료되지 않은 refresh token)이 있었던 요청만 토큰 갱신 대상이다(만료된 access token 때문에 헤더를 생략한 요청 포함). | D-17, iOS §3.1 |
| REQ-NET-019 | 동시에 여러 요청이 401을 받아도 `POST /auth/refresh`는 하나만 실행하고(single-flight) 나머지 요청은 그 결과를 기다려 새 토큰으로 다시 보낸다. | D-17, API §2.3-2, AN §3.1 |
| REQ-NET-020 | 401을 받은 사이 다른 요청이 이미 토큰을 갱신해 저장된 토큰이 요청에 쓴 토큰과 달라졌으면 refresh 없이 새 토큰으로 다시 보낸다. | D-17, iOS §3.1, AuthenticatedHTTPClientTests |
| REQ-NET-021 | 갱신에 성공한 뒤 원 요청은 한 번만 다시 보내며, 같은 요청에 갱신을 반복하지 않는다. | D-17, AN §3.1 |
| REQ-NET-022 | `POST /auth/refresh {refreshToken}`는 자동 재시도하지 않고, 성공 응답의 access·refresh 토큰과 만료 시각을 받은 즉시 함께 저장한다. | D-17, API §2.3 |
| REQ-NET-023 | 갱신과 재전송 뒤에도 `401 UNAUTHORIZED`가 남으면 저장된 세션은 지우지 않고 해당 요청을 "인증 필요" 오류로 화면에 전달하며, 화면은 로그인 화면으로 이동한다. [임시 동작: boot-auth.md 확인 필요 5번] | D-17, D-14 |
| REQ-NET-024 | `401 REAUTHENTICATION_REQUIRED`(refresh 응답이든 일반 API 응답이든)는 refresh를 호출하지 않고 세션을 지운 뒤 로그인 화면으로 보내며, refresh가 연결 실패·5xx로 실패하면 그 요청만 실패시키고 로그아웃하지 않는다. 갱신 도중 로그아웃·계정 전환이 있으면 갱신 결과를 저장하지 않는다(REQ-AUTH-028~030). | D-17, API §2.3 |
| REQ-NET-025 | 게스트(토큰 없음) 요청이 받은 401은 갱신을 시도하지 않고 세션을 지우지 않는다. 공개 API(`GET /posts`, `GET /topics`, `GET /banners`)도 만료된 토큰을 보냈다면 401 갱신 흐름을 적용한다. | iOS §3.1, API §0.1 |

### NET: 취소, 오류 표시, 토스트

| ID | 요구사항 | 근거 |
| --- | --- | --- |
| REQ-NET-026 | 화면을 벗어나면 그 화면이 시작한 진행 중 요청을 취소하고, 취소는 오류 화면·토스트·오류 문구로 보이지 않는다. | D-20, iOS §3, AN §2 |
| REQ-NET-027 | 요청을 보낸 뒤 화면 상태(날짜, 정렬, 게시물, 계정)가 바뀌어 늦게 도착한 응답은 현재 화면 상태를 덮어쓰지 않고 버린다. | D-04, iOS §2.4, AN §2.9 |
| REQ-NET-028 | 이미 콘텐츠가 보이는 상태에서 새로고침·다음 페이지·재검증이 실패하면 콘텐츠를 유지하고 토스트만 띄우며, 콘텐츠가 없으면 오류 화면과 "다시 시도" 버튼을 보인다. | D-20, AN §2 |
| REQ-NET-029 | 연결 실패와 타임아웃은 어느 화면에서나 "네트워크 연결을 확인해 주세요."로 통일해서 보인다. | D-20 |
| REQ-NET-030 | 토스트는 화면이 보일 때만 띄우고(백그라운드·화면 전환 중에는 보류하거나 버림), 같은 문구가 연달아 나와도 메시지마다 고유 ID를 붙여 매번 다시 띄우며, 2.5초 후 사라진다. | D-20, AN §2, iOS §1.3 |
| REQ-NET-031 | 토큰, `idToken`, `rawNonce`, `signupToken`, FCM 토큰, presigned URL의 쿼리 문자열은 로그·오류 보고·분석 이벤트에 남기지 않는다. | 비밀값 원칙 |

### NET: testID

| ID | 요구사항 | 근거 |
| --- | --- | --- |
| REQ-NET-032 | 모든 상호작용 요소(버튼, 입력, 스위치, 탭, 목록 행, 링크)와 상태 표시 요소(`loading-indicator`, `empty-state`, `error-state`, `retry-button`, `toast`)에 testID를 단다. | 테스트 전략 §2 |
| REQ-NET-033 | testID는 `<대상>-<종류>` 형태의 소문자 kebab-case(예: `kakao-login-button`, `tab-home`, `feedback-input`, `feedback-counter`)로 정하며 문구·언어·위치에 의존하지 않고, 문구가 바뀌어도 바뀌지 않는다. | 테스트 전략 §2 |
| REQ-NET-034 | 목록 행처럼 같은 요소가 여러 개면 `<대상>-item-{id}`처럼 서버 ID(날짜는 `yyyy-MM-dd`)를 접미로 붙인다. | 테스트 전략 §2 [추정: 접미 형식] |
| REQ-NET-035 | 다섯 플랫폼은 같은 이름을 쓴다: iOS `accessibilityIdentifier`, Android Compose `testTag`(+`testTagsAsResourceId`), Flutter `Semantics(identifier:)`/`Key`, RN `testID`, Web `data-testid`. | 테스트 전략 §2 |
| REQ-NET-036 | 식별자 원본 표는 [testing/testids.md](../../testing/testids.md)(작성 예정)이고, 이 문서군의 화면 구성 요소에 적은 이름이 그 표의 기준 이름이다. | 테스트 전략 §2 |

### TIME: 날짜와 시간

| ID | 요구사항 | 근거 |
| --- | --- | --- |
| REQ-TIME-001 | 서비스의 날짜 판정(오늘, 이번 주, 이번 달, 주제 날짜)과 모든 날짜·시각 표시는 기기 시간대와 관계없이 `Asia/Seoul`(KST, UTC+9, 서머타임 없음)을 쓴다. | TOPIC-002, TOPIC-005, D-09 |
| REQ-TIME-002 | 현재 시각은 주입 가능한 시계(`Clock`/`now()`)에서만 얻어 KST 날짜 유틸이 계산하며, 코드 곳곳에서 시스템 시계를 직접 부르지 않는다. | 테스트 전략 §2 |
| REQ-TIME-003 | API의 날짜 파라미터와 주제 날짜는 `yyyy-MM-dd`(KST 날짜)로 보내고 받는다. | API §0 |
| REQ-TIME-004 | 서버 시각(`Instant`)은 UTC ISO-8601이며 소수 초가 있거나 없는 형식을 모두 파싱한다. | API §0, iOS §2.13 |
| REQ-TIME-005 | 한 주는 일요일부터 토요일이며 요일 머리글은 "일월화수목금토" 순서다. | iOS §2.3, §2.7, AN §2.4 |
| REQ-TIME-006 | 업로드 진입 때는 서버가 준 `topicDate`를 "오늘 주제"의 기준으로 삼고, 그 밖의 화면(제목 수정 버튼, AI 피드백 요청 가능 여부 등)은 KST 오늘과 비교한다. | D-14, D-23, AN §2.7 |
| REQ-TIME-007 | 화면이 보이는 동안 KST 자정이 지나면 날짜에 의존하는 화면(홈 등)이 새 날짜로 다시 불러오고, 앱이 포그라운드로 돌아올 때도 날짜가 바뀌었는지 확인한다. | AN §3.6, D-19 |
| REQ-TIME-008 | 최초 전시일은 상수 `FIRST_TOPIC_DATE`(2026-09-17)이고 전시 날짜 이동·선택의 하한이다. | D-12 |
| REQ-TIME-009 | 날짜 표시 문자열은 아래 "날짜 포맷 목록"의 형식을 쓴다. 기기 시간대를 UTC·America/Los_Angeles로 바꿔도 같은 문자열이 나와야 한다. | D-09 |

### ANL: 분석 이벤트

| ID | 요구사항 | 근거 |
| --- | --- | --- |
| REQ-ANL-001 | 분석 전송은 `AnalyticsTracker` 인터페이스 뒤에 두고 기본 구현은 로그 출력이며, Firebase 설정 파일이 있을 때만 Firebase로 보낸다. 설정 파일이 없으면 분석을 끈 상태로 앱이 정상 실행된다. | D-22, Q-16 |
| REQ-ANL-002 | 플랫폼의 자동 화면 리포팅은 끄고 `screen_view`를 직접 보낸다. | iOS §2.15, AN §0 |
| REQ-ANL-003 | `screen_view`는 파라미터 `screen_name`(아래 표의 이름)과 선택 파라미터 `screen_class`(플랫폼 화면 클래스명)로 보낸다. | AN §3.5, D-22 |
| REQ-ANL-004 | `screen_view`는 화면이 새로 최상위로 보일 때마다 한 번 보낸다(다른 화면에서 돌아왔을 때 포함, 화면 회전·재구성으로는 다시 보내지 않는다). [추정: 회전·재구성 중복 방지] | AN §3.5, D-22 |
| REQ-ANL-005 | 약관 문서 다이얼로그·시트가 열릴 때도 `screen_view(terms_of_service 또는 privacy_policy)`를 보낸다. | AN §3.5, D-22 |
| REQ-ANL-006 | 하단 탭이 선택될 때 `bottom_navigation_selected`를 `destination` 파라미터(`home`, `display`, `record`, `settings`)와 함께 보낸다. | D-22, AN §3.5 |
| REQ-ANL-007 | 위 두 이벤트 외의 도메인 이벤트(업로드, 좋아요, AI 피드백 등)는 보내지 않는다. | AN §3.5, iOS §2.15 |
| REQ-ANL-008 | 분석 이벤트에는 사용자 식별 정보, 토큰, 게시물 내용을 넣지 않으며, 분석 전송 실패는 앱 동작에 영향을 주지 않는다. | 비밀값 원칙 |
| REQ-ANL-009 | 게스트도 같은 이벤트를 보낸다. | D-22 |

## 상태

### 요청 수명 주기

| 상태 | 진입 조건 | 전이 |
| --- | --- | --- |
| 대기 | 요청 생성 | 전송 → 진행 중 |
| 진행 중 | 전송 | 2xx → 성공; 401(갱신 대상) → 토큰 갱신 중; 연결 실패·타임아웃·5xx(재시도 대상, 횟수 남음) → 재시도 대기; 그 밖 → 실패; 화면 이탈 → 취소 |
| 토큰 갱신 중 | 401 `UNAUTHORIZED` | 성공 → 원 요청 1회 재전송(→ 진행 중); `REAUTHENTICATION_REQUIRED` → 세션 삭제 + 로그인 화면; 연결 실패·5xx → 실패(로그인 유지) |
| 재시도 대기 | 백오프(0.5초, 1초) 또는 `Retry-After` | 대기 후 → 진행 중 |
| 성공 | 2xx | |
| 실패 | 위 외 | 화면이 오류 문구 처리 |
| 취소 | 화면 이탈 | 아무 표시 없음 |

### 오류 표시 선택

| 화면에 콘텐츠가 | 새로고침·페이지·재검증 실패 | 결과 |
| --- | --- | --- |
| 있음 | 실패 | 콘텐츠 유지 + 토스트 |
| 없음 | 실패 | 오류 화면 + "다시 시도" |

## API 호출

### errorCode 공통 동작

| errorCode | HTTP | 발생 | 공통 동작 | 자동 재시도 | 사용자 문구 |
| --- | --- | --- | --- | --- | --- |
| `UNAUTHORIZED` | 401 | 인증이 필요한 모든 API, 소셜 로그인 ID Token·nonce 오류, signupToken 오류 | `/auth/*` 밖: REQ-NET-018~023(갱신 후 1회 재전송). `/auth/social-*`: 갱신하지 않고 로그인/가입 화면 규칙 | 갱신 후 1회 | 화면별(boot-auth.md, onboarding-signature.md) |
| `REAUTHENTICATION_REQUIRED` | 401 | `POST /auth/refresh`, 일반 API, `PUT /push-devices/current` | 세션 삭제 → 로그인 화면(refresh 재호출 없음) | 아니오 | 없음(확인 필요 1번은 boot-auth.md) |
| `FORBIDDEN` | 403 | 정지 회원의 쓰기 API, 타인 게시물 수정·삭제, 차단 소셜 계정 로그인·가입 | 같은 요청을 다시 보내지 않고, 호출 API별 D-08 문구 | 아니오 | `auth.banned.*` 또는 화면별 |
| `BUSINESS_ERROR` | 400 | 검증·정책 위반 | 호출 API와 후속 조회로 판정(D-02). 서버 `message`는 기능 문서가 허용한 곳에서만 그대로 표시 | 아니오 | 화면별 |
| `BUSINESS_ERROR` | 404 | 대상 없음(게시물, 주제, 알림, 업로드 등) | "찾을 수 없음" 처리, 목록 재조회 또는 뒤로 | 아니오 | 화면별 |
| `SIGNATURE_PROCESSING_PENDING` | 400 | `POST /auth/social-signup` | 1초 간격 최대 10회 폴링(REQ-ONB-015) | 정해진 폴링 | 소진 시 `onb.signup.error.timeout` |
| `SIGNATURE_REUPLOAD_REQUIRED` | 400 | `PUT /users/me/signature` | 새 업로드 발급부터 다시 | 새 업로드로 | `onb.signup.error.reupload` |
| `SIGNATURE_REGISTRATION_REQUIRED` | 400 | `GET /users/me/signature` | 사인 재등록 유도(임시 동작은 onboarding-signature.md) | 아니오 | 없음(임시) |
| `RESOURCE_STATE_CHANGED`, `USER_METRICS_AGGREGATION_IN_PROGRESS`, 알 수 없는 코드 | 400 | 사용자 API에서는 발생 경로 없음 | `BUSINESS_ERROR`와 같게 | 아니오 | 화면별 |
| `INTERNAL_ERROR` | 500 | 모든 API | 멱등 요청만 REQ-NET-013대로 재시도, 이후 실패 | 조건부 | 화면별 일반 실패 문구 또는 `common.error.generic` |
| (없음, 비 JSON) | 5xx | 게이트웨이 | HTTP 상태로만 분류, `INTERNAL_ERROR`와 같게 | 조건부 | 같음 |
| (없음) | 429, 503 | 서버 코드에서 확인 못함(Q-14) | `Retry-After` 존중(REQ-NET-015) | 조건부 | 같음 |

### 인증 수준 표(요청에 토큰을 붙이는 기준)

| 구분 | API | 토큰 | 게스트 호출 |
| --- | --- | --- | --- |
| 비로그인 허용 | `GET /posts`(목록), `GET /topics` | 있으면 붙임 | 가능 |
| 비로그인 허용(토큰 미사용) | `GET /banners` | 붙이지 않음 | 가능 |
| 인증 없음 | `/auth/*` | 붙이지 않음 | 해당 없음 |
| 인증 필요 | 그 밖의 모든 사용자 API | 붙임 | 호출하지 않음(D-05) |
| 업로드 저장소 | presigned `PUT` | 붙이지 않음 | 해당 없음 |

## 날짜 포맷 목록

모든 포맷은 KST 기준이다.

| 용도 | 형식 | 예 | 근거 |
| --- | --- | --- | --- |
| API 날짜(주제 날짜, 쿼리) | `yyyy-MM-dd` | 2026-10-20 | API §0 |
| API 시각(`Instant`) | UTC ISO-8601, 소수 초 선택 | 2026-10-20T05:00:00Z | API §0 |
| 알림 시각 | `M월 d일 HH:mm` | 10월 20일 14:00 | D-09 |
| 게시물 상세 날짜 라벨 | `M월 d일의 주제` | 10월 20일의 주제 | iOS §2.5, AN §2.7 |
| 홈 오늘 주제 라벨 | `M월 d일 · 오늘의 주제` | 10월 20일 · 오늘의 주제 | AN §2.4 |
| 달력 이미지 파일명 | `chalkak-calendar-yyyy-MM.png` | chalkak-calendar-2026-10.png | AN §2.10 |
| 요일 머리글 | 일 월 화 수 목 금 토 | | iOS §2.7 |
| 날짜 선택 제목 | "날짜 선택" | | iOS §2.7, AN §2.6 |
| 최초 전시일 상수 | `2026-09-17` | | D-12 |

기록 캘린더 헤더의 연월 표기, 전시 날짜 선택 휠의 형식 등 화면 고유 표기는 해당 기능 문서가 정하고, 이 문서의 KST 규칙을 따른다.

## 분석 화면 이름 표

| `screen_name` | 화면 |
| --- | --- |
| `login` | 로그인 |
| `terms` | 약관 동의(가입) |
| `terms_of_service` | 이용약관 문서 |
| `privacy_policy` | 개인정보 처리방침 문서 |
| `onboarding_signature` | 가입 사인 그리기 |
| `onboarding_signature_preview` | 가입 사인 미리보기 |
| `change_signature` | 설정 사인 그리기 |
| `change_signature_preview` | 설정 사인 미리보기 |
| `home` | 홈 |
| `issue` | 배너 웹(ISSUE) |
| `notifications` | 알림함 |
| `notification_detail` | 알림 상세 |
| `display` | 전시 |
| `feed` | 게시물 상세(피드) |
| `record` | 기록 |
| `settings` | 설정 |
| `feedback` | 피드백 |
| `photo_upload` | 사진 업로드(편집 포함) |
| `photo_upload_success` | 업로드 성공 |

## 문구

| 키 | 문구 | 상황 |
| --- | --- | --- |
| common.error.network | 네트워크 연결을 확인해 주세요. | 연결 실패·타임아웃 공통(D-20) |
| common.error.generic | 요청을 처리하지 못했어요. 다시 시도해 주세요. | 화면 고유 문구가 없는 일반 실패. D-16 탈퇴 실패 문구와 같은 문구 |
| common.error.config | API 설정을 확인해 주세요. | `API_BASE_URL` 누락·오류. iOS `APIAuthRepository` 문구 |
| common.retry | 다시 시도 | 오류 화면 버튼. iOS·Android 동일 |
| common.confirm | 확인 | 알림 대화상자 확인 버튼(iOS 관례) |

## 플랫폼별 허용 차이

- HTTP 클라이언트 구현(URLSession, OkHttp/Retrofit, dio/http, fetch/axios)과 인터셉터 방식은 자유다. 위 헤더·재시도·갱신 동작은 같아야 한다.
- 토스트 구현은 iOS 오버레이 뷰, Android 스낵바/토스트, Web 오버레이 어느 쪽이든 된다. 표시 시간 2.5초, 화면 기준 위치, 화면이 보일 때만 표시한다는 점은 같아야 한다.
- `API_BASE_URL` 주입 방식(Info.plist/xcconfig, `local.properties`, `--dart-define`, `.env`, Vite 환경 변수)은 플랫폼 몫이다.
- 분석: Firebase SDK 사용 여부와 `screen_class` 값은 플랫폼 자유다. 이벤트 이름과 `screen_name` 값은 같아야 한다.
- Web은 CORS 때문에 개발 중 프록시를 쓸 수 있고(Q-01), 토큰 보관은 Q-03 임시안을 따른다.
- 취소 구현(Swift Task 취소, Kotlin 코루틴 취소, AbortController 등)은 자유다.

## 범위 밖

- 서버가 429·`Retry-After`를 실제로 쓰는지(Q-14), 앱 버전 전송 경로(Q-13).
- 이미지 캐시 구현(기존 iOS `RemoteImageCache`, Android Coil)은 기능 문서가 아니라 구현 선택이다.
- 네트워크 연결 상태 감시(기존 Android `ConnectivityObserver`는 버전 게이트에만 쓰였다).
- Firebase 설정 파일 확보와 실제 분석 대시보드(Q-16).

## 확인 필요

1. `API_BASE_URL`이 `/api/v1` 접두를 포함하는지 여부는 기존 문서에 없다(임시: origin만 받고 클라이언트가 접두를 붙임). mock 서버·fixture 경로(`shared/mock-server`)와 같이 정해야 한다.
2. `Retry-After`가 매우 클 때의 상한. 임시: 30초를 넘으면 기다리지 않고 실패 처리한다. [추정] (D-21은 "그만큼 기다린다"만 정한다.)
3. `429`가 멱등 요청에 오면 재시도 대상으로 볼지(D-21은 네트워크 오류·5xx만 재시도 대상으로 적고, 429·503의 `Retry-After`만 존중한다고 한다). 임시: `Retry-After`가 있을 때만 재시도 대상에 포함한다.
4. 갱신 후에도 남는 `401 UNAUTHORIZED`에서 세션을 지울지(REQ-NET-023). boot-auth.md 확인 필요 5번과 같은 쟁점이다.
5. `screen_view`의 중복 전송 기준(회전·재구성 중복)과 `screen_class` 값은 기존 문서에 없다.
6. testID 접미 형식(`-item-{id}`)과 레지스트리 파일 이름(`testids.md`)은 이 문서의 제안이며 테스트 쪽 문서와 맞춰야 한다.
