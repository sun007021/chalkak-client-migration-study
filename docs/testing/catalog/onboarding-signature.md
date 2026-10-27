# 테스트 카탈로그: ONB, SIGN

ONB는 로그인에서 `SIGN_UP_REQUIRED`를 받은 뒤의 가입 흐름(약관 동의 → 가입 사인 그리기 → 미리보기 → 가입 완료)이고, SIGN은 사인 그리기 캔버스와 PNG 인코딩(가입·변경 공용), 그리고 설정에서 사인을 바꾸는 흐름이다. 캔버스·PNG 규격(1024×512, 패딩 48, 획 14, 투명 배경 + 흰 획, 1 MiB)은 SIGN에서 한 번만 검증하고 ONB는 그것을 쓰는 가입 API 순서와 오류 분기를 검증한다. 서버 호출 순서와 오류 분기는 `C`/`U`에 Fake presigned 업로더와 가짜 시계로 닫고, 사인 처리 대기 재시도(1초 간격 최대 10회)도 실제로 기다리지 않는다. 약관 동의는 [D-25](../../spec/decisions.md#d-25-약관-동의)에 따라 서버로 보내지도 저장하지도 않는다. 사람이 손으로 그리는 감각, 실제 카카오 신규 가입, 실서버 사인 처리 왕복, 약관 Notion 문서 실로드처럼 외부 서비스·사람 판단이 필요한 것만 `A`이며 시나리오는 [agent-scenarios/onboarding-signature.md](../agent-scenarios/onboarding-signature.md)에 있다.

표기: fixture 열 경로는 `shared/fixtures/` 아래다. `-`는 Fake 주입만 쓴다. 앱 이름 표기는 기존 iOS는 "찰캌", Android는 "찰칵"으로 서로 달라 문구 검증은 `shared/copy/ko.json` 키로 한다. 사인 PNG 크기 경계 테스트용 바이트열은 fixture가 아니라 테스트 코드가 생성한다. 기존 열은 [legacy-ios §4.3](../../reference/legacy-ios.md)과 [legacy-android §4](../../reference/legacy-android.md)를 가리킨다. `[결정 필요]`는 임시 동작이다.

## ONB

| ID | 검증 내용 | 근거 | 구분 | fixture | 기존 |
| --- | --- | --- | --- | --- | --- |
| TC-ONB-001 | Given SIGN_UP_REQUIRED 후 약관 화면 / When 렌더링 / Then 환영 제목, "전체 동의", "(필수) 서비스 이용약관", "(필수) 개인정보 처리방침", 각 "보기", "다음"이 보인다 (문구는 copy 키) | D-25 | W | - | AN:TermsScreenTest |
| TC-ONB-002 | Given 약관 화면 진입 직후 / When 상태 확인 / Then 체크박스가 모두 해제되고 "다음"이 비활성이다 | D-25 | U+W | - | AN:TermsScreenTest |
| TC-ONB-003 | Given 모두 해제 / When "전체 동의" 탭 / Then 두 필수 항목이 모두 선택된다 | D-25 | U | - | iOS:OnboardingFeatureTests L7 |
| TC-ONB-004 | Given 전체 동의 상태 / When "전체 동의"를 다시 탭 / Then 두 필수 항목이 모두 해제된다 | D-25 | U | - | iOS:OnboardingFeatureTests L18 |
| TC-ONB-005 | Given 필수 항목 하나만 선택 / When 상태 확인 / Then "전체 동의"는 해제 표시이고 "다음"은 비활성이다 | D-25 | U+W | - | iOS:OnboardingFeatureTests L32 |
| TC-ONB-006 | Given 두 항목을 각각 개별로 선택 / When 두 번째 선택 / Then "전체 동의"가 자동으로 선택 표시되고 "다음"이 활성이다 | D-25 | U | - | AN:TermsScreenTest(필수 동의 → 다음 활성화) |
| TC-ONB-007 | Given 둘 다 선택 후 / When 하나를 해제 / Then "전체 동의"가 해제되고 "다음"이 비활성이다 | D-25 | U | - | iOS:OnboardingFeatureTests L32 |
| TC-ONB-008 | Given 약관 화면 / When "서비스 이용약관 보기"와 "개인정보 처리방침 보기"를 각각 탭 / Then 각각 해당 문서가 열린다(모바일 앱 내 웹뷰 시트·다이얼로그, Web은 새 탭) | D-25 | E | - | iOS:chalkakUITests L141 / AN:TermsScreenTest |
| TC-ONB-009 | Given 가입 약관과 설정 약관 / When URL 확인 / Then 같은 공통 상수 URL을 쓰며 5개 플랫폼 값이 `shared/constants.json`과 일치한다 | D-25 | U | - | iOS:OnboardingFeatureTests L69 / iOS:SettingsScreenTests L471 / AN:LegalDocumentLauncherTest |
| TC-ONB-010 | Given 문서 URL 판정 / When https://www.notion.so/..., https://x.notion.site/..., https://notion.com/... / Then 앱 안에서 연다 | D-25 | U | - | iOS:OnboardingFeatureTests L81 |
| TC-ONB-011 | Given 문서 URL 판정 / When http://notion.so, https://notion.com.evil.example, https://evil.example/notion.so, userinfo가 섞인 URL, 빈 문자열, 문서 아닌 scheme / Then 앱 안에서 열지 않고 외부 브라우저로 넘기거나 거부한다 | D-25 | U | - | iOS:OnboardingFeatureTests L81 |
| TC-ONB-012 | Given 문서 로딩 실패 / When 시트 표시 / Then "문서를 불러오지 못했어요"와 "다시 시도"가 보이고 "다시 시도"가 재로딩한다 | legacy-ios §2.11 | W | - | AN:LegalDocumentLauncherTest(표시 실패 콜백) |
| TC-ONB-013 | Given 외부 브라우저로 열 수 없음 / When 열기 시도 / Then "문서를 열 수 없어요"를 보여 준다 | legacy-android §2.2 | U | - | AN:LegalDocumentLauncherTest(실패 콜백) |
| TC-ONB-014 | Given 문서 시트를 연 뒤 닫음 / When 약관 화면 복귀 / Then 체크 상태가 유지된다 | D-25 | W | - | 신규 |
| TC-ONB-015 | Given 두 항목 동의 / When "다음" / Then 사인 그리기 화면이 열린다 | overview §5 | U+E | - | AN:SignatureFlowTest |
| TC-ONB-016 | Given 약관 동의 사실 / When 가입 전체 과정의 요청을 기록 / Then 동의 관련 필드나 API 호출이 0건이고, 앱을 다시 시작하면 동의 상태가 초기화된다 | D-25, API§8.2-1 | U+C | - | 신규 |
| TC-ONB-017 | Given 약관 화면에서 뒤로가기 / When 처리 / Then 로그인 화면으로 돌아가고 보관하던 idToken, rawNonce, 약관 선택이 폐기된다 | API§2.1 | U | - | 신규 |
| TC-ONB-018 | Given Fake 카카오가 SIGN_UP_REQUIRED를 돌려줌 / When 로그인 화면에서 카카오 버튼 / Then 약관 화면이 열린다 | overview §5 | E | auth/social-login__sign-up-required.json | AN:SignatureFlowTest |
| TC-ONB-019 | Given 사인을 제출하고 미리보기에서 "시작하기" / When 가입 시작 / Then 요청 순서가 POST /auth/social-signup/signature/uploads → PUT presigned → POST /auth/social-signup이고 앞 단계 실패 시 뒤 단계 호출이 0건이다 | API§2.1, SIGN-001 | C+U | onboarding/signup-uploads__success.json, onboarding/signup__success.json | iOS:APIAuthRepositoryTests L8 / AN:AuthRepositoryImplTest |
| TC-ONB-020 | Given 가입 업로드 발급 / When 요청 바디 확인 / Then {provider:"KAKAO", idToken, rawNonce}만 있고 authorizationCode 키가 없으며 Authorization 헤더가 없다 | API§1.1 | C | onboarding/signup-uploads__success.json | iOS:APIAuthRepositoryTests L95 |
| TC-ONB-021 | Given 업로드 발급 응답 / When 디코딩 / Then uploadId, uploadUrl, expiresInSeconds(300), signupToken을 읽는다 | API§1.1 | C | onboarding/signup-uploads__success.json | AN:AuthDataSourceImplTest(서명 업로드 응답) |
| TC-ONB-022 | Given 사인 PNG 업로드 / When PUT 요청 확인 / Then 헤더는 Content-Type image/png이고 Authorization이 없으며 본문은 PNG 바이트 전체이다 | API§3.2 | C | onboarding/presigned-put__ok.json | AN:OkHttpSignatureUploaderTest |
| TC-ONB-023 | Given 가입 확정 요청 / When 바디 확인 / Then {signupToken}만 있다 | API§1.1 | C | onboarding/signup__success.json | AN:AuthDataSourceImplTest |
| TC-ONB-024 | Given social-signup 200 / When 처리 / Then 토큰 4종과 userId를 저장하고, 홈으로 이동하며, 약관·사인 화면이 백스택에서 사라지고, 푸시 기기 등록이 트리거된다 | USER-001, NOTIFICATION-005 | U+E | onboarding/signup__success.json | AN:SignUpViewModelTest, SignatureFlowTest |
| TC-ONB-025 | Given social-signup 응답에 토큰이 이미 있음 / When 가입 성공 후 / Then 별도 social-login 재호출이 0건이다(기존 Android의 재로그인 단계를 두지 않음) | API§2.1 끝 | U | onboarding/signup__success.json | AN:AuthRepositoryImplTest(재로그인 단계) [차이: 신규 규칙] |
| TC-ONB-026 | Given 첫 social-signup이 400 SIGNATURE_PROCESSING_PENDING / When 처리 / Then 같은 signupToken으로 1초 후 재요청하고 uploads/PUT은 다시 부르지 않는다 | API§5.1, 00-overview §6 | U | onboarding/signup__signature-processing-pending.json | iOS:APIAuthRepositoryTests L8 / AN:AuthRepositoryImplTest |
| TC-ONB-027 | Given PENDING이 2회 뒤 200 / When 가상 시계로 진행 / Then 2초 시점에 성공하고 총 signup 요청은 3회이다 | U12 | U | onboarding/signup__signature-processing-pending.json, onboarding/signup__success.json | AN:AuthRepositoryImplTest(PENDING 재시도) |
| TC-ONB-028 | Given PENDING이 계속됨 / When 가상 시계 / Then 최초 1회 + 재시도 10회(1초 간격, 총 11회, 10초)까지 보내고 소진하면 "사인 처리에 시간이 걸리고 있어요. 다시 시도해 주세요."를 보여 준다. 9번째와 10번째 재시도 시점이 경계다 | 00-overview §6 SIGNUP_PENDING_RETRY | U | onboarding/signup__signature-processing-pending.json | AN:AuthRepositoryImplTest(10회 타임아웃) / iOS:APIAuthRepository 재시도 |
| TC-ONB-029 | Given 타임아웃 뒤 사용자가 다시 시도 / When 처리 / Then 새 uploads부터 다시 시작한다(같은 idToken, rawNonce 재사용) [결정 필요] | API§2.1 | U | onboarding/signup-uploads__success.json | 신규 |
| TC-ONB-030 | Given PENDING 재시도 중 signupToken이 5분 만료로 401 / When 처리 / Then 로그인 화면으로 돌아가고 "로그인 정보가 만료되었어요. 다시 로그인해 주세요."를 보여 준다 | U11 | U | onboarding/signup__unauthorized.json | iOS:legacy-ios §2.2(로그인 컨텍스트 소실/401) |
| TC-ONB-031 | Given 업로드 발급이 400 "이미 가입된 소셜 계정입니다." / When 처리 / Then POST /auth/social-login을 같은 idToken, rawNonce로 다시 호출해 LOGIN_SUCCESS면 홈으로 간다 | API§2.1 | U | onboarding/signup-uploads__already-registered.json, auth/social-login__login-success.json | 신규 |
| TC-ONB-032 | Given 업로드 발급이 403 FORBIDDEN(차단) / When 처리 / Then 서버 message를 보여 주고 로그인 화면으로 돌아간다 | API§2.1 | U | onboarding/signup-uploads__forbidden-banned.json | 신규 |
| TC-ONB-033 | Given 업로드 발급이 401(ID Token 만료, nonce 불일치) / When 처리 / Then 로그인 화면 복귀 + "로그인 정보가 만료되었어요. 다시 로그인해 주세요." | API§5.1 | U | onboarding/signup-uploads__unauthorized.json | iOS:legacy-ios §2.2 / AN:SignUpViewModelTest(가입 실패) |
| TC-ONB-034 | Given signup이 400 "이미 사용된 회원가입 토큰입니다." / When 처리 / Then "회원가입을 완료하지 못했어요. 다시 시도해 주세요."이고 다음 시도는 새 uploads부터이다 | API§2.1 | U | onboarding/signup__already-used-token.json | 신규 |
| TC-ONB-035 | Given signup이 400 "사용할 수 없는 사인 이미지입니다." / When 처리 / Then "사용할 수 없는 사인이에요. 다시 그려주세요."를 보여 주고 사인 그리기 화면으로 돌아간다 | SIGN-002, U10 | U | onboarding/signup__invalid-signature.json | iOS:legacy-ios §2.2 / AN:SignUpViewModelTest |
| TC-ONB-036 | Given signup이 404 "업로드한 사인 이미지를 찾을 수 없습니다." / When 처리 / Then "사인을 다시 업로드해 주세요."를 보여 준다 | API§2.1 | U | onboarding/signup__upload-not-found.json | AN:legacy-android §2.3(업로드 없음) |
| TC-ONB-037 | Given signup이 403 FORBIDDEN / When 처리 / Then 서버 message를 보여 준다 | USER-002 | U | onboarding/signup__forbidden-banned.json | 신규 |
| TC-ONB-038 | Given 이미 가입된 같은 계정으로 signup 중복 호출이 200(기존 회원 결과) / When 처리 / Then 성공과 같게 처리한다 | USER-001 예외, API§2.1 | C+U | onboarding/signup__success.json | 신규 |
| TC-ONB-039 | Given signup이 탈퇴 회원이라며 400 "이미 가입된 소셜 계정입니다." / When 처리 / Then 일반 실패 문구를 보여 준다 | API§2.1 | U | onboarding/signup__already-registered-withdrawn.json | 신규 |
| TC-ONB-040 | Given 사인 PUT이 403(S3 서명 불일치) 또는 만료 / When 처리 / Then signup 호출 0건이고 "회원가입을 완료하지 못했어요. 다시 시도해 주세요."를 보여 준다. 다음 시도는 새 uploads부터이다 | U4, U5 | U | onboarding/presigned-put__expired.json, onboarding/presigned-put__content-type-mismatch.json | AN:OkHttpSignatureUploaderTest |
| TC-ONB-041 | Given 가입 중 네트워크 오류 또는 타임아웃 / When 처리 / Then "네트워크 연결을 확인해 주세요."를 보여 주고 그린 사인은 유지되며 다시 누를 수 있다 | D-20 | U | - | iOS:legacy-ios §2.2 / AN:SignUpViewModelTest |
| TC-ONB-042 | Given 어느 단계든 500 INTERNAL_ERROR / When 처리 / Then 일반 실패 문구를 보여 주고 가입 단계의 모든 POST(/auth/social-signup/signature/uploads 포함, D-21의 /auth/social-*)는 자동 재시도하지 않는다 | D-21 | U | common/error__internal-500.json | 신규 |
| TC-ONB-043 | Given "시작하기" 3회 연타 / When 가입 진행 / Then uploads, PUT, signup이 각 1회뿐이다 | 연타 | U | onboarding/signup__success.json | AN:ChalkakNavHostTest(사인 연타) |
| TC-ONB-044 | Given 가입 진행 중 화면이 사라짐(뒤로가기, 앱 종료) / When 응답 도착 / Then 작업이 취소되거나 결과가 버려지고 세션이 저장되지 않으며 뷰모델이 해제된다 | 취소, D-20 | U | onboarding/signup__success.json | iOS:OnboardingFeatureTests L99 |
| TC-ONB-045 | Given 가입 완료 전에 앱을 종료하고 재시작 / When 시작 / Then 세션이 없어 로그인 화면이 열린다 | overview §5 | E | boot/session__empty.json | 신규 |
| TC-ONB-046 | Given 로그인 시도 1회 안에서 idToken과 rawNonce 쌍 / When 약관, 사인, 가입을 거침 / Then 같은 쌍을 업로드 발급에 쓰고, 새 로그인 시도가 시작되면 새 쌍으로 교체된다 | API§2.1 | U | - | 신규 |
| TC-ONB-047 | Given 가입 직후 첫 홈 진입 / When 인증 사용자 / Then 알림 권한 안내가 첫 홈 진입 기준으로 1회 처리된다(PUSH 영역 규칙) | PUSH-001 참조 | U | onboarding/signup__success.json | iOS:NotificationSettingsTests L7 인접 |
| TC-ONB-048 | Given 미리보기 화면 / When 렌더링 / Then "이렇게 보여요", "다시 그리기", 가입 모드 확인 버튼 "시작하기"가 보이고 "사인 변경하기" 안내는 보이지 않는다 | legacy §2.2 | W | - | AN:SignaturePreviewScreenTest |
| TC-ONB-049 | Given 가입 화면 흐름 / When 각 화면 진입 / Then 분석 screen_view가 terms, onboarding_signature, onboarding_signature_preview 순으로 한 번씩 전송된다 | D-22 | U | - | 신규 (ANL-003 참조) |
| TC-ONB-050 | Given 카카오 신규 계정(실제 로그인) / When 개발 서버에서 약관 → 사인 → 가입 완료 / Then 실서버가 회원을 만들고 앱이 홈에 도착하며 서버에서 사인 썸네일이 조회된다 (되돌릴 수 없음) | USER-001, SIGN-001 | A | - | 신규 |
| TC-ONB-051 | Given 실제 S3 presigned PUT과 서버 사인 처리 / When 가입 직후 / Then 실제 처리 지연 동안 PENDING 재시도 스피너가 유지되다가 가입이 완료된다 | SIGN-001, 외부 S3 | A | - | 신규 |
| TC-ONB-052 | Given 실제 Notion 약관 문서 / When "보기" / Then 문서가 읽을 수 있게 로드되고 닫으면 약관 화면으로 돌아온다 (외부 서비스) | D-25 | A | - | 신규 |

## SIGN

| ID | 검증 내용 | 근거 | 구분 | fixture | 기존 |
| --- | --- | --- | --- | --- | --- |
| TC-SIGN-001 | Given 사인 캔버스에 획이 없음 / When 화면 확인 / Then "이 사인으로 할래요"가 비활성이고 되돌리기와 전체 지우기도 비활성이다 | SIGN-001 | U+W | - | AN:SignatureViewModelTest, SignatureScreenTest |
| TC-SIGN-002 | Given 점 하나만 찍음 / When 상태 확인 / Then 사인이 있는 것으로 보고 PNG에는 원으로 그려진다 | legacy-android §2.3 | U | - | AN:SignaturePngEncoderTest |
| TC-SIGN-003 | Given 포인트가 없는 빈 획 / When 상태 확인 / Then 사인이 없는 것으로 취급한다 | legacy-ios §2.2 | U | - | iOS:OnboardingFeatureTests L51 |
| TC-SIGN-004 | Given 포인트가 있는 획 / When 상태 확인 / Then 사인이 있는 것으로 취급하고 제출이 활성이다 | legacy-ios §2.2 | U | - | iOS:OnboardingFeatureTests L58 |
| TC-SIGN-005 | Given 캔버스 밖 좌표(음수, 경계 초과) 입력 / When 포인트 기록 / Then 좌표가 캔버스 영역 안으로 보정된다 | legacy-ios §2.2 | U | - | iOS:OnboardingFeatureTests L43 |
| TC-SIGN-006 | Given 획이 3개 / When "되돌리기" 3회 / Then 마지막 획부터 하나씩 사라지고 0개가 되면 제출과 되돌리기가 비활성이다 | legacy §2.3 | U | - | AN:SignatureViewModelTest(되돌리기) |
| TC-SIGN-007 | Given 획이 여러 개 / When "전체 지우기" / Then 획이 0개가 되고 제출이 비활성이며, 이어서 새로 그릴 수 있다 | legacy §2.3 | U | - | AN:SignatureViewModelTest(전체 지우기) |
| TC-SIGN-008 | Given 제출 가능 상태 / When "이 사인으로 할래요" 연타 / Then 미리보기가 한 번만 열린다 | 연타 | U+E | - | AN:ChalkakNavHostTest(rapidSignatureSubmissionsOpenOnlyOnePreview) |
| TC-SIGN-009 | Given 임의의 획 / When PNG 인코딩 / Then 출력 크기는 정확히 1024×512이다 | 00-overview §6 SIGNATURE_PNG_SIZE | U | - | AN:SignaturePngEncoderTest |
| TC-SIGN-010 | Given 임의의 획 / When PNG 픽셀 검사 / Then 배경 픽셀은 alpha 0이고 획 픽셀은 RGB(255,255,255)에 alpha>0이다(투명 배경 + 흰 획) | 00-overview §6 | U | - | iOS:SettingsScreenTests L424 / AN:SignaturePngEncoderTest |
| TC-SIGN-011 | Given 한쪽 끝에 몰린 획 / When 인코딩 / Then 콘텐츠 박스를 정규화해 패딩 48px 안쪽에 맞추고 최소 정규화 크기 0.02를 지켜 한 점이나 직선도 폭주하지 않는다 | 00-overview §6 | U | - | AN:SignaturePngEncoderTest(콘텐츠 박스) |
| TC-SIGN-012 | Given 획 / When 인코딩 / Then 획 두께 14px, 둥근 캡·조인이며 부드럽게 이어진다(골든 픽셀 비교, 평균 오차 허용치 내) | 00-overview §6 | U | - | AN:SignaturePngEncoderTest |
| TC-SIGN-013 | Given 인코딩 결과 / When 바이트 검사 / Then PNG 시그니처(89 50 4E 47 0D 0A 1A 0A)로 시작하는 유효한 PNG이다 | SIGN-002 | U | - | 신규 |
| TC-SIGN-014 | Given 인코딩 결과 크기가 1,048,576B / When 검사 / Then 허용한다 | SIGN-002, U9 | U | - | iOS:SettingsScreenTests L381 |
| TC-SIGN-015 | Given 인코딩 결과 크기가 1,048,577B / When 검사 / Then 네트워크 요청 0건으로 "사인 이미지가 1MB를 초과했어요."를 보여 준다 | SIGN-002, U9 | U | - | iOS:SettingsScreenTests L381 / AN:SIGNATURE_TOO_LARGE(화면 테스트) |
| TC-SIGN-016 | Given 수천 포인트의 매우 긴 획 / When 인코딩 / Then 1 MiB 이하이고 합리적 시간 안에 끝난다 | SIGN-002 | U | - | 신규 |
| TC-SIGN-017 | Given 미리보기 화면(변경 모드) / When 렌더링 / Then "이렇게 보여요", "다시 그리기", 확인 버튼 "사인 변경하기", 안내 "사인 변경까지 시간이 조금 걸릴 수 있어요"가 보인다 | legacy-android §2.3 | W | - | AN:SignaturePreviewScreenTest |
| TC-SIGN-018 | Given 미리보기에서 "다시 그리기" / When 탭 / Then 그리기 화면으로 돌아가고 서버 호출은 0건이다 | legacy §2.3 | U | - | AN:SignaturePreviewScreenTest |
| TC-SIGN-019 | Given 로그인 회원이 설정에서 사인 변경 / When 사인 확정 / Then 요청 순서는 POST /users/me/signature/uploads → PUT presigned → PUT /users/me/signature {signatureOriginalUploadId}이다 | SIGN-003 | C+U | signature/users-me-signature-uploads__success.json, signature/users-me-signature__put-success.json | iOS:SettingsScreenTests L336 / AN:UserRepositoryImplTest |
| TC-SIGN-020 | Given 사인 업로드 발급 응답 / When 디코딩 / Then uploadId, uploadUrl, expiresInSeconds만 읽고 contentType/maxBytes가 없어도 오류가 아니며 클라이언트 상수 image/png와 1 MiB를 쓴다 | API§1.2, D7 | C | signature/users-me-signature-uploads__success.json | AN:UserDataSourceImplTest |
| TC-SIGN-021 | Given 변경 시 PUT presigned / When 요청 확인 / Then Authorization 없음, Content-Type image/png, 본문은 PNG 바이트이다 | API§3.2 | C | signature/presigned-put__ok.json | AN:OkHttpSignatureUploaderTest |
| TC-SIGN-022 | Given PUT /users/me/signature 요청 / When 바디 확인 / Then {signatureOriginalUploadId}만 있다 | API§1.2 | C | signature/users-me-signature__put-success.json | AN:UserDataSourceImplTest |
| TC-SIGN-023 | Given 업로드 PUT이 실패 / When 처리 / Then 확정 API 호출 0건이고 "사인을 저장하지 못했어요. 다시 시도해 주세요."를 보여 준다 | legacy-android §2.3 | U | signature/presigned-put__forbidden.json | AN:SignatureChangeViewModelTest(변경 실패) |
| TC-SIGN-024 | Given 변경이 한 번 실패한 뒤 사용자가 다시 시도 / When 재시도 / Then 이전 uploadId를 재사용하지 않고 새 uploads 발급부터 시작한다 | SIGN-004 | U | signature/users-me-signature-uploads__success.json | 신규 |
| TC-SIGN-025 | Given PUT /users/me/signature 200 / When 처리 / Then 토스트 "사인 반영까지 시간이 좀 걸릴 수 있어요!"를 보여 주고 설정으로 돌아간다 | D-18 | U+W | signature/users-me-signature__put-success.json | iOS:legacy-ios §2.11 / AN:SignatureChangeViewModelTest |
| TC-SIGN-026 | Given 변경 성공 후 설정 복귀 / When 사인 카드 갱신 / Then GET /users/me/signature를 다시 불러 그 썸네일을 쓰고(썸네일 null이면 원본), 응답 signatureOriginalImageUrl을 썸네일 자리에 넣지 않는다 | D-18 | U | signature/users-me-signature__get-success.json, signature/users-me-signature__get-thumbnail-null.json | iOS:SettingsScreenTests L257 [차이: AN:UserRepositoryImpl 원본 URL 대입은 따르지 않음] |
| TC-SIGN-027 | Given PUT 응답의 URL이 기존 사인 URL / When 처리 / Then 새 사인으로 교체됐다고 가정하지 않고 화면이 다시 보일 때마다 GET으로 재조회한다 | D-18, API§3.2 | U | signature/users-me-signature__put-success.json | 신규 |
| TC-SIGN-028 | Given 400 SIGNATURE_REUPLOAD_REQUIRED(PUT) / When 처리 / Then "사인을 다시 업로드해 주세요."를 보여 주고 다음 시도는 새 uploadId부터이다 | API§5.1 | C+U | signature/users-me-signature__put-reupload-required.json | 신규 |
| TC-SIGN-029 | Given 400 BUSINESS_ERROR "사용할 수 없는 사인 이미지입니다." / When 처리 / Then "사용할 수 없는 사인이에요. 다시 그려주세요."를 보여 주고 그리기 화면으로 돌아간다 | SIGN-002, U10 | U | signature/users-me-signature__put-invalid-signature.json | iOS:legacy-ios §2.11 |
| TC-SIGN-030 | Given 403 FORBIDDEN(정지 회원) / When uploads 발급 단계 / Then 토스트 "이용이 제한되어 사인을 변경할 수 없어요."를 보여 주고 이후 요청 0건이다 | D-08, SIGN-003 | C+U | signature/users-me-signature-uploads__forbidden-banned.json | 신규 [iOS:403 → "사용할 수 없는 사인이에요"는 D-08로 대체] |
| TC-SIGN-031 | Given 403 FORBIDDEN / When PUT 확정 단계 / Then 같은 문구를 보여 주고 재요청 0건이다 | D-08 | C+U | signature/users-me-signature__put-forbidden-banned.json | 신규 |
| TC-SIGN-032 | Given 404 BUSINESS_ERROR(업로드 파일 없음) / When PUT 확정 / Then "사인 업로드를 찾을 수 없어요. 다시 시도해 주세요."를 보여 준다 | API§3.2 | U | signature/users-me-signature__put-upload-not-found.json | iOS:legacy-ios §2.11 / AN:legacy-android §2.3 |
| TC-SIGN-033 | Given 401 UNAUTHORIZED / When uploads 또는 PUT 확정 / Then refresh 후 원 요청을 1회 재전송하고, REAUTH면 로그인 화면으로 간다 | D-17 | U | signature/users-me-signature__put-unauthorized.json, auth/refresh__success.json | AN:SettingsViewModelTest(401) |
| TC-SIGN-034 | Given 네트워크 오류 / When 변경 중 / Then "네트워크 연결을 확인해 주세요."를 보여 주고 그린 사인과 미리보기가 유지된다 | D-20 | U | - | iOS:legacy-ios §2.11 |
| TC-SIGN-035 | Given 500 INTERNAL_ERROR / When uploads 발급(멱등) / Then 0.5초, 1초 백오프로 최대 2회 재시도하고, 실패하면 "사인을 저장하지 못했어요. 다시 시도해 주세요."를 보여 준다 | D-21 | C+U | signature/users-me-signature__put-internal-error.json | 신규 |
| TC-SIGN-036 | Given "사인 변경하기" 연타 / When 진행 / Then uploads 1회, PUT 1회, 확정 1회이다 | 연타 | U | - | AN:SignatureChangeViewModelTest 인접 |
| TC-SIGN-037 | Given 변경 진행 중 사용자가 뒤로가기 / When 처리 / Then 요청이 취소되거나 결과를 버리고, 확정 호출 전이면 호출 0건이며 오류가 보이지 않는다 | D-20 | U | - | 신규 |
| TC-SIGN-038 | Given 변경 진행 중 로그아웃 또는 계정 전환 / When 응답 도착 / Then 이전 계정의 사인 카드에 반영되지 않는다 | 계정 전환 | U | signature/users-me-signature__put-success.json | iOS:SettingsScreenTests L194 인접 |
| TC-SIGN-039 | Given 정지 회원 / When 설정 진입 / Then GET /users/me/signature는 성공하고 사인이 보이며 변경 시도에서만 TC-SIGN-030 문구가 나온다 | SIGN-003 | U | signature/users-me-signature__get-success.json | 신규 |
| TC-SIGN-040 | Given 사인 처리 실패 상태로 GET이 400 SIGNATURE_REGISTRATION_REQUIRED / When 설정 사인 카드 / Then "사인 재설정"으로 변경 진입을 유도하는 상태로 보이고 오류 토스트는 없다 | SIGN-004, API§5.1 | C+U+W | signature/users-me-signature__get-registration-required.json | AN:legacy-android §2.11("사인 재설정") |
| TC-SIGN-041 | Given 사인 카드 이미지 URL 로드 실패 / When 렌더링 / Then 플레이스홀더를 보이고 카드가 깨지지 않는다 | SIGN-005 | W | - | 신규 |
| TC-SIGN-042 | Given 변경 도중 뒤로가기 후 설정 복귀 / When 사인 카드 확인 / Then 기존 사인이 그대로이고 서버 호출이 0건이다 | SIGN-003 | U | - | 신규 |
| TC-SIGN-043 | Given 변경 화면 진입 / When 화면 전환 / Then screen_view가 change_signature, change_signature_preview 순으로 한 번씩 전송된다 | D-22 | U | - | 신규 (ANL-004 참조) |
| TC-SIGN-044 | Given 터치/펜으로 그리는 실제 손 제스처 / When 시뮬레이터·에뮬레이터·브라우저에서 캔버스를 그림 / Then 획이 끊기지 않고 부드럽고 지연이 거슬리지 않으며 미리보기가 사진 위에서 자연스럽다 (사람 판단) | SIGN-001 | A | - | 신규 |
| TC-SIGN-045 | Given 개발 서버 실제 회원, 실제 S3 / When 사인 변경 후 일정 시간 / Then 서버 처리가 끝나 GET /users/me/signature가 새 썸네일을 돌려주고 설정 카드가 바뀐다 (되돌릴 수 없음: 사인 교체) | SIGN-003, SIGN-004 | A | - | 신규 |

## 필요 fixture 목록

| 파일명 (shared/fixtures/ 기준) | 메서드 경로 | HTTP | 내용 요지 |
| --- | --- | --- | --- |
| onboarding/signup-uploads__success.json | POST /auth/social-signup/signature/uploads | 200 | uploadId, uploadUrl(mock presigned), expiresInSeconds 300, signupToken(가짜 JWT) |
| onboarding/signup-uploads__already-registered.json | POST /auth/social-signup/signature/uploads | 400 | BUSINESS_ERROR "이미 가입된 소셜 계정입니다." |
| onboarding/signup-uploads__forbidden-banned.json | POST /auth/social-signup/signature/uploads | 403 | FORBIDDEN "차단된 소셜 계정입니다." |
| onboarding/signup-uploads__unauthorized.json | POST /auth/social-signup/signature/uploads | 401 | UNAUTHORIZED |
| onboarding/signup__success.json | POST /auth/social-signup | 200 | userId, accessToken, expiresIn 900, refreshToken, refreshTokenExpiresIn |
| onboarding/signup__signature-processing-pending.json | POST /auth/social-signup | 400 | SIGNATURE_PROCESSING_PENDING "사인 이미지 처리 중입니다." |
| onboarding/signup__already-used-token.json | POST /auth/social-signup | 400 | BUSINESS_ERROR "이미 사용된 회원가입 토큰입니다." |
| onboarding/signup__invalid-signature.json | POST /auth/social-signup | 400 | BUSINESS_ERROR "사용할 수 없는 사인 이미지입니다." |
| onboarding/signup__upload-not-found.json | POST /auth/social-signup | 404 | BUSINESS_ERROR "업로드한 사인 이미지를 찾을 수 없습니다." |
| onboarding/signup__unauthorized.json | POST /auth/social-signup | 401 | UNAUTHORIZED (signupToken 만료) |
| onboarding/signup__forbidden-banned.json | POST /auth/social-signup | 403 | FORBIDDEN |
| onboarding/signup__already-registered-withdrawn.json | POST /auth/social-signup | 400 | BUSINESS_ERROR "이미 가입된 소셜 계정입니다." |
| onboarding/presigned-put__ok.json | PUT {uploadUrl} | 200 | 빈 본문 |
| onboarding/presigned-put__expired.json | PUT {uploadUrl} | 403 | S3 XML 오류 본문(`_raw`, `_contentType: application/xml`) |
| onboarding/presigned-put__content-type-mismatch.json | PUT {uploadUrl} | 403 | S3 SignatureDoesNotMatch 본문 |
| signature/users-me-signature__get-success.json | GET /users/me/signature | 200 | signatureOriginalImageUrl, signatureThumbnailImageUrl |
| signature/users-me-signature__get-thumbnail-null.json | GET /users/me/signature | 200 | 썸네일 null, 원본만 |
| signature/users-me-signature__get-registration-required.json | GET /users/me/signature | 400 | SIGNATURE_REGISTRATION_REQUIRED |
| signature/users-me-signature-uploads__success.json | POST /users/me/signature/uploads | 200 | uploadId, uploadUrl, expiresInSeconds 300 (contentType/maxBytes 없음) |
| signature/users-me-signature-uploads__forbidden-banned.json | POST /users/me/signature/uploads | 403 | FORBIDDEN "차단된 회원입니다." |
| signature/presigned-put__ok.json | PUT {uploadUrl} | 200 | 빈 본문 |
| signature/presigned-put__forbidden.json | PUT {uploadUrl} | 403 | S3 서명 오류 본문 |
| signature/users-me-signature__put-success.json | PUT /users/me/signature | 200 | signatureOriginalImageUrl(기존 URL일 수 있음) |
| signature/users-me-signature__put-reupload-required.json | PUT /users/me/signature | 400 | SIGNATURE_REUPLOAD_REQUIRED |
| signature/users-me-signature__put-invalid-signature.json | PUT /users/me/signature | 400 | BUSINESS_ERROR "사용할 수 없는 사인 이미지입니다." |
| signature/users-me-signature__put-upload-not-found.json | PUT /users/me/signature | 404 | BUSINESS_ERROR |
| signature/users-me-signature__put-forbidden-banned.json | PUT /users/me/signature | 403 | FORBIDDEN |
| signature/users-me-signature__put-unauthorized.json | PUT /users/me/signature | 401 | UNAUTHORIZED |
| signature/users-me-signature__put-internal-error.json | PUT /users/me/signature | 500 | INTERNAL_ERROR |
| common/error__internal-500.json | 임의 | 500 | INTERNAL_ERROR "서버에서 요청을 처리하지 못했습니다." (common-infra.md 정의) |
| auth/social-login__sign-up-required.json, auth/social-login__login-success.json, auth/refresh__success.json | 각 경로 | 200 | boot-auth.md에서 정의한 fixture를 재사용 |

## 흡수하지 않은 기존 테스트

- `iOS:SettingsScreenTests L59, L90, L111, L128, L194, L234, L44`(설정 화면의 사인 카드 조회·재진입·실패·경합): SET 영역([settings-feedback.md](settings-feedback.md))으로 옮겼다.
- `AN:SignatureFlowTest`(약관 → 사인 → 미리보기 → 홈 → 전시)의 전시 이동 부분: NAV/DISP 영역.
