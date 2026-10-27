# 테스트 카탈로그: SET, FDBK

SET은 설정 탭(사인 카드, 푸시 수신 설정 3개, 계정, 피드백 진입, 약관·버전 정보)이고 FDBK는 피드백 보내기다. 푸시 수신 설정은 항목별 낙관적 갱신과 부분 PATCH, 항목 간 독립 저장, 계정 전환 때 늦은 응답 폐기가 핵심이라 Fake 저장소와 가짜 시계로 `U`에서 촘촘히 다루고 요청 모양은 `C`로 확인한다. 피드백은 trim 후 Unicode code point 기준 1~1000자 경계(공백만, 1자, 1000자, 1001자, 결합 이모지)를 표로 닫고, POST는 자동 재시도하지 않는다는 것([D-21](../../spec/decisions.md#d-21-네트워크-타임아웃))과 입력 유지, 연타, 취소, 계정 전환을 `U`로 확인한다. 설정 화면이 부르는 로그아웃·탈퇴·사인 변경·약관 URL 로직은 각 영역 TC([boot-auth.md](boot-auth.md), [onboarding-signature.md](onboarding-signature.md))를 참조하고 여기서는 설정 화면에서의 진입·확인 다이얼로그·화면 상태만 본다. OS 알림이 차단된 상태에서의 시스템 설정 이동, 실제 Notion 약관 문서 로드, 실서버 설정·피드백 왕복, 한글 IME 입력 감각처럼 OS UI나 외부 서비스가 필요한 것만 `A`이며 시나리오는 [agent-scenarios/settings-feedback.md](../agent-scenarios/settings-feedback.md)에 있다.

표기: fixture 열 경로는 `shared/fixtures/` 아래다. `-`는 Fake 주입만 쓴다. 다른 영역이 정의한 fixture는 재사용하고 "필요 fixture 목록" 마지막에 출처를 적었다. 기존 열은 [legacy-ios §4.3](../../reference/legacy-ios.md), [legacy-android §4](../../reference/legacy-android.md)를 가리킨다. `[결정 필요]`는 두 앱이 다르거나 규칙이 없어 임시로 정한 것이다.

## SET

| ID | 검증 내용 | 근거 | 구분 | fixture | 기존 |
| --- | --- | --- | --- | --- | --- |
| TC-SET-001 | Given 로그인 회원 / When 설정 탭 렌더링 / Then 앱 설정(사인 카드), 푸시 알림 토글 3개, 계정(로그아웃, 회원탈퇴), 피드백 보내기, 정보 및 약관(개인정보처리방침, 이용약관, 버전정보)이 보인다 | overview §2 | W | settings/notification-settings__get-all-true.json | iOS:SettingsScreenTests L19 / AN:SettingsScreenTest |
| TC-SET-002 | Given 회원 설정 진입 / When 로드 시작 / Then GET /users/me/signature와 GET /notification-settings가 서로 독립으로 호출되고 한쪽 실패가 다른 쪽 표시를 막지 않는다 | NET | U | settings/notification-settings__get-all-true.json, signature/users-me-signature__get-success.json | AN:SettingsViewModelTest |
| TC-SET-003 | Given 회원 / When 설정 진입 / Then 사인 카드가 GET /users/me/signature의 썸네일을 보여 주고 썸네일이 null이면 원본을 쓴다 | D-18, SIGN-005 | U+W | signature/users-me-signature__get-success.json, signature/users-me-signature__get-thumbnail-null.json | iOS:SettingsScreenTests L44 |
| TC-SET-004 | Given 이미 사인이 보임 / When 설정에 다시 진입 / Then 기존 사인을 유지한 채 최신 사인을 다시 조회하고 응답이 오면 교체한다 | D-18 | U | signature/users-me-signature__get-success.json | iOS:SettingsScreenTests L59 / AN:SettingsViewModelTest(재진입) |
| TC-SET-005 | Given 이미 사인이 보임 / When 재조회가 실패 / Then 기존 사인을 유지하고 빈 카드로 바꾸지 않는다 | D-20 | U | signature/users-me-signature__get-internal-error.json | iOS:SettingsScreenTests L90 / AN:SettingsViewModelTest |
| TC-SET-006 | Given 최초 사인 조회가 실패 / When 렌더링 / Then "사인을 불러오지 못했어요. 다시 시도해 주세요."와 다시 불러오기 수단이 보이고 다시 시도하면 재조회한다 | D-20 | U+W | signature/users-me-signature__get-internal-error.json | iOS:SettingsScreenTests L128 |
| TC-SET-007 | Given 사인 조회가 진행 중 / When 같은 화면에서 재진입 트리거 / Then 중복 요청이 나가지 않는다 | 연타 | U | - | AN:SettingsViewModelTest(갱신 중 중복 방지) |
| TC-SET-008 | Given 게스트 / When 설정 진입 / Then 사인·푸시 설정 API 호출이 0건이다 | D-05 | U | - | iOS:SettingsScreenTests L111 |
| TC-SET-009 | Given 사인 변경 전에 시작된 조회가 아직 진행 중 / When 변경이 성공한 뒤 그 조회 응답이 도착 / Then 오래된 조회 결과는 반영하지 않는다 | 늦은 응답 | U | signature/users-me-signature__get-success.json | iOS:SettingsScreenTests L194 |
| TC-SET-010 | Given 사인 변경이 실패 / When 진행 중이던 조회 응답 도착 / Then 그 조회 결과는 정상 반영된다 | 늦은 응답 | U | signature/users-me-signature__get-success.json | iOS:SettingsScreenTests L234 |
| TC-SET-011 | Given 사인 변경 성공 후 설정 복귀 / When 카드 갱신 / Then GET으로 재조회한 썸네일로 즉시 바뀐다(원본 URL 대입 아님) | D-18 | U | signature/users-me-signature__get-success.json | iOS:SettingsScreenTests L257 [AN:UserRepositoryImpl 원본 URL 대입은 따르지 않음] |
| TC-SET-012 | Given 사인 조회가 401 / When 처리 / Then refresh 후 1회 재전송, REAUTH면 로그인 화면으로 간다 | D-17 | U | signature/users-me-signature__get-unauthorized.json, auth/refresh__success.json | AN:SettingsViewModelTest(401) |
| TC-SET-013 | Given 사인 조회 요청 / When 요청 확인 / Then 경로 /users/me/signature, 메서드 GET, Bearer 헤더이다 | API§1.2 | C | signature/users-me-signature__get-success.json | iOS:SettingsScreenTests L277 |
| TC-SET-014 | Given GET /notification-settings 응답 / When 디코딩 / Then topicPushEnabled, moderationPushEnabled, aiReviewPushEnabled를 읽고 꺼진 AI 설정도 그대로 반영한다 | NOTIFICATION-006 | C | settings/notification-settings__get-ai-off.json | iOS:NotificationSettingsTests L380, L438 |
| TC-SET-015 | Given 세 필드 중 하나가 없거나 null / When 디코딩 / Then 잘못된 응답으로 처리해 토글을 사용할 수 없게 한다 | NOTIFICATION-006 | C+U | settings/notification-settings__get-field-missing.json, settings/notification-settings__get-null-field.json | iOS:NotificationSettingsTests L461 |
| TC-SET-016 | Given 설정 로드 실패 / When 렌더링 / Then 토글이 비활성이고 "알림 설정을 불러오지 못했어요. 다시 시도해 주세요."와 재시도 수단이 보이며 재시도하면 다시 불러온다 | D-20 | U+W | settings/notification-settings__get-internal-error.json | iOS:NotificationSettingsTests L362 / AN:SettingsViewModelTest |
| TC-SET-017 | Given 설정 로드 중 / When 렌더링 / Then 토글은 아직 눌리지 않는 상태(로딩)이다 | NET | W | - | 신규 |
| TC-SET-018 | Given 토글 3개 / When 렌더링 / Then 라벨이 "오늘 주제 알림", "게시물 승인·반려 알림", "AI 피드백 완료 알림"이고 상태가 서버 값과 같다(checked 상태 노출) | NOTIFICATION-006 | W | settings/notification-settings__get-all-true.json | AN:SettingsPushNotificationCardTest |
| TC-SET-019 | Given 오늘 주제 토글 변경 / When 저장 / Then PATCH /notification-settings 바디가 {topicPushEnabled}만 있다 | S2, NOTIFICATION-006 | C+U | settings/notification-settings__patch-no-content.json | iOS:NotificationSettingsTests L82, L397 |
| TC-SET-020 | Given 승인·반려 토글 변경 / When 저장 / Then 바디가 {moderationPushEnabled}만 있다 | S2 | C+U | settings/notification-settings__patch-no-content.json | iOS:NotificationSettingsTests L96, L411 |
| TC-SET-021 | Given AI 피드백 토글 변경 / When 저장 / Then 바디가 {aiReviewPushEnabled}만 있다 | S2 | C+U | settings/notification-settings__patch-no-content.json | iOS:NotificationSettingsTests L110, L424 |
| TC-SET-022 | Given PATCH 204 본문 없음 / When 응답 처리 / Then 성공으로 읽고 본문 디코딩을 시도하지 않는다 | API§1.5 | C | settings/notification-settings__patch-no-content.json | iOS:NotificationSettingsTests L447 |
| TC-SET-023 | Given 토글을 탭 / When 응답 전 / Then 즉시 새 상태로 보인다(낙관적) | NOTIFICATION-006 | U+W | settings/notification-settings__patch-no-content.json | iOS:NotificationSettingsTests L250 / AN:SettingsViewModelTest |
| TC-SET-024 | Given 저장 실패(네트워크, 500) / When 처리 / Then 해당 토글만 이전 값으로 돌아오고 토스트 "알림 설정을 저장하지 못했어요. 다시 시도해 주세요."가 뜬다 [결정 필요: AN 문구는 "푸시 알림 설정을 저장하지 못했어요."] | D-20 | U | settings/notification-settings__patch-internal-error.json | iOS:NotificationSettingsTests L235 / AN:SettingsViewModelTest |
| TC-SET-025 | Given 주제 저장이 실패 / When 처리 / Then 이미 성공한 검수 토글 변경은 유지된다 | NOTIFICATION-006 예외 | U | settings/notification-settings__patch-internal-error.json | iOS:NotificationSettingsTests L284 |
| TC-SET-026 | Given 검수 저장이 실패 / When 처리 / Then 이미 성공한 다른 토글 변경은 유지된다 | NOTIFICATION-006 예외 | U | settings/notification-settings__patch-internal-error.json | iOS:NotificationSettingsTests L265 |
| TC-SET-027 | Given AI 저장이 실패 / When 처리 / Then 성공한 다른 설정은 유지되고 같은 실패 항목의 중복 저장은 막힌다 | NOTIFICATION-006 예외 | U | settings/notification-settings__patch-internal-error.json | iOS:NotificationSettingsTests L128 |
| TC-SET-028 | Given 같은 항목 저장 중 / When 같은 토글을 다시 탭 / Then 요청은 한 번만 나가고 두 번째 입력은 무시된다 | 연타 | U | settings/notification-settings__patch-no-content.json | iOS:NotificationSettingsTests L180 / AN:SettingsViewModelTest |
| TC-SET-029 | Given 주제 저장 중 / When 검수 또는 AI 토글을 탭 / Then 비활성화되지 않고 독립적으로 별도 PATCH가 나간다 | NOTIFICATION-006 예외 | U | settings/notification-settings__patch-no-content.json | iOS:NotificationSettingsTests L199, L219 / AN:SettingsPushNotificationCardTest |
| TC-SET-030 | Given 저장 중 화면 이탈(취소) / When 처리 / Then 토글이 이전 값으로 복구되고 오류 토스트는 뜨지 않는다 | D-20 | U | - | iOS:NotificationSettingsTests L301 |
| TC-SET-031 | Given 저장 도중 계정이 바뀜(로그아웃 후 다른 계정) / When 이전 계정의 저장 응답 도착 / Then 이전 계정 설정을 적용하지 않는다 | 계정 전환 | U | settings/notification-settings__patch-no-content.json | iOS:NotificationSettingsTests L163, L333 |
| TC-SET-032 | Given reset(계정 전환) 이후 / When 이전 계정의 조회 응답이 늦게 도착 / Then 반영하지 않는다 | 계정 전환 | U | settings/notification-settings__get-all-true.json | iOS:NotificationSettingsTests L318 |
| TC-SET-033 | Given 재조회가 실패 / When 설정 변경 시도 / Then 오래된 서버 값을 기준으로 변경하지 않는다 | 늦은 응답 | U | settings/notification-settings__get-internal-error.json | iOS:NotificationSettingsTests L348 |
| TC-SET-034 | Given 설정 PATCH 또는 GET이 401 / When 처리 / Then refresh 후 1회 재전송하고 REAUTH면 로그인 화면으로 간다 | D-17 | C+U | settings/notification-settings__patch-unauthorized.json, settings/notification-settings__get-unauthorized.json | iOS:NotificationSettingsTests L455 |
| TC-SET-035 | Given PATCH가 네트워크 오류·500 / When 처리 / Then PATCH는 멱등이라 0.5초, 1초 백오프로 최대 2회 재시도하고 소진 후 롤백 + 토스트를 띄운다 | D-21 | U | settings/notification-settings__patch-internal-error.json | 신규 |
| TC-SET-036 | Given 토글 변경 요청 생성 / When 바디가 비게 되는 경우 / Then 빈 PATCH를 보내지 않는다(서버 400 "변경할 푸시 수신 설정을 하나 이상 입력해주세요." 방지) | S1 | U+C | settings/notification-settings__patch-bad-request-empty.json | 신규 |
| TC-SET-037 | Given 로그아웃 후 다른 계정으로 로그인 / When 설정 진입 / Then 이전 계정의 토글·사인이 보이지 않고 새로 조회한다 | 계정 전환 | U | settings/notification-settings__get-topic-off.json | 신규 |
| TC-SET-038 | Given OS 알림 권한이 차단된 상태 / When 서버 토글을 켬 / Then 시스템 알림 설정 열기가 1회 호출된다. OS 권한이 허용이면 호출하지 않는다. 서버 PATCH 전송 여부는 기능 문서 확정에 따른다 | NOTIFICATION-006 | U | - | iOS:NotificationSettingsTests L34 / AN:legacy-android §2.11(테스트 없음) |
| TC-SET-039 | Given 설정 화면 / When 렌더링 / Then OS 권한 상태 행은 없고 서버 토글 3개만 있다 | NOTIFICATION-006 | W | - | iOS:chalkakUITests L259 |
| TC-SET-040 | Given Web / When 설정 렌더링 / Then 푸시 수신 설정 카드를 보일지(서버 설정은 계정 단위) 숨길지 [결정 필요: Q-04 후속]. 어느 쪽이든 OS 권한 이동 동작은 없다 | Q-04 | W | - | 신규 (Web 한정) |
| TC-SET-041 | Given 로그아웃 행 탭 / When 다이얼로그 / Then "정말 로그아웃 하시겠습니까?"가 뜨고 확인/취소가 있으며 로그아웃과 회원탈퇴 다이얼로그는 문구와 강조 방식이 구분된다 | D-16 | W | - | iOS:SettingsScreenTests L8 / AN:SettingsScreenTest |
| TC-SET-042 | Given 로그아웃 다이얼로그 / When 취소 / Then API 호출 0건이고 설정 화면이 유지된다 | D-16 | U | - | AN:SettingsViewModelTest |
| TC-SET-043 | Given 로그아웃 다이얼로그 / When 확인 / Then 로그인 화면이 열린다(요청 순서는 TC-AUTH-035) | D-16 | E | auth/logout__no-content.json | AN:SettingsViewModelTest |
| TC-SET-044 | Given 회원탈퇴 행 탭 / When 다이얼로그 / Then "정말 회원탈퇴 하시겠습니까?"가 뜬다 | D-16 | W | - | iOS:SettingsScreenTests L8 |
| TC-SET-045 | Given 회원탈퇴 다이얼로그 / When 취소 / Then DELETE 호출 0건이다 | D-16 | U | - | AN:SettingsViewModelTest |
| TC-SET-046 | Given 탈퇴 요청 성공 또는 실패 / When 처리 / Then 성공이면 로그인 화면, 실패면 설정 화면과 세션 유지 + 토스트 "요청을 처리하지 못했어요. 다시 시도해 주세요."(요청 세부는 TC-AUTH-043, 044) | D-16 | E | auth/users-me__delete-no-content.json, auth/users-me__delete-internal-error.json | iOS:SettingsScreenTests L154, L176 / AN:SettingsViewModelTest |
| TC-SET-047 | Given 개인정보처리방침 또는 이용약관 행 탭 / When 처리 / Then 해당 Notion 문서 시트·다이얼로그가 열리고(Web은 새 탭) screen_view privacy_policy, terms_of_service가 각각 1회 전송된다. URL·호스트 판정은 TC-ONB-009~011을 따른다 | D-25, D-22 | E+U | - | iOS:SettingsScreenTests L471 / AN:LegalDocumentLauncherTest |
| TC-SET-048 | Given 문서 로딩 실패 / When 렌더링 / Then "문서를 불러오지 못했어요"와 "다시 시도"가 보인다(TC-ONB-012와 같은 컴포넌트) | D-25 | W | - | AN:LegalDocumentLauncherTest |
| TC-SET-049 | Given 버전정보 행 / When 렌더링 / Then 빌드 설정의 앱 버전 문자열과 같은 값이 보인다 | overview §2 | U+W | - | AN:SettingsScreenTest(버전정보=versionName) |
| TC-SET-050 | Given 회원 / When "피드백 보내기" 탭 / Then 피드백 화면이 열린다. 게스트는 TC-NAV-022 | D-05 | E | - | iOS:chalkakUITests L279 |
| TC-SET-051 | Given 오프라인 / When 설정 진입 / Then 사인·푸시 설정은 각각 오류 상태이고 계정, 피드백, 약관, 버전 행은 정상 동작한다 | D-20 | U+E | - | 신규 |
| TC-SET-052 | Given 설정 진입 / When 화면 표시 / Then screen_view `settings`가 1회 전송된다 | D-22 | U | - | 신규 (ANL-005 참조) |
| TC-SET-053 | Given 회원·게스트 설정 화면 / When 스크린샷 / Then 두 화면이 플랫폼 기준 이미지와 같다 | NAV | S | - | iOS:SettingsScreenTests L19 |
| TC-SET-054 | Given OS 알림이 꺼진 시뮬레이터·에뮬레이터 / When 설정에서 서버 토글을 켬 / Then 시스템 알림 설정 화면으로 실제 이동하고 돌아오면 앱이 정상 상태이다 | NOTIFICATION-006 | A | - | 신규 |
| TC-SET-055 | Given 실제 Notion 약관 문서 / When 설정에서 이용약관·개인정보처리방침을 엶 / Then 문서가 로드되고 읽을 수 있으며 닫으면 설정으로 돌아온다 | D-25 | A | - | 신규 |
| TC-SET-056 | Given 개발 서버 실제 회원 / When 푸시 수신 설정을 바꾸고 앱을 재시작 / Then GET 결과가 바꾼 값과 같고 원복할 수 있다 (되돌릴 수 있음) | NOTIFICATION-006 | A | - | 신규 |

## FDBK

| ID | 검증 내용 | 근거 | 구분 | fixture | 기존 |
| --- | --- | --- | --- | --- | --- |
| TC-FDBK-001 | Given 회원 / When 설정의 "피드백 보내기" / Then 피드백 화면이 열리고 screen_view `feedback`이 1회 전송된다 | FEEDBACK-001, D-22 | E | - | AN:legacy-android §2.12 |
| TC-FDBK-002 | Given 피드백 화면 / When 렌더링 / Then 안내 문구(copy 키), 보조 설명, 입력창 플레이스홀더 "내용을 입력해 주세요.", 글자 수 카운터, "보내기" 버튼이 보인다 | FEEDBACK-002 | W | - | iOS:FeedbackFeatureTests L223 / AN:legacy-android §2.12 |
| TC-FDBK-003 | Given 초기 상태 / When 확인 / Then "보내기"가 비활성이다 | FEEDBACK-002 | U+W | - | iOS:FeedbackFeatureTests L9 / AN:FeedbackViewModelTest |
| TC-FDBK-004 | Given 입력이 공백만(스페이스, 탭, 개행, 전각 공백 U+3000 조합) / When 확인 / Then 전송 불가이고 서버 호출 0건이다 | FEEDBACK-002, B1 | U | - | iOS:FeedbackFeatureTests L9, L53 / AN:FeedbackRepositoryImplTest |
| TC-FDBK-005 | Given trim 후 1 code point / When 확인 / Then 전송 가능이다 | FEEDBACK-002 | U | - | iOS:FeedbackFeatureTests L9 |
| TC-FDBK-006 | Given trim 후 정확히 1000 code point / When 전송 / Then 허용되고 요청이 나간다 | B2 | U | feedback/feedbacks__created.json | iOS:FeedbackFeatureTests L19 |
| TC-FDBK-007 | Given trim 후 1001 code point / When 전송 시도 / Then 요청 0건이고 "피드백은 1자 이상 1000자 이하로 입력해 주세요."를 보여 준다 | B2 | U | - | iOS:FeedbackFeatureTests L171 / AN:FeedbackRepositoryImplTest |
| TC-FDBK-008 | Given 앞뒤 공백 포함 총 1002자, trim 후 1000자 / When 전송 / Then 허용되고 서버로 가는 content는 trim 값이다 | B3, FEEDBACK-002 | U+C | feedback/feedbacks__created.json | iOS:FeedbackFeatureTests L36 / AN:FeedbackRepositoryImplTest(trim) |
| TC-FDBK-009 | Given 이모지 1000개(UTF-16 2000) / 1001개 / When 확인 / Then 1000개는 허용, 1001개는 거부(code point 기준) | FEEDBACK-002 | U | - | iOS:FeedbackFeatureTests L19 |
| TC-FDBK-010 | Given 결합 이모지 👨‍👩‍👧(code point 5개)를 200개(=1000) / 201개(=1005) / When 확인 / Then 200개는 허용, 201개는 거부 (grapheme 기준으로 세지 않는다) | FEEDBACK-002, D-01 취지 | U | - | 신규 |
| TC-FDBK-011 | Given 분해형 한글(NFD)과 조합형 한글 / When 길이 계산 / Then 정규화하지 않고 code point 그대로 센다 | FEEDBACK-002 | U | - | 신규 |
| TC-FDBK-012 | Given 중간에 개행·연속 공백이 있는 내용 / When 전송 / Then 앞뒤만 제거하고 중간 공백은 보존한다 | FEEDBACK-002 | U+C | feedback/feedbacks__created.json | 신규 |
| TC-FDBK-013 | Given 입력 중 / When 카운터 확인 / Then 카운터가 trim 후 code point 수와 항상 같다(1000 초과 표시도 일관) | FEEDBACK-002 | W | - | AN:legacy-android §2.12(카운터) |
| TC-FDBK-014 | Given 10만 자를 붙여넣음 / When 화면 / Then UI가 멈추지 않고 카운터가 정확하며 전송은 거부된다 | FEEDBACK-002 | U+W | - | 신규 |
| TC-FDBK-015 | Given 전송 / When 요청 확인 / Then POST /feedbacks, JSON 바디 {content}, Bearer 헤더, Content-Type application/json이다 | API§1.4 | C | feedback/feedbacks__created.json | iOS:FeedbackFeatureTests L108 |
| TC-FDBK-016 | Given 201 응답 / When 디코딩 / Then feedbackId, createdAt(UTC Instant)을 읽는다 | API§1.4 | C | feedback/feedbacks__created.json | AN:FeedbackRepositoryImplTest |
| TC-FDBK-017 | Given 전송 성공 / When 처리 / Then 토스트 "피드백을 보내주셔서 감사해요."가 뜨고 화면이 닫히며 입력은 비워진다 | FEEDBACK-001 | U+E | feedback/feedbacks__created.json | AN:FeedbackViewModelTest(토스트 소비) |
| TC-FDBK-018 | Given 전송 중 / When 확인 / Then 버튼이 "보내는 중..."이고 비활성이다 | 연타 | W | - | AN:legacy-android §2.12 |
| TC-FDBK-019 | Given 보내기 버튼을 3회 연타 / When 처리 / Then POST는 1회뿐이다 | 연타 | U | feedback/feedbacks__created.json | AN:FeedbackViewModelTest |
| TC-FDBK-020 | Given 성공 후 화면을 다시 엶 / When 확인 / Then 이전 내용이 남아 있지 않다 | FEEDBACK-003 | U | feedback/feedbacks__created.json | 신규 |
| TC-FDBK-021 | Given 서버가 400 BUSINESS_ERROR / When 처리 / Then 서버 message를 그대로 보여 주고 입력은 유지된다 [차이: AN은 고정 문구 "피드백은 1자 이상 1000자 이하로 입력해 주세요."] | D-02, API§5.1 | C+U | feedback/feedbacks__bad-request-blank.json, feedback/feedbacks__bad-request-too-long.json | iOS:FeedbackFeatureTests L84, L136 / AN:FeedbackViewModelTest |
| TC-FDBK-022 | Given 401 UNAUTHORIZED / When 처리 / Then refresh 후 원 요청을 1회 재전송해 성공하면 정상 완료한다 | D-17, K1 | U | feedback/feedbacks__unauthorized.json, auth/refresh__success.json | iOS:FeedbackFeatureTests L156 |
| TC-FDBK-023 | Given 401 REAUTHENTICATION_REQUIRED / When 처리 / Then 로그인 화면으로 이동한다(재인증 이벤트) | D-17 | U | auth/refresh__reauthentication-required.json | iOS:FeedbackFeatureTests L69 / AN:FeedbackViewModelTest |
| TC-FDBK-024 | Given 500 INTERNAL_ERROR / When 처리 / Then "피드백을 보내지 못했어요. 다시 시도해 주세요."를 보여 주고 입력은 유지되며 요청은 1회뿐이다(자동 재시도 금지) | D-21 | C+U | feedback/feedbacks__internal-error.json | AN:FeedbackViewModelTest |
| TC-FDBK-025 | Given 연결 실패 또는 타임아웃 / When 처리 / Then "네트워크 연결을 확인해 주세요."를 보여 주고 입력은 유지되며 자동 재시도는 없고 사용자가 다시 보낼 수 있다 | D-20, D-21 | U | - | AN:FeedbackViewModelTest(네트워크) |
| TC-FDBK-026 | Given 타임아웃 뒤 사용자가 수동 재전송 / When 서버가 이미 첫 요청을 저장했을 수 있음 / Then 클라이언트는 중복 제거를 하지 않고 한 번 더 보낸다(제출 횟수 제한 없음) | FEEDBACK-001 | U | feedback/feedbacks__created.json | 신규 |
| TC-FDBK-027 | Given 503/429와 Retry-After / When POST 실패 / Then 재시도 없이 일반 오류 문구를 보여 준다 | D-21, Q-14 | U | common/error__service-unavailable-503.json | 신규 |
| TC-FDBK-028 | Given 정지(BANNED) 회원 / When 전송 / Then 201 성공으로 처리한다(정지 안내 문구 없음) | FEEDBACK-001, B4 | U | feedback/feedbacks__created.json | 신규 |
| TC-FDBK-029 | Given 전송 중 화면 이탈 / When 처리 / Then 요청 취소 오류가 보이지 않는다 | D-20 | U | - | AN:FeedbackViewModelTest(취소) |
| TC-FDBK-030 | Given 전송 중 로그아웃 또는 계정 전환 / When 응답 도착 / Then 토스트도 화면 전환도 일으키지 않는다 | 계정 전환 | U | feedback/feedbacks__created.json | 신규 |
| TC-FDBK-031 | Given 오류로 실패 / When 앱이 백그라운드로 갔다 복귀하거나 기기가 회전 / Then 입력 내용이 유지된다 | FEEDBACK-002 | E | - | 신규 |
| TC-FDBK-032 | Given 화면 닫기 / When 닫기 버튼, 아래 스와이프(iOS), 뒤로가기(Android·Web) / Then 설정으로 돌아간다. 입력 중 드래그해도 내용이 보존된다(NAV-047, 048) | NAV | E | - | iOS:chalkakUITests L279, L317 |
| TC-FDBK-033 | Given 키보드가 올라온 상태 / When 스크린샷 / Then "보내기" 버튼과 입력창이 키보드에 가려지지 않는다 | NAV | S | - | 신규 |
| TC-FDBK-034 | Given 분석 이벤트 / When 피드백 전송 / Then screen_view와 탭 이벤트 외에 피드백 내용이 로그·분석 파라미터에 남지 않는다 | D-22 | U | - | 신규 |
| TC-FDBK-035 | Given 게스트 / When 설정의 피드백 탭 / Then 토스트만 뜨고 화면과 API가 없다(TC-NAV-022) | D-05 | U | - | iOS:legacy-ios §1.3 |
| TC-FDBK-036 | Given 개발 서버 실제 회원 / When 피드백 한 건 전송 / Then 201이 오고 성공 토스트 후 화면이 닫힌다 (서버에 영구 저장되며 되돌릴 수 없음) | FEEDBACK-001 | A | - | 신규 |
| TC-FDBK-037 | Given 한글 IME 조합 입력, 이모지 키보드, 긴 문장 / When 시뮬레이터·에뮬레이터·브라우저에서 입력 / Then 조합 중 글자가 깨지거나 카운터가 튀지 않고 입력감이 자연스럽다 (사람 판단) | FEEDBACK-002 | A | - | 신규 |

## 필요 fixture 목록

| 파일명 (shared/fixtures/ 기준) | 메서드 경로 | HTTP | 내용 요지 |
| --- | --- | --- | --- |
| settings/notification-settings__get-all-true.json | GET /notification-settings | 200 | 세 필드 모두 true |
| settings/notification-settings__get-topic-off.json | GET /notification-settings | 200 | topicPushEnabled false, 나머지 true |
| settings/notification-settings__get-ai-off.json | GET /notification-settings | 200 | aiReviewPushEnabled false |
| settings/notification-settings__get-field-missing.json | GET /notification-settings | 200 | aiReviewPushEnabled 키 누락(계약 위반) |
| settings/notification-settings__get-null-field.json | GET /notification-settings | 200 | moderationPushEnabled null |
| settings/notification-settings__get-unauthorized.json | GET /notification-settings | 401 | UNAUTHORIZED |
| settings/notification-settings__get-internal-error.json | GET /notification-settings | 500 | INTERNAL_ERROR |
| settings/notification-settings__patch-no-content.json | PATCH /notification-settings | 204 | 본문 없음 |
| settings/notification-settings__patch-bad-request-empty.json | PATCH /notification-settings | 400 | BUSINESS_ERROR "변경할 푸시 수신 설정을 하나 이상 입력해주세요." |
| settings/notification-settings__patch-unauthorized.json | PATCH /notification-settings | 401 | UNAUTHORIZED |
| settings/notification-settings__patch-internal-error.json | PATCH /notification-settings | 500 | INTERNAL_ERROR |
| signature/users-me-signature__get-internal-error.json | GET /users/me/signature | 500 | INTERNAL_ERROR (SET에서 추가 정의) |
| signature/users-me-signature__get-unauthorized.json | GET /users/me/signature | 401 | UNAUTHORIZED (SET에서 추가 정의) |
| feedback/feedbacks__created.json | POST /feedbacks | 201 | feedbackId(UUID), createdAt(UTC Instant) |
| feedback/feedbacks__bad-request-blank.json | POST /feedbacks | 400 | BUSINESS_ERROR "피드백 내용이 필요합니다." |
| feedback/feedbacks__bad-request-too-long.json | POST /feedbacks | 400 | BUSINESS_ERROR "피드백 내용은 1000자 이하여야 합니다." |
| feedback/feedbacks__unauthorized.json | POST /feedbacks | 401 | UNAUTHORIZED |
| feedback/feedbacks__internal-error.json | POST /feedbacks | 500 | INTERNAL_ERROR |
| signature/users-me-signature__get-success.json, signature/users-me-signature__get-thumbnail-null.json | GET /users/me/signature | 200 | onboarding-signature.md에서 정의 |
| auth/logout__no-content.json, auth/users-me__delete-no-content.json, auth/users-me__delete-internal-error.json, auth/refresh__success.json, auth/refresh__reauthentication-required.json | 각 경로 | 각 상태 | boot-auth.md에서 정의 |
| common/error__service-unavailable-503.json | 임의 | 503 | Retry-After 헤더 포함, common-infra.md에서 정의 |

## 흡수하지 않은 기존 테스트

- `iOS:SettingsScreenTests L336, L381, L424`(사인 변경 순서, 1MB 거부, PNG 투명 배경 + 흰 선): 사인 변경 흐름이라 SIGN 영역([onboarding-signature.md](onboarding-signature.md))으로 옮겼다.
- `iOS:SettingsScreenTests L297, L314, L325`(탈퇴 요청 모양, 401 구분, 취소 전파)는 AUTH 영역의 TC-AUTH-043, 045, 049로 흡수했다.
- `iOS:chalkakUITests L195, L238`(게스트 설정 섹션, 업로드 닫으면 설정 복귀): NAV 영역으로 옮겼다.
