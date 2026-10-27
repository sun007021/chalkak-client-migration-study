# 테스트 카탈로그: BOOT, AUTH

앱 시작(스플래시, 강제 업데이트 게이트, 인증 게이트)과 인증(카카오 로그인, 게스트, 토큰 저장, 로그아웃, 탈퇴, 정지 회원)을 다룬다. 다섯 클라이언트가 같은 `TC-` ID를 자기 테스트 이름에 넣는다([strategy.md §3](../strategy.md#3-테스트-이름과-추적)). 대부분 `U`(Fake 저장소·Fake 카카오 클라이언트·가짜 시계)와 `C`(공용 fixture 디코딩, 요청 모양)로 닫고, 로그인·재시작 여정은 mock 서버를 쓰는 `E`로 묶는다. 실제 카카오 로그인, 실서버 세션 폐기 확인, 탈퇴, iTunes 실조회처럼 외부 서비스나 사람의 판단이 필요한 것만 `A`로 두며 시나리오는 [agent-scenarios/boot-auth.md](../agent-scenarios/boot-auth.md)에 있다. 강제 업데이트는 [D-15](../../spec/decisions.md#d-15-강제-업데이트)에 따라 iOS 계열은 iTunes lookup, Android 계열은 Play In-App Update, Web은 게이트 없음이며 이 레포 앱은 스토어에 올리지 않으므로 실제 조회는 설정으로 끄고 로직만 시험한다. 토큰 갱신 프로토콜(single-flight, 재시도, 취소)은 [common-infra.md](common-infra.md)의 NET에 있고 여기서는 세션 저장과 인증 결과 분기만 본다.

표기: fixture 열 경로는 모두 `shared/fixtures/` 아래다. `-`는 서버 응답 없이 Fake 주입만 쓴다. `session__*` 파일은 토큰 저장소를 채우는 시드이며 서버 응답이 아니다. 기존 열의 `iOS:파일 L줄`은 [legacy-ios §4.3](../../reference/legacy-ios.md), `AN:파일`은 [legacy-android §4](../../reference/legacy-android.md)이다. `[결정 필요]`는 두 앱의 동작이 다르거나 규칙이 없어 임시로 적은 것이며 결과를 [open-questions.md](../../spec/open-questions.md)에 올린다.

## BOOT

| ID | 검증 내용 | 근거 | 구분 | fixture | 기존 |
| --- | --- | --- | --- | --- | --- |
| TC-BOOT-001 | Given 저장된 세션도 게스트 플래그도 없음 / When 앱 시작 / Then 스플래시 뒤 로그인 화면이 열리고 홈은 한 번도 그려지지 않는다 | overview §5, USER-001 | U+W | boot/session__empty.json | AN:AuthGateViewModelTest |
| TC-BOOT-002 | Given userId와 만료 전 refresh token이 저장됨 / When 앱 시작 / Then 로그인 화면을 거치지 않고 홈이 열린다 | overview §5, D-17 | U | boot/session__authenticated.json | iOS:APIAuthRepositoryTests(세션 판정) / AN:AuthGateViewModelTest |
| TC-BOOT-003 | Given 게스트 플래그만 저장됨 / When 앱 시작 / Then 홈이 게스트 제한 모드로 열리고 인증 API 호출이 0건이다 | D-05, overview §5 | U | boot/session__guest.json | AN:AuthGateViewModelTest |
| TC-BOOT-004 | Given userId는 있으나 refresh token 만료 시각이 지남 / When 앱 시작 / Then 세션을 지우고 로그인 화면을 연다 | D-17, API§2.2 | U | boot/session__expired-refresh.json | AN:AuthGateViewModelTest(만료 refresh는 SignedOut) |
| TC-BOOT-005 | Given refresh 만료 시각이 now−1초 / now / now+1초 / When 세션 판정 / Then 각각 만료 / 만료 / 유효 (만료 시각 이하는 만료로 본다) | D-17, API§2.2 | U | - | AN:AuthTokenRefresherTest(경계 일부) |
| TC-BOOT-006 | Given 저장소에 userId만 있고 토큰 필드가 일부 없음 / When 앱 시작 / Then 불완전 세션을 지우고 로그인 화면을 연다 | D-17 | U | boot/session__partial.json | 신규 |
| TC-BOOT-007 | Given 보안 저장소 값을 복호화할 수 없음(손상 암호문, 키 소실) / When 앱 시작 / Then 크래시 없이 세션 없음으로 처리하고 저장소를 정리해 로그인 화면을 연다 | D-17 | U | boot/session__corrupted.json | AN:AndroidKeystoreTokenCipherTest |
| TC-BOOT-008 | Given 인증 세션과 게스트 플래그가 동시에 저장됨 / When 앱 시작 / Then 인증 세션이 우선이며 홈은 게스트 제한이 아닌 회원 모드다 | overview §5 | U | boot/session__authenticated-and-guest.json | 신규 |
| TC-BOOT-009 | Given access token은 만료됐지만 refresh token은 유효함 / When 앱 시작 / Then 로그인 화면 없이 홈이 열리고 첫 인증 API의 401 처리로 갱신된다 | D-17, API§2.3, K1 | U+E | boot/session__access-expired.json, auth/refresh__success.json | 신규 |
| TC-BOOT-010 | Given 홈 프리로드가 100ms에 끝남 / When 스플래시 / Then 100ms에 해제되고 700ms를 기다리지 않는다 | overview §6 SPLASH_PRELOAD_MAX | U | - | AN:HomeViewModelTest(초기 표시 해제) |
| TC-BOOT-011 | Given 프리로드가 끝나지 않음 / When 699ms, 700ms, 701ms / Then 699ms까지 유지하고 700ms에 해제한다 | overview §6 | U | - | AN:HomeViewModelTest(데드라인 후 해제) |
| TC-BOOT-012 | Given 프리로드가 오류로 끝남 / When 스플래시 / Then 즉시 해제되고 홈이 오류 상태("다시 시도")로 열린다 | overview §6, D-20 | U | home/posts-popular__internal-error.json (HOME 소유) | 신규 |
| TC-BOOT-013 | Given 게스트 세션 / When 스플래시 / Then 공개 데이터(랭킹, 배너)만 프리로드하고 인증이 필요한 호출은 0건이며 상한 700ms는 같다 | D-05, D-06 | U | boot/session__guest.json | AN:HomeViewModelTest(게스트) |
| TC-BOOT-014 | Given 세션 없음 상태로 로그인 화면이 목적지 / When 스플래시 / Then 홈 프리로드를 기다리지 않는다(Accessible이면서 홈 미준비일 때만 대기) | overview §5 | U | boot/session__empty.json | AN:MainActivity 스플래시 조건(계측) |
| TC-BOOT-015 | Given 세션을 읽는 동안(Loading) / When 첫 프레임 / Then 로그인 화면이 잠깐 번쩍이지 않고 스플래시나 빈 화면이 유지된다 | overview §5 | W | - | AN:AuthGateRoute Loading |
| TC-BOOT-016 | Given 스토어 최신 버전 major가 앱보다 높음(앱 1.1.1, 스토어 2.0.0) / When 버전 게이트 / Then 닫을 수 없는 강제 업데이트 다이얼로그가 뜨고 홈 진입이 막힌다 (iOS 계열) | D-15 | U+W | boot/itunes-lookup__newer-major.json | iOS:AppVersionGateTests L26 |
| TC-BOOT-017 | Given 스토어 minor가 더 높음(1.1.1 대비 1.2.0) / When 게이트 / Then 강제 업데이트 (iOS 계열) | D-15 | U | boot/itunes-lookup__newer-minor.json | iOS:AppVersionGateTests L26 |
| TC-BOOT-018 | Given 스토어 patch만 높음(1.1.2) / 같음(1.1.1) / 낮음(1.0.9) / When 게이트 / Then 모두 통과 (patch 차이는 무시) | D-15 | U | boot/itunes-lookup__patch-only.json, boot/itunes-lookup__same.json | iOS:AppVersionGateTests L40 |
| TC-BOOT-019 | Given 버전 문자열 "1.2.3" / "1.1" / When 파싱 / Then major.minor.patch로 읽고 두 구성이면 patch=0 | D-15 | U | - | iOS:AppVersionGateTests L7, L14 |
| TC-BOOT-020 | Given 버전 문자열 "1", "1.2.3.4", "1.two.3", "1.2.-1", "" / When 파싱 / Then 모두 파싱 실패이며 실패는 통과로 처리한다 | D-15 | U | boot/itunes-lookup__malformed.json | iOS:AppVersionGateTests L21 |
| TC-BOOT-021 | Given iTunes lookup 요청 / When URL 구성 / Then bundleId, Storefront 국가 코드, entity=software가 들어가고 국가 코드를 못 읽으면 기본 국가를 쓴다 | D-15 | C | - | iOS:AppVersionGateTests L55 |
| TC-BOOT-022 | Given lookup 응답 results가 빈 배열 또는 version 필드 없음 / When 게이트 / Then 통과한다 | D-15 | C+U | boot/itunes-lookup__empty-results.json | 신규 |
| TC-BOOT-023 | Given lookup 네트워크 오류 / 5xx / When 게이트 / Then 앱을 막지 않고 통과한다 | D-15 | U | - | iOS:AppVersionGate unavailable(~152) / AN:VersionGateViewModelTest |
| TC-BOOT-024 | Given lookup 응답이 3.0초 안에 오지 않음 / When 게이트 / Then 3초 시점에 중단하고 통과한다 (2.9초 응답은 사용) | D-15, legacy-ios §1.2 | U | - | 신규 (iOS:AppVersionGate 타임아웃 3초 ~77) |
| TC-BOOT-025 | Given 오프라인 / When 게이트 / Then 통과한다. 온라인 전환 시 재조회하고 강제 대상이면 그때 다이얼로그를 띄운다 | D-15 (Android의 "온라인인데 확인 실패면 차단"은 따르지 않음) | U | - | AN:VersionGateViewModelTest(오프라인 통과/온라인 재검사) |
| TC-BOOT-026 | Given 이미 강제 업데이트가 확인됨 / When 재조회가 실패(unavailable) / Then 강제 상태를 유지한다 | D-15 | U | - | iOS:AppVersionGateTests L75 |
| TC-BOOT-027 | Given 앱이 백그라운드에서 돌아옴(scene active) / When 게이트 재확인 / Then 새로 강제 대상이면 다이얼로그를 띄운다 | D-15 | U | - | iOS:AppVersionGate scene active / AN:VersionGateViewModelTest(복귀 시 재확인) |
| TC-BOOT-028 | Given 강제 업데이트 다이얼로그 / When 화면 확인 / Then 제목 "업데이트가 필요해요", 본문 "원활한 서비스 이용을 위해 최신 버전으로 업데이트해 주세요.", 버튼 "업데이트" 한 개이며 뒤로가기, 바깥 탭, 스와이프로 닫히지 않는다 | D-15 | W | - | iOS:AppVersionGate 다이얼로그 / AN:VersionGateScreenTest |
| TC-BOOT-029 | Given 강제 업데이트 다이얼로그 / When "업데이트" 탭 / Then 스토어 열기 인터페이스가 정확히 1회 호출된다(연타해도 1회) | D-15 | U | - | 신규 |
| TC-BOOT-030 | Given Play In-App Update 우선순위 1 이상 / 0 / When 게이트 (Android 계열) / Then 1 이상이면 강제, 0이면 통과 | D-15 | U | boot/play-update__priority-1.json, boot/play-update__priority-0.json | AN:VersionGateViewModelTest |
| TC-BOOT-031 | Given Android 계열에서 업데이트 흐름이 실패하거나 사용자가 취소 / When 돌아옴 / Then 앱을 통과시키지 않고 다이얼로그가 다시 열린다 (기존의 finish()로 종료하는 동작 대신 게이트 유지) | D-15 | U | - | AN:VersionGateViewModelTest(업데이트 후 잔존) [결정 필요: 종료 vs 게이트 유지] |
| TC-BOOT-032 | Given 디버그/설정으로 조회를 끈 빌드(이 레포 기본) / When 시작 / Then 스토어 조회 호출 0건이며 통과한다 | D-15 | U | - | AN:DisabledAppUpdateGatewayTest |
| TC-BOOT-033 | Given Web / When 시작 / Then 버전 게이트 UI와 조회가 없다 | D-15 | W | - | 신규 |
| TC-BOOT-034 | Given 강제 업데이트 대상이고 인증 세션이 유효함 / When 시작 / Then 게이트가 인증 게이트보다 먼저이며 홈이 열리지 않고, 푸시 기기 등록과 홈 데이터 호출도 0건이다 | D-15, overview §5 | U | boot/itunes-lookup__newer-major.json, boot/session__authenticated.json | 신규 |
| TC-BOOT-035 | Given 강제 업데이트 다이얼로그 위에서 푸시 탭이 도착 / When 게이트가 풀리지 않음 / Then 이동하지 않고 보류하며, 게이트가 통과된 뒤에만 처리한다 | D-11, D-15 | U | - | 신규 |
| TC-BOOT-036 | Given Fake 카카오(E2E 빌드), mock 서버 / When 로그인 화면에서 게스트로 진입 후 앱 재시작 / Then 재시작 뒤에도 홈(게스트)이 열린다 | overview §5 | E | boot/session__empty.json | 신규 |
| TC-BOOT-037 | Given Fake 카카오가 LOGIN_SUCCESS를 돌려줌 / When 로그인 후 앱 재시작 / Then 로그인 화면 없이 홈이 열리고 푸시 기기 등록이 1회 시도된다 | overview §5, NOTIFICATION-005 | E | auth/social-login__login-success.json | 신규 |
| TC-BOOT-038 | Given 실제 iTunes lookup 응답(외부 서비스) / When iOS 시뮬레이터에서 게이트 조회를 켬 / Then 실응답이 파서를 통과하고 판정이 예상과 일치한다 | D-15 | A | - | 신규 (AN 대응 없음: iOS 계열 한정) |
| TC-BOOT-039 | Given 콜드 스타트 / When 스플래시에서 홈으로 전환 / Then 깜박임, 빈 프레임, 레이아웃 점프가 없고 로고→홈 전환이 자연스럽다 (시각 판단) | overview §5 | A | - | 신규 |

## AUTH

| ID | 검증 내용 | 근거 | 구분 | fixture | 기존 |
| --- | --- | --- | --- | --- | --- |
| TC-AUTH-001 | Given 세션 없음 / When 로그인 화면 렌더링 / Then 태그라인, "카카오로 계속하기", "로그인 없이 사진 둘러보기"가 보이고 Apple/Google 버튼은 없다 | overview §2 | W | - | AN:LoginScreenTest |
| TC-AUTH-002 | Given rawNonce 생성기 / When 100회 생성 / Then 매번 다르고 32바이트 랜덤의 base64url(패딩 없음) 43자이며 [A-Za-z0-9_-]만 쓴다 | API§2.1 | U | - | AN:LoginViewModelTest(nonce) |
| TC-AUTH-003 | Given 알려진 rawNonce 입력 / When SDK용 nonce 계산 / Then SHA-256(rawNonce) 소문자 hex 64자이며 플랫폼 간 같은 값이다 | API§2.1 | U | - | 신규 |
| TC-AUTH-004 | Given 카카오 버튼 탭 / When SDK 호출 / Then SDK에는 해시 nonce를, 서버 요청에는 원문 rawNonce를 쓰며 둘이 섞이지 않는다 | API§2.1 | U | - | iOS:APIAuthRepositoryTests L95 |
| TC-AUTH-005 | Given idToken 수신 / When social-login 요청 / Then POST /auth/social-login 바디가 {provider:"KAKAO", idToken, rawNonce}이고 authorizationCode 키가 없으며 Authorization 헤더가 없다 | API§1.1, §1.6 | C | auth/social-login__login-success.json | iOS:APIAuthRepositoryTests L8, L95 / AN:AuthDataSourceImplTest |
| TC-AUTH-006 | Given LOGIN_SUCCESS 응답 / When 디코딩 / Then userId, accessToken, expiresIn, refreshToken, refreshTokenExpiresIn을 읽는다 | API§1.1 | C | auth/social-login__login-success.json | AN:AuthDataSourceImplTest |
| TC-AUTH-007 | Given LOGIN_SUCCESS (expiresIn 900, refreshTokenExpiresIn 2592000) / When 저장 / Then userId, 토큰 2종, 만료 시각 2종(now+초)이 저장되고 만료 시각은 응답 초 값에서 계산한다(하드코딩 아님) | D-17, Q-06 | U | auth/social-login__login-success.json | AN:AuthRepositoryImplTest(로그인 userId 저장) |
| TC-AUTH-008 | Given LOGIN_SUCCESS / When 처리 완료 / Then 홈으로 이동하고 푸시 기기 등록이 트리거된다 | overview §5, NOTIFICATION-005 | U | auth/social-login__login-success.json | iOS:LoginViewModelTest L25(가입 필요 상태) 인접 |
| TC-AUTH-009 | Given SIGN_UP_REQUIRED 응답(나머지 필드 생략) / When 디코딩 / Then status만 읽고 토큰 필드가 없어도 오류가 아니다 | API§1.1 | C | auth/social-login__sign-up-required.json | iOS:LoginViewModelTest L25 |
| TC-AUTH-010 | Given SIGN_UP_REQUIRED / When 처리 / Then 토큰을 저장하지 않고 약관 화면으로 가며 idToken과 rawNonce는 가입 완료까지 메모리에만 유지한다 | API§2.1, D-25 | U | auth/social-login__sign-up-required.json | iOS:LoginViewModelTest L25 / AN:LoginViewModelTest |
| TC-AUTH-011 | Given 알 수 없는 status 값 / When 디코딩 / Then 잘못된 응답으로 보고 "로그인 응답을 확인할 수 없어요. 다시 시도해 주세요."를 보여 준다 | D-02 | C+U | auth/social-login__unknown-status.json | AN:AuthDataSourceImplTest(필수 필드 누락) |
| TC-AUTH-012 | Given LOGIN_SUCCESS인데 accessToken 또는 refreshToken 누락 / When 디코딩 / Then 세션을 저장하지 않고 잘못된 응답 문구를 보여 준다 | D-02 | C+U | auth/social-login__login-success-missing-token.json | AN:AuthDataSourceImplTest(필수 필드 누락=InvalidResponse) |
| TC-AUTH-013 | Given 카카오 SDK가 사용자 취소를 돌려줌 / When 처리 / Then 오류 문구 없이 로그인 화면에 머물고 버튼이 다시 눌린다 | legacy-ios §2.1, legacy-android §2.1 | U | - | AN:KakaoIdTokenClientTest, LoginViewModelTest |
| TC-AUTH-014 | Given 카카오톡 앱 로그인이 가능 / When 로그인 / Then 톡 로그인을 먼저 쓴다 | legacy-ios §2.1 | U | - | AN:KakaoIdTokenClientTest |
| TC-AUTH-015 | Given 톡 로그인 실패(취소 제외) / When 처리 / Then 카카오계정 로그인으로 폴백한다 | legacy-android §2.1 | U | - | AN:KakaoIdTokenClientTest |
| TC-AUTH-016 | Given 톡 로그인에서 사용자가 취소 / When 처리 / Then 계정 로그인으로 폴백하지 않는다 | legacy-android §5.1-11 | U | - | AN:KakaoIdTokenClientTest |
| TC-AUTH-017 | Given 카카오톡 미설치 또는 가용성 확인 실패 / When 로그인 / Then 계정 로그인을 쓴다 | legacy-android §2.1 | U | - | AN:KakaoIdTokenClientTest |
| TC-AUTH-018 | Given SDK가 idToken 없이 성공 / When 처리 / Then 설정 오류로 "카카오 로그인 설정을 확인해 주세요."를 보여 주고 서버 호출 0건이다 | legacy-android §2.1 | U | - | AN:KakaoIdTokenClientTest(idToken 없음=Configuration) |
| TC-AUTH-019 | Given SDK 일반 실패 / When 처리 / Then "카카오 로그인에 실패했어요. 다시 시도해 주세요."이고 서버 호출 0건이다 | legacy-android §2.1 | U | - | AN:KakaoLoginActionTest |
| TC-AUTH-020 | Given 서버가 401 UNAUTHORIZED(nonce 불일치, ID Token 오류) / When social-login / Then refresh를 시도하지 않고 "카카오 계정을 확인할 수 없어요. 다시 시도해 주세요."를 보여 주며 다음 시도는 새 rawNonce와 새 idToken을 쓴다 | API§5.1, §2.1 | C+U | auth/social-login__unauthorized.json | AN:LoginViewModelTest(401 문구) |
| TC-AUTH-021 | Given 403 FORBIDDEN "차단된 소셜 계정입니다." / When social-login / Then 서버 message를 그대로 보여 주고 자동 재시도하지 않는다 | API§5.1, USER-005 | C+U | auth/social-login__forbidden-banned.json | 신규 |
| TC-AUTH-022 | Given 403 "탈퇴한 차단 소셜 계정입니다." / When social-login / Then 서버 message를 보여 준다 | USER-005, API§2.5 | C+U | auth/social-login__forbidden-withdrawn-banned.json | 신규 |
| TC-AUTH-023 | Given 400 BUSINESS_ERROR "Authorization Code는 APPLE 로그인에만 필요합니다." / When social-login / Then 클라이언트 버그로 간주해 일반 문구 "로그인하지 못했어요. 다시 시도해 주세요."를 보여 준다 | API§5.2 | C+U | auth/social-login__bad-request-authcode.json | 신규 |
| TC-AUTH-024 | Given 500 INTERNAL_ERROR / When social-login / Then 일반 문구를 보여 주고 요청은 정확히 1회만 보낸다(자동 재시도 금지) | D-21 | C+U | auth/social-login__internal-error.json | 신규 |
| TC-AUTH-025 | Given 연결 실패 또는 타임아웃 / When social-login / Then "네트워크 연결을 확인해 주세요."를 보여 주고 요청은 1회뿐이다 | D-20, D-21 | U | - | AN:LoginViewModelTest(네트워크 문구) |
| TC-AUTH-026 | Given 502 게이트웨이 HTML 응답(JSON 아님) / When social-login / Then HTTP 상태로 분류해 일반 문구를 보여 주고 크래시하지 않는다 | API§5.1 끝 | C+U | common/error__bad-gateway-html.json | 신규 |
| TC-AUTH-027 | Given 카카오 버튼을 빠르게 3회 연타 / When 진행 중 / Then SDK 호출 1회, social-login 요청 1회이며 진행 중 버튼은 비활성이다 | 연타 | U+W | - | iOS:LoginViewModelTest L59(재제출) |
| TC-AUTH-028 | Given 로그인 성공 후 화면 전환이 끝남 / When 로그인 상태 초기화 / Then 다시 로그인 화면이 열리면 새로 제출할 수 있다 | 연타, 재진입 | U | - | iOS:LoginViewModelTest L59 |
| TC-AUTH-029 | Given 같은 오류가 연달아 두 번 발생 / When 처리 / Then 두 번째에도 메시지가 다시 표시된다(메시지 고유 ID) | D-20 | U | - | AN:LoginViewModelTest(메시지 ID) |
| TC-AUTH-030 | Given social-login 요청 중 앱이 백그라운드로 갔다 복귀 / When 응답 도착 / Then 정상 처리되어 홈 또는 약관으로 이동한다 | 늦은 응답 | U | auth/social-login__login-success.json | 신규 |
| TC-AUTH-031 | Given social-login 요청 중 로그인 화면이 사라짐(화면 이탈) / When 응답이 늦게 도착 / Then 요청이 취소되었거나 결과를 버리고 세션을 저장하지 않으며 오류도 보이지 않는다 | D-20 취소 | U | auth/social-login__login-success.json | iOS:OnboardingFeatureTests L99(화면 사라지면 취소) |
| TC-AUTH-032 | Given 게스트 버튼 탭 / When 처리 / Then 서버 호출 0건, 인증 자격 제거, 게스트 플래그 저장, 홈(게스트)으로 이동한다 | D-05 | U | - | iOS:LoginViewModelTest L43 / AN:AuthRepositoryImplTest(게스트) |
| TC-AUTH-033 | Given 게스트 세션 / When 설정의 "로그인" 탭 / Then 게스트 플래그를 지우고 로그인 화면을 연다 | D-05 | U | boot/session__guest.json | AN:SettingsViewModelTest(게스트 로그인) |
| TC-AUTH-034 | Given 게스트 상태에서 카카오 로그인 성공 / When 세션 저장 / Then 게스트 플래그가 제거되고 홈은 회원 모드다 | D-05 | U | auth/social-login__login-success.json | 신규 |
| TC-AUTH-035 | Given 인증 세션 / When 로그아웃 확정 / Then 로컬 토큰과 캐시를 먼저 지운 뒤 POST /auth/logout {refreshToken}을 보낸다(호출 순서 검증) | D-16 | U | auth/logout__no-content.json | iOS:APIAuthRepositoryTests L156 / AN:AuthRepositoryImplTest |
| TC-AUTH-036 | Given 로그아웃 요청이 네트워크 오류, 500, 401로 실패 / When 처리 / Then 실패를 무시하고 로그인 화면으로 가며 토큰은 이미 지워진 상태다 | D-16 | U | auth/logout__internal-error.json | AN:SettingsViewModelTest |
| TC-AUTH-037 | Given 로그아웃 요청 / When 확인 / Then 요청은 POST /auth/logout 바디 {refreshToken}뿐이고 응답 204(알 수 없는 토큰도 204)을 성공으로 읽는다 | API§1.1, K6 | C | auth/logout__no-content.json | AN:AuthDataSourceImplTest(로그아웃 204) |
| TC-AUTH-038 | Given refresh token이 없는 세션(게스트 등) / When 로그아웃 / Then 서버 호출 없이 로컬만 정리한다 | D-16 | U | - | AN:AuthRepositoryImplTest(무세션) |
| TC-AUTH-039 | Given 로그아웃 완료 / When 호출 기록 확인 / Then 푸시 기기 해제 API 호출 0건이다(서버가 세션과 함께 지움) | D-16, NOTIFICATION-005 | U | - | 신규 |
| TC-AUTH-040 | Given 로그아웃 버튼 연타 / When 확인 다이얼로그 확정 / Then 로그아웃 요청 1회, 로컬 정리 1회이다 | 연타 | U | - | 신규 |
| TC-AUTH-041 | Given 로그아웃 완료 / When 저장소와 메모리 캐시 확인 / Then 홈, 기록, 알림 목록, 좋아요, 미읽음 상태, 사인, 푸시 설정 캐시가 모두 비워진다 | 계정 전환 | U | - | 신규 (iOS:NotificationSettingsTests L318 reset 인접) |
| TC-AUTH-042 | Given 계정 A의 요청이 진행 중 / When 로그아웃 후 계정 B로 로그인하고 A의 응답이 도착 / Then A의 응답은 어떤 상태에도 반영되지 않는다 | 계정 전환, 늦은 응답 | U | - | iOS:NotificationSettingsTests L163, L318, L333 / AN:TokenAuthenticatorTest(계정 전환) |
| TC-AUTH-043 | Given 인증 세션 / When 회원탈퇴 확정 / Then DELETE /users/me가 본문 없이 나가고 204일 때만 로컬 세션과 캐시를 지운 뒤 로그인 화면으로 간다 | D-16, USER-003 | C+U | auth/users-me__delete-no-content.json | iOS:SettingsScreenTests L154, L297 / AN:UserRepositoryImplTest |
| TC-AUTH-044 | Given 탈퇴 요청이 네트워크 오류, 500 / When 처리 / Then 세션을 유지하고 토스트 "요청을 처리하지 못했어요. 다시 시도해 주세요."를 보여 준다 | D-16 | U | auth/users-me__delete-internal-error.json | iOS:SettingsScreenTests L176 / AN:SettingsViewModelTest |
| TC-AUTH-045 | Given 탈퇴 요청이 401 UNAUTHORIZED / When 처리 / Then refresh 후 원 요청을 1회 재전송하고 성공하면 204로 처리한다(실패 시 세션 유지) | D-17, K1 | U | auth/users-me__delete-unauthorized.json, auth/refresh__success.json | iOS:SettingsScreenTests L314(401 구분) |
| TC-AUTH-046 | Given 정지(BANNED) 회원이 탈퇴 / When DELETE /users/me / Then 204를 성공으로 처리한다 | USER-002, USER-003 | U | auth/users-me__delete-no-content.json | 신규 |
| TC-AUTH-047 | Given 탈퇴 성공 / When 호출 기록 확인 / Then 카카오 SDK 연결 해제(unlink) 호출 0건이다 | D-16, Q-05 | U | - | 신규 |
| TC-AUTH-048 | Given 탈퇴 버튼 연타 / When 확정 / Then DELETE 1회이다 | 연타 | U | - | iOS:SettingsScreenTests L194 인접 |
| TC-AUTH-049 | Given 탈퇴 요청 중 화면 이탈 / When 응답 도착 / Then 요청 취소 오류가 토스트로 보이지 않고, 204가 도착했다면 로컬 세션은 정리된다 | D-20, D-16 | U | auth/users-me__delete-no-content.json | iOS:SettingsScreenTests L325(취소 전파) |
| TC-AUTH-050 | Given 탈퇴 직후 같은 소셜 계정으로 다시 로그인 / When social-login / Then SIGN_UP_REQUIRED가 오고 새 회원 가입 흐름으로 간다 | USER-005 | E | auth/social-login__sign-up-required.json | 신규 |
| TC-AUTH-051 | Given 탈퇴 후 이전 액세스 토큰으로 호출이 401 / When 처리 / Then refresh가 401 REAUTHENTICATION_REQUIRED로 끝나 세션을 지우고 로그인 화면으로 간다 | API§2.5, K8 | U | auth/refresh__reauthentication-required.json | 신규 |
| TC-AUTH-052 | Given 인증 세션 저장 / When 저장소 읽기 / Then userId, accessToken, 만료 시각, refreshToken, refresh 만료 시각, 게스트 플래그 6종이 왕복 저장·복원된다 | D-17 | U | - | iOS:APIAuthRepository / AN:UserSessionStore(간접) |
| TC-AUTH-053 | Given 토큰 저장 / When 구현 확인 / Then 플랫폼 보안 저장소 인터페이스(Keychain, Keystore 암호화, secure_storage, secure-store)만 쓰고 평문 저장소에는 토큰이 없다 | D-17 | U | - | AN:AndroidKeystoreTokenCipherTest |
| TC-AUTH-054 | Given access token 만료 시각이 now 이하 / When API 요청 / Then Authorization 헤더를 붙이지 않는다 | D-17 | U | - | AN:AuthorizationHeaderInterceptorTest |
| TC-AUTH-055 | Given 요청 URL이 http(비 TLS) / When 요청 / Then Authorization 헤더를 붙이지 않는다 | NET | C | - | AN:AuthorizationHeaderInterceptorTest |
| TC-AUTH-056 | Given REAUTHENTICATION_REQUIRED 수신(어느 화면에서든) / When 처리 / Then 세션을 지우고 로그인 화면으로 가며 백스택이 비워져 뒤로가기로 이전 화면에 못 돌아간다 | D-17 | U+E | auth/refresh__reauthentication-required.json | iOS:AuthenticatedHTTPClientTests L181 / AN:TokenAuthenticatorTest |
| TC-AUTH-057 | Given 정지 회원이 로그인 / When LOGIN_SUCCESS / Then 안내 없이 홈이 열린다(정지 안내는 403을 받는 곳에서만) | D-08, USER-002 | U | auth/social-login__login-success.json | 신규 |
| TC-AUTH-058 | Given 계정 A 세션에서 로그인 화면으로 와서 계정 B가 로그인 / When B 세션 저장 / Then A의 캐시와 푸시 대기 이동과 미읽음 상태가 모두 폐기된다 | 계정 전환 | U | auth/social-login__login-success.json | 신규 |
| TC-AUTH-059 | Given Web 개발 빌드, 카카오 웹 로그인 미검증 (Q-02) / When 개발용 로그인 우회 사용 / Then 게스트와 우회 세션으로 나머지 기능을 쓸 수 있고 우회는 배포 빌드에 포함되지 않는다 | Q-02 | W+U | - | 신규 (Web 한정) |
| TC-AUTH-060 | Given Web / When 페이지 새로고침 / Then refresh token 보관소(Q-03 임시안)에서 세션을 복원하고 access token은 메모리에만 두며 localStorage에는 토큰이 없다 | D-17, Q-03 | U | boot/session__authenticated.json | 신규 (Web 한정) |
| TC-AUTH-061 | Given 실제 카카오 로그인(톡 앱 또는 계정) / When 개발 서버에 로그인 / Then LOGIN_SUCCESS 또는 SIGN_UP_REQUIRED가 오고 홈 또는 약관으로 이동한다 | USER-001, Q-15 | A | - | 신규 |
| TC-AUTH-062 | Given 실제 카카오 로그인 화면에서 사용자가 닫기 / When 앱 복귀 / Then 오류 없이 로그인 화면이 다시 눌린다(톡 앱 취소와 계정 취소 각각) | legacy §2.1 | A | - | 신규 |
| TC-AUTH-063 | Given 개발 서버 실제 로그인 세션 / When 로그아웃 후 이전 refresh token으로 refresh 호출 / Then 서버가 401 REAUTHENTICATION_REQUIRED로 거절해 세션이 실제 폐기됐음을 확인한다 | API§2.4, K6 | A | - | 신규 |
| TC-AUTH-064 | Given 개발 서버 실제 로그인 세션(사용자 확인 필수) / When 회원탈퇴 / Then 204 후 같은 토큰으로 인증 API가 401이고 앱은 로그인 화면이다 | USER-003, USER-004 | A | - | 신규 |
| TC-AUTH-065 | Given 웹 브라우저와 카카오 웹 로그인(Q-02 결론 후) / When 로그인 / Then idToken과 nonce 왕복이 되어 세션이 만들어진다 | Q-02 | A | - | 신규 (Web 한정) |

## 필요 fixture 목록

| 파일명 (shared/fixtures/ 기준) | 메서드 경로 | HTTP | 내용 요지 |
| --- | --- | --- | --- |
| auth/social-login__login-success.json | POST /auth/social-login | 200 | status LOGIN_SUCCESS, userId(소문자 UUID), accessToken(서명 없는 가짜 JWT), expiresIn 900, refreshToken(불투명 가짜 문자열), refreshTokenExpiresIn 2592000 |
| auth/social-login__sign-up-required.json | POST /auth/social-login | 200 | status SIGN_UP_REQUIRED만, 나머지 필드 생략 |
| auth/social-login__unknown-status.json | POST /auth/social-login | 200 | status "SOMETHING_NEW" |
| auth/social-login__login-success-missing-token.json | POST /auth/social-login | 200 | LOGIN_SUCCESS인데 refreshToken 없음 |
| auth/social-login__unauthorized.json | POST /auth/social-login | 401 | UNAUTHORIZED "유효하지 않은 인증 정보입니다." |
| auth/social-login__forbidden-banned.json | POST /auth/social-login | 403 | FORBIDDEN "차단된 소셜 계정입니다." |
| auth/social-login__forbidden-withdrawn-banned.json | POST /auth/social-login | 403 | FORBIDDEN "탈퇴한 차단 소셜 계정입니다." |
| auth/social-login__bad-request-authcode.json | POST /auth/social-login | 400 | BUSINESS_ERROR "Authorization Code는 APPLE 로그인에만 필요합니다." |
| auth/social-login__internal-error.json | POST /auth/social-login | 500 | INTERNAL_ERROR "서버에서 요청을 처리하지 못했습니다." |
| auth/logout__no-content.json | POST /auth/logout | 204 | 본문 없음(빈 파일 허용) |
| auth/logout__internal-error.json | POST /auth/logout | 500 | INTERNAL_ERROR |
| auth/users-me__delete-no-content.json | DELETE /users/me | 204 | 본문 없음 |
| auth/users-me__delete-unauthorized.json | DELETE /users/me | 401 | UNAUTHORIZED (첫 호출 시나리오, 갱신 뒤 두 번째 호출은 no-content) |
| auth/users-me__delete-internal-error.json | DELETE /users/me | 500 | INTERNAL_ERROR |
| auth/refresh__success.json | POST /auth/refresh | 200 | 새 accessToken, expiresIn 900, 회전된 refreshToken, refreshTokenExpiresIn |
| auth/refresh__reauthentication-required.json | POST /auth/refresh | 401 | REAUTHENTICATION_REQUIRED "다시 로그인해 주세요." |
| common/error__bad-gateway-html.json | 임의 | 502 | 본문이 HTML(`_raw`, `_contentType: text/html`), errorCode 없음 |
| boot/session__empty.json | (저장소 시드) | - | 세션 없음, 게스트 플래그 없음 |
| boot/session__authenticated.json | (저장소 시드) | - | userId, access(만료 전), refresh(만료 전) |
| boot/session__access-expired.json | (저장소 시드) | - | access 만료 시각이 과거, refresh 유효 |
| boot/session__expired-refresh.json | (저장소 시드) | - | refresh 만료 시각이 과거 |
| boot/session__partial.json | (저장소 시드) | - | userId만 있고 토큰 없음 |
| boot/session__corrupted.json | (저장소 시드) | - | 복호화 불가 암호문 |
| boot/session__guest.json | (저장소 시드) | - | 게스트 플래그만 |
| boot/session__authenticated-and-guest.json | (저장소 시드) | - | 인증 세션 + 게스트 플래그 |
| boot/itunes-lookup__newer-major.json | GET itunes.apple.com/lookup | 200 | results[0].version "2.0.0" |
| boot/itunes-lookup__newer-minor.json | GET itunes.apple.com/lookup | 200 | version "1.2.0" |
| boot/itunes-lookup__patch-only.json | GET itunes.apple.com/lookup | 200 | version "1.1.2" |
| boot/itunes-lookup__same.json | GET itunes.apple.com/lookup | 200 | version "1.1.1" |
| boot/itunes-lookup__empty-results.json | GET itunes.apple.com/lookup | 200 | resultCount 0, results [] |
| boot/itunes-lookup__malformed.json | GET itunes.apple.com/lookup | 200 | version "1.two.3" 등 파싱 불가 값 |
| boot/play-update__priority-1.json | (Fake 게이트웨이 주입) | - | updatePriority 1, 업데이트 가능 |
| boot/play-update__priority-0.json | (Fake 게이트웨이 주입) | - | updatePriority 0 |
| home/posts-popular__internal-error.json | GET /posts | 500 | HOME 영역 소유 fixture를 재사용 |

## 흡수하지 않은 기존 테스트

- `iOS:LoginViewModelTest L7`(Google ID 토큰 전달), `AN:GoogleLoginActionTest`, Apple 관련 `APIAuthRepositoryTests L95`의 Apple 부분: Apple/Google은 범위 밖([overview §2](../../spec/00-overview.md)).
- `iOS:TodayFeatureTests`, `AN:feature/today/*`: 죽은 코드.
- `iOS:LegacyDailyReminderCleanupTests`, `AN:LegacyReminderCleanupTest`: 레거시 로컬 리마인더 정리, 범위 밖.
