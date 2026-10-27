# 테스트 카탈로그: NET, TIME, ANL

세 영역 모두 화면 밖의 공통 인프라다. NET은 오류 바디 파싱, errorCode·HTTP 분기, 401 갱신(single-flight, 1회 재전송), 재시도 정책, 타임아웃, 취소, 오프라인, UUID·헤더·로그 위생을 다루고, TIME은 KST 날짜 계산과 날짜·시각 표시, 자정 경계, 가짜 시계 주입 규약을 다루며, ANL은 `screen_view`와 `bottom_navigation_selected` 이벤트의 이름·시점·중복·실패 격리를 다룬다. 이 층은 거의 전부 `U`와 `C`(공용 fixture, 요청 모양)로 닫고 실제로 기다리는 테스트를 만들지 않는다([strategy.md §2](../strategy.md#2-테스트하기-쉬운-코드-규칙모든-플랫폼)). 사용자 여정 몇 개만 mock 서버(`E`)로 확인한다. 이 영역의 `A`는 실제 네트워크 끊김(비행기 모드·Wi-Fi 전환)과 배포 웹 CORS 두 건뿐이며 시나리오는 [agent-scenarios/boot-auth.md](../agent-scenarios/boot-auth.md)의 "공통 인프라(NET)" 절(AG-NET-001, AG-NET-002)에 함께 둔다. KST 자정 실시간 통과는 strategy §1이 `A`로 정한 항목이지만 홈·AI 리뷰 담당 영역의 시나리오에서 다루며, 이 문서의 TIME은 가짜 시계로 자정 경계를 모두 닫는다.

표기: fixture 열 경로는 `shared/fixtures/` 아래다. 본문 없는 응답은 빈 파일이거나 `_status` 메타만 있는 파일이다. HTML·XML 본문은 `{"_raw": "...", "_contentType": "text/html"}` 형태로 둔다. 기존 열은 [legacy-ios §4.3](../../reference/legacy-ios.md), [legacy-android §4](../../reference/legacy-android.md)를 가리킨다. `[결정 필요]`는 임시 동작이다.

## NET

| ID | 검증 내용 | 근거 | 구분 | fixture | 기존 |
| --- | --- | --- | --- | --- | --- |
| TC-NET-001 | Given 오류 응답 `{errorCode, message}` / When 파싱 / Then ApiError(status, errorCode, message)로 변환하고 message는 표시용으로만 보존한다 | API§0, D-02 | C | common/error__business-400.json | AN:legacy-android §3.1(ApiError.Http) |
| TC-NET-002 | Given 알 수 없는 errorCode(`SOMETHING_NEW`) / When 파싱·분기 / Then BUSINESS_ERROR로 취급하고 앱이 깨지지 않는다 | D-02, API§5.3 | C+U | common/error__unknown-error-code.json | 신규 |
| TC-NET-003 | Given RESOURCE_STATE_CHANGED, USER_METRICS_AGGREGATION_IN_PROGRESS 같은 사용자 API에 없는 코드 / When 수신 / Then BUSINESS_ERROR와 같게 처리한다 | API§5.1 | C+U | common/error__resource-state-changed.json | 신규 |
| TC-NET-004 | Given errorCode 없는 본문(HTML 게이트웨이, 빈 본문, 비 JSON) / When 5xx·4xx 수신 / Then HTTP 상태로만 분류하고 status는 보존한다 | API§5.1 | C | common/error__bad-gateway-html.json, common/error__empty-body-500.json | AN:legacy-android §3.1(body가 달라도 status 보존) |
| TC-NET-005 | Given 200인데 JSON이 깨짐 / When 디코딩 / Then InvalidResponse이며 크래시하지 않는다 | API§5.1 | C | common/ok__malformed-json.json | AN:AuthDataSourceImplTest, PostRemoteDataSourceImplTest |
| TC-NET-006 | Given 본문이 필요한 API가 200 빈 본문 / When 디코딩 / Then InvalidResponse이다 | API§5.1 | C | common/ok__empty-body.json | AN:PostRemoteDataSourceImplTest(빈 body) |
| TC-NET-007 | Given 204 본문 없음(로그아웃, 탈퇴, 읽음, 설정 PATCH, 기기 등록) / When 처리 / Then 성공이며 본문 디코딩을 시도하지 않는다 | API§1 | C | auth/logout__no-content.json | iOS:SettingsScreenTests L297 |
| TC-NET-008 | Given 응답에 알 수 없는 JSON 필드 / When 디코딩 / Then 무시한다 | API§0 | C | common/ok__extra-fields.json | AN:NetworkModule(ignoreUnknownKeys) |
| TC-NET-009 | Given 알 수 없는 enum 값(알림 type, moderationStatus, AI status 등) / When 디코딩 / Then 앱이 깨지지 않고 각 영역 규칙대로 안전하게 처리한다(알림 type은 목록 표시) | API§1.5 | C+U | common/ok__unknown-enum.json | AN:AiReviewRepositoryImplTest(잘못된 상태=InvalidResponse) |
| TC-NET-010 | Given 필수 필드 누락 / nullable 필드가 null 또는 생략 / When 디코딩 / Then 필수 누락은 InvalidResponse, nullable은 두 형태 모두 허용된다 | API§1 | C | common/ok__missing-required.json | iOS:NotificationInboxTests L191 / AN:AuthDataSourceImplTest |
| TC-NET-011 | Given Content-Type이 JSON이 아닌 200 응답 / When 디코딩 / Then InvalidResponse이다 | API§5.1 | C | common/ok__wrong-content-type.json | 신규 |
| TC-NET-012 | Given 401 UNAUTHORIZED이고 요청에 토큰을 보냈음 / When 처리 / Then refresh 1회 후 원 요청을 정확히 1회 재전송하고 성공 결과를 돌려준다 | D-17, K1 | U | common/error__unauthorized-token-invalid.json, auth/refresh__success.json | iOS:AuthenticatedHTTPClientTests L38 / AN:TokenAuthenticatorTest |
| TC-NET-013 | Given 토큰 없이 보낸 게스트 요청이 401 / When 처리 / Then refresh하지 않고 세션도 지우지 않는다 | D-17 | U | common/error__unauthorized-token-invalid.json | iOS:AuthenticatedHTTPClientTests L7 |
| TC-NET-014 | Given 만료된 access 토큰 / When 요청 / Then Authorization 헤더를 붙이지 않고 서버 401을 받아 갱신 경로로 간다 | D-17 | U | auth/refresh__success.json | AN:AuthorizationHeaderInterceptorTest |
| TC-NET-015 | Given 동시에 여러 요청이 401 / When 처리 / Then refresh 요청은 정확히 1건이고 모든 원 요청이 새 토큰으로 1회씩 재전송된다 | D-17, API§2.3-2 | U | auth/refresh__success.json | iOS:AuthenticatedHTTPClientTests L38 / AN:TokenAuthenticatorTest(동시 401) |
| TC-NET-016 | Given 401을 받은 사이 다른 요청이 이미 토큰을 갱신함 / When 처리 / Then refresh 없이 새 토큰으로 재시도한다 | D-17 | U | auth/refresh__success.json | iOS:AuthenticatedHTTPClientTests L210 / AN:TokenAuthenticatorTest(선행 갱신 재사용) |
| TC-NET-017 | Given 재전송한 요청이 다시 401 / When 처리 / Then 더 재전송하지 않고 오류를 돌려준다(원 요청 1회만 재전송) | D-17 | U | common/error__unauthorized-token-invalid.json | AN:TokenAuthenticatorTest(재시도 실패 시 중단) |
| TC-NET-018 | Given 재전송한 요청이 REAUTHENTICATION_REQUIRED / When 처리 / Then 현재 세션을 지우고 로그인 화면 이벤트를 낸다 | D-17 | U | auth/refresh__reauthentication-required.json | iOS:AuthenticatedHTTPClientTests L142 |
| TC-NET-019 | Given 늦게 도착한 REAUTH 응답인데 그 사이 토큰이 이미 갱신됨 / When 처리 / Then 새 토큰으로 1회 재시도하고 세션은 지우지 않는다 | D-17, 늦은 응답 | U | auth/refresh__reauthentication-required.json | iOS:AuthenticatedHTTPClientTests L101 |
| TC-NET-020 | Given 일반 API가 401 REAUTHENTICATION_REQUIRED / When 처리 / Then refresh를 부르지 않고 세션을 지운 뒤 로그인 화면으로 간다 | D-17 | U | auth/refresh__reauthentication-required.json | iOS:AuthenticatedHTTPClientTests L181 / AN:TokenAuthenticatorTest |
| TC-NET-021 | Given refresh 요청 자체가 REAUTHENTICATION_REQUIRED(K2, K3, K4) / When 처리 / Then 세션을 지우고 로그인 화면으로 간다 | D-17, K2~K4 | U | auth/refresh__reauthentication-required.json | iOS:AuthenticatedHTTPClientTests L248 / AN:AuthTokenRefresherTest |
| TC-NET-022 | Given refresh 성공 / When 저장 / Then 새 access와 새 refresh를 함께 저장하고 만료 시각을 응답 초 값으로 계산하며, 저장 전에는 원 요청을 재전송하지 않는다 | API§2.3-3 | U | auth/refresh__success.json | AN:AuthTokenRefresherTest |
| TC-NET-023 | Given refresh 네트워크 오류·타임아웃 / When 처리 / Then 그 요청만 실패하고 로그아웃하지 않으며 refresh를 자동 재시도하지 않는다(같은 토큰 재전송은 재사용 감지 위험) | D-17, D-21 | U | - | AN:AuthTokenRefresherTest(TransientFailure) |
| TC-NET-024 | Given refresh가 5xx / When 처리 / Then 일시 실패로 보고 세션을 유지한다 | D-17 | U | auth/refresh__internal-error.json | AN:AuthTokenRefresherTest(5xx=일시 실패) |
| TC-NET-025 | Given refresh 응답에 필수 토큰 필드 누락 / When 처리 / Then 일시 실패로 보고 기존 세션을 덮어쓰지 않는다 | D-17 | C+U | auth/refresh__missing-token-field.json | AN:AuthTokenRefresherTest(토큰 누락) |
| TC-NET-026 | Given refresh가 400(본문 비어 있음) / When 처리 / Then 클라이언트 버그로 기록하고 요청만 실패시키며 로그아웃하지 않는다 | API§2.3-5 | U | common/error__business-400.json | 신규 |
| TC-NET-027 | Given refresh 도중 로그아웃 또는 계정 전환 / When refresh 응답 도착 / Then 새 토큰을 저장하지 않고 세션을 되살리지 않는다 | D-17 | U | auth/refresh__success.json | AN:TokenAuthenticatorTest(갱신 중 로그아웃/계정 전환) |
| TC-NET-028 | Given refresh 중 원 요청의 화면이 사라짐(취소) / When 처리 / Then 취소된 요청은 오류 없이 끝나고 다른 대기 요청을 위한 refresh는 계속된다 | D-20 | U | auth/refresh__success.json | 신규 |
| TC-NET-029 | Given 한 번 쓴 refresh token / When 코드 검토·테스트 / Then 클라이언트는 같은 refresh token을 두 번 보내지 않는다(single-flight 호출 기록 검증) | K2 | U | auth/refresh__success.json | AN:TokenAuthenticatorTest |
| TC-NET-030 | Given 토큰을 보낸 비로그인 허용 API(GET /posts, GET /topics) / When 만료 토큰으로 401 / Then 일반 API와 같게 refresh 후 재전송한다 | API§0.1, B7 | U | common/error__unauthorized-token-invalid.json | 신규 |
| TC-NET-031 | Given GET /banners 요청 / When 헤더 확인 / Then Authorization을 붙이지 않고 401이 와도 갱신하지 않는다 | BANNER-006, B6, B7 | C | common/error__unauthorized-token-invalid.json | iOS:BannerAPIClientTests L74 / AN:NetworkModuleTest |
| TC-NET-032 | Given 403 FORBIDDEN / When 처리 / Then 호출한 API 컨텍스트의 문구(D-08)를 쓰고 같은 요청을 다시 보내지 않으며 정지 상태를 로컬에 캐시하지 않는다 | D-08, API§0.1 | U | common/error__forbidden-banned.json | 신규 |
| TC-NET-033 | Given 필터 단계 403 "접근 권한이 없습니다." / When 수신 / Then 일반 오류 문구로 처리하고 크래시하지 않는다 | API§0 | C+U | common/error__forbidden-no-permission.json | 신규 |
| TC-NET-034 | Given 404 BUSINESS_ERROR "요청한 API를 찾을 수 없습니다." / When 수신 / Then 클라이언트 오류로 일반 문구 처리한다 | API§0 | C | common/error__not-found-api.json | 신규 |
| TC-NET-035 | Given 400 "date: 요청 값의 형식이 올바르지 않습니다." 같은 검증 오류 / When 수신 / Then message는 로그로만 남기고 사용자에게는 영역별 일반 문구를 보인다 | API§0, T4 | C+U | common/error__validation-format.json | 신규 |
| TC-NET-036 | Given 500 INTERNAL_ERROR / When 수신 / Then 일반 오류 문구와 "다시 시도"를 보여 준다 | API§5.1 | U | common/error__internal-500.json | AN:legacy-android §3.3 |
| TC-NET-037 | Given 멱등 요청(GET, PUT, DELETE, PATCH, 업로드 정책 발급 POST) / When 네트워크 오류·5xx / Then 0.5초, 1초 지수 백오프로 최대 2회 재시도하고 총 3시도 뒤 실패를 돌려준다(가상 시계로 대기 시간 검증) | D-21 | U | common/error__internal-500.json | 신규 |
| TC-NET-038 | Given 비멱등 POST(POST /posts, /auth/refresh, /feedbacks, /posts/{id}/ai-review, 그리고 /auth/social-login, /auth/social-signup/signature/uploads, /auth/social-signup를 포함한 모든 /auth/social-*) / When 네트워크 오류·5xx / Then 자동 재시도 0회이다. 표 기반으로 요청 목록을 전부 돈다 | D-21 | U | common/error__internal-500.json | AN:legacy-android §2.9(aiReviewClient retry 끔) |
| TC-NET-039 | Given 멱등 요청이라도 4xx(400, 403, 404) / When 수신 / Then 재시도하지 않는다 | D-21 | U | common/error__business-400.json | 신규 |
| TC-NET-040 | Given 503 또는 429에 Retry-After 초 값(예 2) 또는 HTTP 날짜 / When 멱등 요청 / Then 그만큼 기다린 뒤 재시도한다 | D-21, Q-14 | U | common/error__service-unavailable-503.json, common/error__rate-limited-429.json | 신규 |
| TC-NET-041 | Given Retry-After가 음수, 비숫자, 과거 날짜, 매우 큼 / When 처리 / Then 무시하고 기본 백오프를 쓰거나 상한(구현 정의, 5개 플랫폼 상수 일치)을 넘지 않는다 | D-21 | U | common/error__service-unavailable-503-bad-retry-after.json | 신규 |
| TC-NET-042 | Given 429가 비멱등 POST에 옴 / When 처리 / Then 재시도 없이 일반 오류 문구를 보인다 | D-21 | U | common/error__rate-limited-429.json | 신규 |
| TC-NET-043 | Given 일반 API / When 연결 지연 / Then 연결 10초, 응답 15초 타임아웃이 적용되고 14.9초 응답은 성공, 15.1초는 실패로 본다(가상 시계 또는 설정값 검증) | D-21 | U | - | 신규 (iOS 60초, OkHttp 10초 기본값은 따르지 않음) |
| TC-NET-044 | Given presigned PUT / When 업로드 / Then 타임아웃은 60초이고 Authorization 헤더와 앱 공통 헤더가 없다 | D-21, API§3 | C+U | common/presigned-put__ok.json | AN:OkHttpPostImageUploaderTest |
| TC-NET-045 | Given 타임아웃·연결 실패·DNS 실패·TLS 오류 / When 각 플랫폼 예외(iOS URLError, OkHttp IOException, Dart SocketException, fetch TypeError 등) / Then 모두 같은 Network 오류로 매핑되어 "네트워크 연결을 확인해 주세요."를 보인다 | D-20 | U | - | iOS:legacy-ios §3.3(URLError) / AN:ApiError.Network |
| TC-NET-046 | Given 이미 콘텐츠가 보이는 화면의 새로고침이 오프라인으로 실패 / When 처리 / Then 콘텐츠를 유지하고 토스트만 띄운다 | D-20 | U+W | - | AN:legacy-android §2 공통 규약 |
| TC-NET-047 | Given 콘텐츠가 없는 화면이 오프라인으로 실패 / When 처리 / Then 오류 화면과 "다시 시도"가 보이고 온라인 복귀 뒤 다시 시도하면 성공한다 | D-20 | U+E | common/error__internal-500.json | 신규 |
| TC-NET-048 | Given 요청 도중 Task/코루틴/Future/AbortController 취소 / When 처리 / Then 오류 화면·토스트가 없고 취소는 Network 오류로 바뀌지 않으며 상위로 전파된다 | D-20 | U | - | iOS:BannerAPIClientTests L133, AIReviewAPIClientTests L139, SettingsScreenTests L325 / AN:CancellationException 재던지기 |
| TC-NET-049 | Given 재시도 백오프 대기 중 취소 / When 처리 / Then 즉시 중단하고 추가 요청을 보내지 않는다 | D-20, D-21 | U | - | 신규 |
| TC-NET-050 | Given base URL / When 구성 / Then https만 허용하고 http 또는 빈 값은 구성 오류로 거부하며, https에서 http로의 리다이렉트는 따르지 않는다 | API§0 | U | - | AN:NetworkModuleTest(HTTPS 허용/HTTP 거부) / iOS:legacy-ios §3.1 |
| TC-NET-051 | Given http(비 TLS) 요청 / When 헤더 구성 / Then Authorization을 붙이지 않는다 | NET | C | - | AN:AuthorizationHeaderInterceptorTest |
| TC-NET-052 | Given 경로·바디·쿼리에 UUID를 넣음 / When 요청 / Then 소문자 정규형으로 보낸다(Swift `UUID.uuidString`은 대문자라 변환 필요, 서버는 소문자만 허용 → 400 "ID 형식이 올바르지 않습니다.") | API§0 | C | - | 신규 |
| TC-NET-053 | Given 쿼리 구성 / When date, page, pageSize, sort, randomSeed / Then date는 yyyy-MM-dd ASCII, 정수는 로캘과 무관한 10진수, sort는 소문자이다 | API§1.3, F2 | C | - | AN:TopicRemoteDataSourceImplTest, PostRemoteDataSourceImplTest |
| TC-NET-054 | Given 바디가 있는 요청 / When 헤더 확인 / Then Content-Type application/json, Accept JSON이다. 본문 없는 POST/PUT/DELETE는 본문을 보내지 않는다 | API§1 | C | - | iOS:AIReviewAPIClientTests L10 |
| TC-NET-055 | Given 네트워크 로그 / When 로그 sink를 Fake로 바꿔 실행 / Then accessToken, refreshToken, idToken, rawNonce, fcmToken, signupToken, presigned URL의 쿼리 문자열이 기록되지 않는다 | 비밀값 정책 | U | - | 신규 |
| TC-NET-056 | Given 같은 화면에서 느린 요청 A 뒤에 빠른 요청 B / When A가 B보다 늦게 도착 / Then 공용 stale 응답 가드(generation, 요청 토큰)가 A를 버린다 | 늦은 응답 | U | - | iOS:DisplayFeatureTests L21 계열, NotificationInboxTests L113 / AN:RecordViewModelTest(늦은 응답) |
| TC-NET-057 | Given 계정 A의 요청이 진행 중 / When 계정 전환 / Then A의 응답은 B의 어떤 상태·캐시·인증 저장소에도 반영되지 않는다 | 계정 전환 | U | - | AN:TokenAuthenticatorTest, iOS:NotificationSettingsTests L318 |
| TC-NET-058 | Given 구성 값(API_BASE_URL)이 mock 서버 주소로 바뀐 빌드 / When 요청 / Then 모든 API가 그 주소로만 나가고 개발 서버 주소가 코드에 하드코딩된 폴백이 없다 | strategy §2 | U | - | iOS:legacy-ios §3.4(폴백 하드코딩은 따르지 않음) |
| TC-NET-059 | Given mock 서버에서 access 만료 후 첫 API가 401, refresh 200, 재시도 200 / When 사용자가 알림 목록을 엶 / Then 사용자는 오류 없이 목록을 본다 | K1 | E | auth/refresh__success.json, notification/notifications__page1.json | 신규 |
| TC-NET-060 | Given mock 서버를 끄거나 응답을 지연 / When 홈을 새로고침한 뒤 서버를 복구 / Then 오류 화면 또는 토스트가 나온 뒤 "다시 시도"로 복구된다 | D-20 | E | common/error__internal-500.json | 신규 |
| TC-NET-061 | Given 실기기·에뮬레이터의 실제 비행기 모드 또는 Wi-Fi 전환 / When 요청 중과 요청 후 전환 / Then 오류가 문구로 안내되고 복구 뒤 정상 동작하며 앱이 멈추지 않는다 | D-20 | A | - | 신규 |
| TC-NET-062 | Given 배포 웹 오리진 / When 브라우저에서 개발 서버 API 호출 / Then CORS가 허용되어 호출이 성공한다(불허면 Q-01 결과로 프록시 사용) | Q-01 | A | - | 신규 (Web 한정) |

## TIME

| ID | 검증 내용 | 근거 | 구분 | fixture | 기존 |
| --- | --- | --- | --- | --- | --- |
| TC-TIME-001 | Given UTC 2026-10-26T15:00:00Z / When KST 오늘 계산 / Then 2026-10-27이다 | TOPIC-002, T6 | U | - | AN:TopicRemoteDataSourceImplTest |
| TC-TIME-002 | Given UTC 2026-10-26T14:59:59Z / When KST 오늘 계산 / Then 2026-10-26이다 | T7 | U | - | 신규 |
| TC-TIME-003 | Given 기기 시간대 UTC, America/Los_Angeles, Pacific/Kiritimati(+14), Pacific/Pago_Pago(-11), Asia/Seoul / When 같은 순간의 KST 날짜 계산 / Then 모두 같은 날짜이다 | TOPIC-002 | U | - | 신규 |
| TC-TIME-004 | Given 서머타임이 있는 기기 시간대의 전환일 / When KST 날짜 계산 / Then 영향 없이 KST 규칙으로 계산한다 | TOPIC-002 | U | - | 신규 |
| TC-TIME-005 | Given 아랍어, 태국어(불교력), 페르시아어 로캘 / When 날짜 문자열 생성 / Then 그레고리력 ASCII yyyy-MM-dd로 만든다 | API§0 | U | - | 신규 |
| TC-TIME-006 | Given 홈·전시·주제 요청 / When date 쿼리 확인 / Then KST 오늘 날짜가 들어간다 | T1, T6 | C | time/topics__open.json | AN:TopicRemoteDataSourceImplTest(KST 날짜 쿼리) |
| TC-TIME-007 | Given 날짜 선택 UI / When 오늘 다음 날 선택 시도 / Then 선택할 수 없고 서버에 미래 날짜 요청이 나가지 않는다 | T2 | U+W | time/topics__future-400.json | AN:DisplayDatePickerSheetTest |
| TC-TIME-008 | Given 기기 시계가 KST보다 1시간 빠름 / When 서버가 400 "미래의 주제는 조회할 수 없습니다." / Then 크래시 없이 기존 전시를 유지하고 오류 토스트를 보인다 | T2, T7 | U | time/topics__future-400.json | 신규 |
| TC-TIME-009 | Given 날짜 이동 하한 FIRST_TOPIC_DATE=2026-09-17 / When 2026-09-17, 2026-09-16로 이동 / Then 09-17은 가능, 09-16은 막힌다 | D-12 | U | time/topics__not-found.json | AN:DisplayViewModelTest, DisplayDatePickerSheetTest |
| TC-TIME-010 | Given 해당 날짜에 주제 없음(404) / When 이동 / Then 기존 전시를 유지하고 빈 상태를 보인다 | D-12, T3 | U | time/topics__not-found.json | iOS:DisplayFeatureTests L289 |
| TC-TIME-011 | Given 날짜 피커에서 31일을 30일 달로 이동 / When 보정 / Then 말일로 보정한다. 윤년 2028-02-29는 유효, 2027-02-29는 02-28로 보정한다 | D-12 | U | - | AN:DisplayDatePickerSheetTest(말일 보정) |
| TC-TIME-012 | Given 주간 기록 / When 2026-10-25(일)~10-31(토) 주와 2026-12-27(일)~2027-01-02(토) 주 계산 / Then 일요일 시작이고 연말 경계 주는 두 해에 걸치며 캘린더 요청이 걸친 월 모두에 나간다 | POST-009, C3 | U | time/calendar__cross-year.json | AN:HomeViewModelTest(주간 경계, 연말) |
| TC-TIME-013 | Given 월 경계가 있는 주(10월 말~11월 초) / When 주간 기록 로드 / Then 두 월의 데이터를 합쳐 요일에 맞게 배치한다 | POST-009 | U | time/calendar__cross-month.json | AN:HomeViewModelTest |
| TC-TIME-014 | Given 앱이 포그라운드에서 KST 23:59:59 → 00:00:00을 넘김 / When 가상 시계 전진 / Then 홈이 전체 재로드되고 오늘 주제·주간 기록이 새 날짜 기준이 된다 | TOPIC-002, D-19 | U | time/topics__open.json | AN:HomeViewModelTest(KST 자정) |
| TC-TIME-015 | Given 앱이 백그라운드에서 자정을 넘기고 복귀 / When 복귀 / Then 홈과 기록이 새 날짜로 재계산·재로드된다 | D-19 | U | time/topics__open.json | AN:HomeViewModelTest(자정 이후 첫 표시) |
| TC-TIME-016 | Given 기록 탭 / When 10/31 23:59 → 11/1 00:00(KST)을 넘기고 진입·복귀 / Then 현재 달이 11월로 다시 계산된다. 월 목록에 현재 달이 없어도 선택지에 넣는다 | D-19 | U | time/calendar__months-without-current.json | iOS:RecordFeatureTests L63 [차이: AN:INITIAL_RECORD_MONTH 고정은 따르지 않음] |
| TC-TIME-017 | Given 업로드 진입이 자정 직전 / When 자정이 지난 뒤 제출 / Then 진입 때 고정한 topicDate로 제출한다(UPL 영역 TC와 같은 시계 규약) | D-14 | U | time/posts-today__cross-midnight.json | AN:PhotoUploadViewModelTest(자정 후 진입 주제) |
| TC-TIME-018 | Given 참여 기간이 10/27 20:00~10/28 20:00인 주제, now=10/28 01:00 KST / When GET /posts/today / Then 응답 topicDate(10/27)를 그대로 쓰고 클라이언트가 오늘 날짜로 덮어쓰지 않는다 | T11 | C+U | time/posts-today__cross-midnight.json | 신규 |
| TC-TIME-019 | Given 주제 phase BEFORE_OPEN/OPEN/CLOSED / When now가 startsAt 정각, endsAt−1ms, endsAt 정각 / Then 클라이언트가 직접 계산하지 않고 서버 phase를 신뢰하며 시작 이상 OPEN, 종료 이상 CLOSED는 서버 값 그대로 표시된다 | T8~T10 | C+U | time/topics__open.json, time/topics__before-open.json, time/topics__closed.json | 신규 |
| TC-TIME-020 | Given 인접한 두 주제 A.end==B.start, now==그 시각 / When 홈 / Then 서버가 준 B(OPEN)를 표시한다 | T12 | U | time/posts-today__adjacent-topic.json | 신규 |
| TC-TIME-021 | Given 주제 없는 시간대 / When GET /posts/today 404 / Then NoOpenTopic 상태로 표시한다 | T13 | U | time/posts-today__no-topic.json | AN:HomeViewModelTest |
| TC-TIME-022 | Given 게시물 상세 topicDate가 오늘(KST) / 어제 / 자정 직전·직후 / When 제목 수정 버튼 판정 / Then 오늘인 경우에만 보인다 | D-23 | U | - | AN:FeedViewModelTest(오늘 주제 판정) |
| TC-TIME-023 | Given 날짜 라벨 / When 표시 / Then "M월 d일의 주제"와 "M월 d일 · 오늘의 주제"에서 월·일 0 패딩이 없다(1월 5일, 12월 31일) | D-09 | U | - | iOS:legacy-ios §2.5 / AN:legacy-android §2.7 |
| TC-TIME-024 | Given 알림 createdAt / When 표시 / Then "M월 d일 HH:mm" KST 24시간제이고 연도는 표시하지 않으며 12시간제·시스템 로캘 영향이 없다 | D-09 | U | notification/notifications__kst-boundary.json | AN:legacy-android §2.13 |
| TC-TIME-025 | Given Instant 문자열 / When 파싱 / Then `Z`, `+00:00`, 소수초 없음, 3자리, 6자리, 9자리 모두 같은 순간으로 파싱된다 | API§0 | C | time/instants__variants.json | iOS:legacy-ios §2.13(ISO8601 소수초 유무) |
| TC-TIME-026 | Given 파싱할 수 없는 시각 문자열 / When 디코딩 / Then 해당 응답이 InvalidResponse이거나 필드가 null로 처리되고 크래시하지 않는다 | API§0 | C | time/instants__invalid.json | 신규 |
| TC-TIME-027 | Given 업로드 URL 만료 판정 / When 발급 후 expiresIn−5초 직전·정각, 기기 시계를 앞뒤로 조정 / Then 단조 시계(monotonic) 기준이라 시스템 시각 변경에 영향받지 않는다 | overview §6 UPLOAD_URL_SAFETY_MARGIN | U | - | AN:PhotoUploadViewModelTest(nanoTime) |
| TC-TIME-028 | Given 기기 시계가 하루 빠름 / When access 만료 시각을 로컬 비교 / Then 만료로 오판해 Authorization 헤더를 생략하더라도 401 → refresh 경로로 정상 복구된다 | D-17 | U | auth/refresh__success.json | 신규 |
| TC-TIME-029 | Given 모든 now() 사용 / When 소스 정적 검사(`shared/scripts/check-clock-usage`) / Then 시스템 시계를 직접 부르지 않고 Clock 인터페이스를 거친다(허용 목록 외 호출 0건) | strategy §2 | U | - | 신규 |
| TC-TIME-030 | Given 가짜 시계 / When 스플래시 700ms, 토스트 2.5초, 폴링 3초·300초, 가입 재시도 1초, 업로드 만료 5초 마진 테스트 / Then 실제로 기다리지 않고 가상 시간 전진만으로 끝난다(테스트 총 시간 상한 검사) | strategy §2 | U | - | iOS:WaitUntilTests L5~L42 |

## ANL

| ID | 검증 내용 | 근거 | 구분 | fixture | 기존 |
| --- | --- | --- | --- | --- | --- |
| TC-ANL-001 | Given AnalyticsTracker 인터페이스 / When 화면 진입 / Then 화면 코드는 구체 SDK가 아니라 인터페이스에 `screen_view`를 보낸다(Fake로 수집 가능) | D-22 | U | - | 신규 |
| TC-ANL-002 | Given 허용 목록 / When 구현 상수 확인 / Then screen_name은 login, terms, terms_of_service, privacy_policy, onboarding_signature, onboarding_signature_preview, change_signature, change_signature_preview, home, issue, notifications, notification_detail, display, feed, record, settings, feedback, photo_upload, photo_upload_success 19종이고 `shared/constants.json`과 철자까지 같다 | D-22 | U | anl/events__expected-screen-names.json | AN:legacy-android §3.5 / iOS:legacy-ios §2.15 |
| TC-ANL-003 | Given 비로그인 시작 흐름 / When 로그인, 약관, 사인, 미리보기 진입 / Then login, terms, onboarding_signature, onboarding_signature_preview가 진입 때마다 1회씩 전송된다 | D-22 | U+E | anl/events__journey-signup.json | 신규 |
| TC-ANL-004 | Given 설정에서 사인 변경 / When 두 화면 진입 / Then change_signature, change_signature_preview가 1회씩 전송된다 | D-22 | U | - | 신규 |
| TC-ANL-005 | Given 메인 탭 4개 / When 각 탭 진입 / Then home, display, record, settings가 1회씩 전송된다 | D-22 | U+E | anl/events__journey-tabs.json | AN:ChalkakNavHostTest 인접 |
| TC-ANL-006 | Given 홈에서 알림, 알림 상세, 배너 웹 진입 / When 각 화면 / Then notifications, notification_detail, issue가 전송된다 | D-22 | U+E | - | AN:ChalkakNavHostTest(이슈 웹 screen_view) |
| TC-ANL-007 | Given 게시물 상세(Feed, FeedById 푸시 진입 포함) / When 진입 / Then 진입 경로와 관계없이 `feed`로 전송된다 | D-22 | U | - | AN:legacy-android §3.5(Feed/FeedById 공통) |
| TC-ANL-008 | Given 업로드와 성공 화면 / When 진입 / Then photo_upload, photo_upload_success가 1회씩 전송된다 | D-22 | U | - | 신규 |
| TC-ANL-009 | Given 피드백 화면 / When 진입 / Then feedback이 전송된다 | D-22 | U | - | 신규 |
| TC-ANL-010 | Given 가입 약관 화면과 약관 문서 시트 / When 각각 표시 / Then 가입 약관 화면은 `terms`, 문서(서비스 이용약관, 개인정보 처리방침)는 가입·설정 어디서든 `terms_of_service`, `privacy_policy`로 구분된다 | D-22 | U | - | AN:legacy-android §3.5 / iOS:legacy-ios §2.15 |
| TC-ANL-011 | Given 약관 문서 시트가 열림 / When 닫음 / Then 표시 시 1회만 전송하고 닫을 때 이전 화면 이벤트를 다시 보내지 않는다 | D-22 | U | - | AN:legacy-android §3.5(다이얼로그 표시 시) |
| TC-ANL-012 | Given screen_view / When 파라미터 확인 / Then screen_name 필수이고 screen_class는 플랫폼 선택값이며 그 외 개인정보·토큰·ID 파라미터가 없다 | D-22 | U | - | AN:FirebaseAnalyticsTracker |
| TC-ANL-013 | Given 탭 선택 / When 홈, 전시, 기록, 설정을 각각 선택 / Then `bottom_navigation_selected {destination: home / display / record / settings}`가 1회씩 전송된다 | D-22 | U+E | anl/events__journey-tabs.json | iOS:legacy-ios §2.15 / AN:legacy-android §3.5 |
| TC-ANL-014 | Given 이미 선택된 탭을 재선택 / When 처리 / Then 전송 여부 [결정 필요: 기존 앱에 명시 없음. 임시로 선택 동작마다 전송하며 open-questions에 올린다] | D-22 | U | - | 신규 |
| TC-ANL-015 | Given 가운데 업로드 버튼 / When 탭 / Then bottom_navigation_selected를 보내지 않는다(탭이 아님, destination 값은 4종뿐) | D-22 | U | - | 신규 |
| TC-ANL-016 | Given 게스트 제한 토스트로 막힌 기록 탭 / When 탭 / Then bottom_navigation_selected 전송 여부 [결정 필요: 이동하지 않았으므로 미전송을 임시안으로 한다] | D-05, D-22 | U | - | 신규 |
| TC-ANL-017 | Given 화면에서 뒤로가기로 이전 화면 복귀 / When 복귀 / Then 복귀한 화면의 screen_view가 다시 전송된다(백스택 변경마다 전송) | D-22 | U | - | AN:legacy-android §3.5 |
| TC-ANL-018 | Given Compose recomposition, React 재렌더, Flutter rebuild, SwiftUI body 재평가 / When 같은 화면이 여러 번 그려짐 / Then screen_view는 1회만 나간다 | D-22 | W+U | - | 신규 |
| TC-ANL-019 | Given 자동 screen reporting / When 설정 검사 / Then iOS FirebaseAutomaticScreenReportingEnabled=false, Android 자동 보고 비활성, Flutter·RN·Web에도 자동 화면 추적이 없다 | D-22 | U | - | iOS:legacy-ios §2.15 / AN:legacy-android §0 |
| TC-ANL-020 | Given Firebase 설정 파일이 없는 빌드(Q-16) / When 시작·화면 이동 / Then 기본 구현이 로그 출력으로 동작하고 크래시하지 않는다 | D-22, Q-16 | U | - | 신규 |
| TC-ANL-021 | Given tracker가 예외를 던짐 / When 화면 진입 / Then 화면 흐름과 UI에 영향이 없고 앱이 계속 동작한다 | D-22 | U | - | 신규 |
| TC-ANL-022 | Given 게스트와 회원 / When 같은 화면 진입 / Then 둘 다 같은 screen_view를 보낸다(사용자 식별자를 설정하지 않는다) | D-22 | U | - | 신규 |
| TC-ANL-023 | Given 5개 클라이언트 / When 이벤트 이름·파라미터 키를 `shared/constants.json` 분석 항목과 대조 / Then 모두 일치한다 | D-22 | U | - | 신규 |
| TC-ANL-024 | Given 대표 여정(앱 시작 → 로그인 → 게스트 → 홈 → 전시 → 설정) / When Maestro·Playwright 실행 후 tracker 로그 수집 / Then 이벤트 순서가 기대 파일과 같다 | D-22 | E | anl/events__journey-tabs.json | 신규 |
| TC-ANL-025 | Given Web SPA 라우트 변경 / When 화면 이동 / Then 라우트 변경마다 screen_view가 전송되고 초기 로드의 자동 page_view는 비활성이다 | D-22 | U+E | - | 신규 (Web 한정) |

## 필요 fixture 목록

| 파일명 (shared/fixtures/ 기준) | 메서드 경로 | HTTP | 내용 요지 |
| --- | --- | --- | --- |
| common/error__business-400.json | 임의 | 400 | BUSINESS_ERROR "조회 조건이 올바르지 않습니다." |
| common/error__unknown-error-code.json | 임의 | 400 | errorCode "SOMETHING_NEW" |
| common/error__resource-state-changed.json | 임의 | 400 | RESOURCE_STATE_CHANGED |
| common/error__unauthorized-token-invalid.json | 임의 인증 API | 401 | UNAUTHORIZED "유효하지 않은 인증 정보입니다." |
| common/error__forbidden-banned.json | 쓰기 API | 403 | FORBIDDEN "차단된 회원입니다." |
| common/error__forbidden-no-permission.json | 임의 | 403 | FORBIDDEN "접근 권한이 없습니다." |
| common/error__not-found-api.json | 임의 | 404 | BUSINESS_ERROR "요청한 API를 찾을 수 없습니다." |
| common/error__validation-format.json | GET /topics | 400 | BUSINESS_ERROR "date: 요청 값의 형식이 올바르지 않습니다." |
| common/error__internal-500.json | 임의 | 500 | INTERNAL_ERROR "서버에서 요청을 처리하지 못했습니다." |
| common/error__empty-body-500.json | 임의 | 500 | 빈 본문 |
| common/error__bad-gateway-html.json | 임의 | 502 | HTML 본문(`_raw`, `_contentType`) |
| common/error__service-unavailable-503.json | 임의 | 503 | Retry-After: 2 |
| common/error__service-unavailable-503-bad-retry-after.json | 임의 | 503 | Retry-After: -1, abc, 과거 날짜, 99999 |
| common/error__rate-limited-429.json | 임의 | 429 | Retry-After: 2, 본문 형태 불명이라 빈 본문 |
| common/ok__malformed-json.json | 임의 | 200 | 깨진 JSON |
| common/ok__empty-body.json | 임의 | 200 | 빈 본문 |
| common/ok__extra-fields.json | 임의 | 200 | 알 수 없는 필드 포함 |
| common/ok__unknown-enum.json | 임의 | 200 | 알 수 없는 enum 값 포함 |
| common/ok__missing-required.json | 임의 | 200 | 필수 필드 누락 |
| common/ok__wrong-content-type.json | 임의 | 200 | Content-Type text/plain |
| common/presigned-put__ok.json | PUT {uploadUrl} | 200 | 빈 본문 |
| auth/refresh__success.json, auth/refresh__reauthentication-required.json | POST /auth/refresh | 200, 401 | boot-auth.md에서 정의 |
| auth/refresh__internal-error.json | POST /auth/refresh | 500 | INTERNAL_ERROR |
| auth/refresh__missing-token-field.json | POST /auth/refresh | 200 | refreshToken 키 누락 |
| time/topics__open.json | GET /topics?date= | 200 | startsAt 2026-10-26T15:00:00Z, endsAt 2026-10-27T15:00:00Z, phase OPEN |
| time/topics__before-open.json | GET /topics?date= | 200 | phase BEFORE_OPEN |
| time/topics__closed.json | GET /topics?date= | 200 | phase CLOSED |
| time/topics__future-400.json | GET /topics?date= | 400 | BUSINESS_ERROR "미래의 주제는 조회할 수 없습니다." |
| time/topics__not-found.json | GET /topics?date= | 404 | BUSINESS_ERROR "주제를 찾을 수 없습니다." |
| time/posts-today__cross-midnight.json | GET /posts/today | 200 | topicDate가 어제 날짜인 참여 기간 |
| time/posts-today__adjacent-topic.json | GET /posts/today | 200 | 인접 주제 경계 시각의 B 주제 |
| time/posts-today__no-topic.json | GET /posts/today | 404 | BUSINESS_ERROR "참여할 수 있는 주제가 없습니다." |
| time/calendar__cross-year.json | GET /posts/calendar | 200 | 2026-12, 2027-01 응답 한 쌍 |
| time/calendar__cross-month.json | GET /posts/calendar | 200 | 2026-10, 2026-11 응답 한 쌍 |
| time/calendar__months-without-current.json | GET /posts/calendar/months | 200 | 현재 달이 없는 months 배열 |
| time/instants__variants.json | (디코딩 입력) | - | Z, +00:00, 소수초 3/6/9자리와 없음 |
| time/instants__invalid.json | (디코딩 입력) | - | 파싱 불가 문자열 |
| anl/events__expected-screen-names.json | (기대값) | - | 19종 screen_name 목록 |
| anl/events__journey-signup.json | (기대값) | - | 가입 여정의 기대 이벤트 순서 |
| anl/events__journey-tabs.json | (기대값) | - | 게스트 시작 → 탭 이동 여정의 기대 이벤트 순서 |
| notification/notifications__page1.json, notification/notifications__kst-boundary.json | GET /notifications | 200 | notification-push.md에서 정의 |

## 흡수하지 않은 기존 테스트

- `iOS:WaitUntilTests L5~L42`: 테스트 헬퍼 자체의 테스트라 플랫폼별 헬퍼가 있다면 그 안에서 확인하고 TC-TIME-030으로 취지만 흡수했다.
- `iOS:RemoteImageCacheTests L7~L27`, `iOS:TodayImagePipelineTests L8`, `AN:FittedPhotoCardShapeTest`, `PhotoTransitionTest`: 이미지 캐시·전환의 플랫폼 내부 구현이라 parity 대상이 아니다.
- `AN:ArchitectureKonsistTest`, `AN:ComposeKonsistTest`: 아키텍처 린트로 플랫폼별 도구 몫이다.
