# 테스트 카탈로그: NOTI, PUSH

NOTI는 알림함 목록, 알림 상세, 미읽음 표시, 읽음 처리이고, PUSH는 OS 알림 권한, 푸시 기기 등록(`PUT /push-devices/current`), 푸시 payload 파싱과 탭 이동, 포그라운드 표시를 다룬다. 알림함 항목 탭과 푸시 탭은 같은 목적지 표([D-11](../../spec/decisions.md#d-11-푸시-탭-처리))와 같은 읽음 처리 분기를 쓰므로 한 곳에서 `U`로 검증하고 양쪽이 같은 TC를 공유한다. 푸시 payload 파싱은 5개 클라이언트의 플랫폼 어댑터(iOS APNs userInfo 평탄 구조, Android intent extras, Flutter/RN 플러그인 래퍼)가 같은 공통 `PushPayload`로 변환되는지 `U`로 확인하고, 변환 이후 로직은 한 벌의 표 기반 테스트로 닫는다. 기기 등록 순서와 JWT `session_id` 처리는 가짜 토큰 공급자와 Fake 세션으로 `U`+`C`에서 끝낸다. 실제 FCM/APNs 도착, OS 권한 다이얼로그, 백그라운드·강제 종료 상태의 탭 처리, 실서버 알림함은 `A`이며 시나리오는 [agent-scenarios/notification-push.md](../agent-scenarios/notification-push.md)에 있다. 서버의 30일 보관 경계(N1~N6)는 서버 책임이라 클라이언트는 응답을 날짜로 걸러 내지 않는다는 것과 404 처리만 검증한다. Web은 [Q-04](../../spec/open-questions.md)에 따라 푸시 수신·기기 등록을 하지 않는다.

표기: fixture 열 경로는 `shared/fixtures/` 아래다. 푸시 payload fixture는 FCM `data` 맵(값이 모두 문자열)이며 `notification.title/body`는 별도 필드로 둔다. JWT fixture는 서명 없는 가짜 값이다. 기존 열은 [legacy-ios §4.3](../../reference/legacy-ios.md), [legacy-android §4](../../reference/legacy-android.md)를 가리키며 `[결정 필요]`는 임시 동작이다.

## NOTI

| ID | 검증 내용 | 근거 | 구분 | fixture | 기존 |
| --- | --- | --- | --- | --- | --- |
| TC-NOTI-001 | Given 인증 사용자 홈 / When 알림 벨 탭 / Then 알림 목록 화면이 열리고 screen_view `notifications`가 1회 전송된다 | D-22 | E | notification/notifications__page1.json | iOS:chalkakUITests L348 / AN:ChalkakNavHostTest |
| TC-NOTI-002 | Given 목록 첫 진입 / When 요청 / Then GET /notifications?page=1&pageSize=20이 인증 헤더와 함께 나간다 | API§1.5 | C | notification/notifications__page1.json | iOS:NotificationInboxTests L191 |
| TC-NOTI-003 | Given 목록 응답 / When 디코딩 / Then id, type, sourceType, sourceId, title, body, thumbnailImageUrl, readAt, createdAt을 읽고 null/생략 필드와 UTC Instant(소수초 유무)를 모두 처리한다 | API§1.5, §0 | C | notification/notifications__page1.json | iOS:NotificationInboxTests L191 |
| TC-NOTI-004 | Given 로딩 중 / When 렌더링 / Then 로딩 문구 "알림을 불러오는 중이에요"가 보인다 | legacy-ios §2.10 | W | - | AN:NotificationScreenTest |
| TC-NOTI-005 | Given 빈 응답 / When 렌더링 / Then "아직 알림이 없어요"와 "승인이나 반려 소식이 생기면 여기에 모아둘게요"가 보인다 | legacy-ios §2.10 | W+U | notification/notifications__empty.json | iOS:legacy-ios §2.10 / AN:NotificationScreenTest |
| TC-NOTI-006 | Given 목록 로드 실패, 콘텐츠 없음 / When 렌더링 / Then 오류 화면 "알림을 불러오지 못했어요"와 "다시 시도"가 보이고 다시 시도가 재요청한다 | D-20 | U+W | notification/notifications__internal-error.json | AN:NotificationViewModelTest |
| TC-NOTI-007 | Given 네트워크 오류, 콘텐츠 없음 / When 로드 / Then "네트워크 연결을 확인해 주세요."를 보여 준다 | D-20 | U | - | AN:NotificationViewModelTest(네트워크 실패) |
| TC-NOTI-008 | Given 목록 응답이 계약 위반(필수 필드 누락, 깨진 JSON) / When 로드 / Then "알림을 불러오지 못했어요."를 보여 주고 크래시하지 않는다 | NET | C+U | notification/notifications__missing-fields.json | AN:NotificationViewModelTest |
| TC-NOTI-009 | Given 목록 응답 401/403 / When 처리 / Then 401은 refresh 후 1회 재전송, 그래도 실패면 "로그인이 필요해요."를, REAUTH면 로그인 화면을 보여 준다 | D-17 | U | notification/notifications__unauthorized.json | AN:NotificationViewModelTest(인증 오류) |
| TC-NOTI-010 | Given 목록 응답 404 / When 처리 / Then "알림이 만료되었거나 삭제됐어요. 목록을 새로고침해 주세요."로 처리하지 않고 D-24 문구 "더 이상 확인할 수 없는 알림이에요."로 통일하며 목록을 새로고침한다 | D-24 | U | notification/notifications__not-found.json | AN:NotificationViewModelTest(삭제 알림 갱신) |
| TC-NOTI-011 | Given 항목 렌더링 / When 표시 / Then 제목, 본문, 썸네일(null이면 대체 이미지), 미읽음 표시(readAt==null)가 보인다 | NOTIFICATION-002 | W | notification/notifications__page1.json | AN:NotificationScreenTest |
| TC-NOTI-012 | Given createdAt 2026-10-26T15:00:00Z / 14:59:59Z / When 시각 표시 / Then 각각 "10월 27일 00:00" / "10월 26일 23:59" 형식 "M월 d일 HH:mm"(KST) | D-09, T6 | U | notification/notifications__kst-boundary.json | AN:legacy-android §2.13 [차이: iOS는 기기 시간대였음] |
| TC-NOTI-013 | Given 기기 시간대를 UTC, America/Los_Angeles, Asia/Seoul로 바꿈 / When 같은 createdAt 표시 / Then 세 환경에서 문자열이 모두 같다 | D-09 | U | notification/notifications__kst-boundary.json | 신규 (iOS:NotificationScreen ~244 기기 로컬은 따르지 않음) |
| TC-NOTI-014 | Given 12시간제·다른 로캘(아랍어, 태국어) 기기 설정 / When 시각 표시 / Then 24시간제 ASCII 숫자로 표시된다 | D-09 | U | notification/notifications__kst-boundary.json | 신규 |
| TC-NOTI-015 | Given hasNext=true / When 끝에서 4번째 근처까지 스크롤 / Then GET page=2가 1회만 나가고 같은 위치에서 계속 스크롤해도 중복 요청이 없다 | legacy-android §2.13 | U | notification/notifications__page2-last.json | AN:NotificationViewModelTest |
| TC-NOTI-016 | Given hasNext=false / When 끝까지 스크롤 / Then 추가 요청 0건이다 | API§1.5 | U | notification/notifications__page2-last.json | iOS:NotificationInboxTests L7 |
| TC-NOTI-017 | Given 2페이지에 1페이지와 같은 id가 있음 / When 이어 붙임 / Then 중복 id를 제거하고 순서를 유지한다 | NOTIFICATION-002 | U | notification/notifications__overlap-page2.json | iOS:NotificationInboxTests L7 |
| TC-NOTI-018 | Given 다음 페이지 요청 실패 / When 처리 / Then 기존 목록과 페이지 번호를 유지하고 "다음 알림을 불러오지 못했어요. 다시 시도해 주세요." 토스트를 띄우며 재시도가 가능하다 | D-20 | U | notification/notifications__internal-error.json | iOS:NotificationInboxTests L27 |
| TC-NOTI-019 | Given 당겨서 새로고침 성공 / When 처리 / Then 목록이 교체되고 페이지가 1로 돌아간다 | NOTIFICATION-002 | U | notification/notifications__page1.json | iOS:NotificationInboxTests L7 |
| TC-NOTI-020 | Given 새로고침 실패, 기존 콘텐츠 있음 / When 처리 / Then 기존 목록을 유지하고 "알림을 새로고침하지 못했어요. 다시 시도해 주세요." 토스트만 띄운다 | D-20 | U | notification/notifications__internal-error.json | iOS:legacy-ios §2.10 |
| TC-NOTI-021 | Given 새로고침 두 개가 겹침 / When 늦게 끝난 이전 응답이 도착 / Then 버려지고 다음 페이지 기준은 최신 응답 기준이다 | 늦은 응답 | U | notification/notifications__page1.json | iOS:NotificationInboxTests L113 |
| TC-NOTI-022 | Given 로드 중 화면 이탈(취소) / When 응답이 도착하거나 취소됨 / Then 오류 토스트가 없고 취소가 통신 오류로 바뀌지 않는다 | D-20 | U | - | AN:NotificationViewModelTest(취소 전파) |
| TC-NOTI-023 | Given 목록에 createdAt이 지금부터 정확히 30일 전인 항목과 알 수 없는 오래된 항목 / When 표시 / Then 클라이언트는 날짜로 거르지 않고 서버가 준 항목을 모두 보여 준다 | NOTIFICATION-004, N1 | U | notification/notifications__30day-boundary.json | 신규 |
| TC-NOTI-024 | Given type이 알 수 없는 값(FUTURE_TYPE)이고 sourceType이 null / When 목록 렌더링 / Then 항목이 표시되고 크래시하지 않으며 탭하면 이동 없이(알림함에 머묾) 읽음 호출도 하지 않는다 | API§1.5, D-11 | C+U | notification/notifications__unknown-type.json | iOS:NotificationInboxTests L543 |
| TC-NOTI-025 | Given type이 TOPIC 또는 REMINDER인 항목이 목록에 옴 / When 탭 / Then 홈으로 이동하고 읽음 호출은 하지 않는다 | Q-11, D-11 | U | notification/notifications__topic-reminder.json | 신규 |
| TC-NOTI-026 | Given 항목 sourceType/sourceId가 null이고 type은 POST_APPROVED / When 탭 / Then 이동하지 않고 읽음 호출도 하지 않으며 오류도 아니다 | D-11 | U | notification/notifications__null-source.json | iOS:NotificationInboxTests L543 |
| TC-NOTI-027 | Given 항목 type=POST_APPROVED, sourceId 유효 / When 탭 / Then 단건 읽음 성공 후 게시물 상세(내 게시물)로 이동한다 | D-11 | U | notification/notification-read__no-content.json | 신규 |
| TC-NOTI-028 | Given 항목 type=AI_REVIEW_COMPLETED 또는 AI_REVIEW_FAILED / When 탭 / Then 읽음 성공 후 게시물 상세로 이동하고 AI 피드백 시트 자동 열기 플래그가 켜진다 | D-11 | U | notification/notification-read__no-content.json | iOS:NotificationInboxTests L530 / AN:NotificationViewModelTest(AI 결과 알림) |
| TC-NOTI-029 | Given AI 알림의 sourceType이 POST가 아니거나 sourceId가 UUID가 아님 / When 탭 / Then 피드로 이동하지 않는다 | D-11 | U | notification/notifications__bad-ai-source.json | iOS:NotificationInboxTests L543 |
| TC-NOTI-030 | Given 항목 type=NOTICE / When 탭 / Then 읽음 성공 후 notificationId로 알림 상세가 열린다(공지 sourceId가 아님) | D-11 | U | notification/notification-read__no-content.json, notification/notification-detail__notice.json | iOS:NotificationInboxTests L515 |
| TC-NOTI-031 | Given 항목 type=POST_REJECTED / When 탭 / Then 읽음 성공 후 알림 상세가 열린다 | D-11 | U | notification/notification-read__no-content.json | AN:ChalkakNavHostTest |
| TC-NOTI-032 | Given 읽음 PATCH가 네트워크 오류 / When 항목 탭 / Then 토스트 "읽음 상태를 저장하지 못했어요. 네트워크 연결을 확인해 주세요."를 띄우고 이동은 수행하며 목록의 미읽음 상태는 그대로다 | D-11 | U | - | iOS:NotificationInboxTests L72 / AN:NotificationViewModelTest |
| TC-NOTI-033 | Given 읽음 PATCH가 404 / When 항목 탭 / Then 토스트 "더 이상 확인할 수 없는 알림이에요.", 목록과 미읽음을 새로고침, 이동 안 함 | D-11, D-24 | C+U | notification/notification-read__not-found.json | iOS:NotificationInboxTests L50, L288 / AN:NotificationViewModelTest |
| TC-NOTI-034 | Given 읽음 PATCH가 500, 403, 400 / When 항목 탭 / Then 404와 같게 처리하고 이동하지 않는다 | D-11 | U | notification/notification-read__internal-error.json | AN:NotificationViewModelTest(네트워크 이외 실패는 이동 불허) |
| TC-NOTI-035 | Given 읽음 PATCH가 401 UNAUTHORIZED / When 항목 탭 / Then refresh 후 1회 재전송해 성공하면 이동하고, REAUTH면 로그인 화면으로 가며 이동하지 않는다 | D-17 | U | notification/notification-read__unauthorized.json, auth/refresh__success.json | AN:NotificationViewModelTest(인증 오류) |
| TC-NOTI-036 | Given 읽음 성공 / When 목록 확인 / Then 해당 항목이 읽음 상태로 바뀌고 미읽음 표시가 사라진다 | NOTIFICATION-003 | U+W | notification/notification-read__no-content.json | AN:NotificationViewModelTest(읽음 변경 범위) |
| TC-NOTI-037 | Given 이미 읽은 항목을 다시 탭 / When 처리 / Then 로컬 readAt은 최초 값을 유지하고 PATCH가 나가더라도 204로 성공 처리한다 | NOTIFICATION-003, N4 | U | notification/notification-read__no-content.json | iOS:NotificationInboxTests L93 |
| TC-NOTI-038 | Given 같은 항목을 빠르게 연타 / When 처리 / Then 읽음 PATCH 1회, 이동 1회이다 | 연타 | U | notification/notification-read__no-content.json | 신규 |
| TC-NOTI-039 | Given 읽음 PATCH 중 화면 이탈 / When 응답 도착 / Then 이동하지 않고 오류도 없다 | 취소 | U | - | 신규 |
| TC-NOTI-040 | Given 읽음 PATCH 중 로그아웃·계정 전환 / When 응답 도착 / Then 이전 계정 목록에 반영하거나 이동하지 않는다 | 계정 전환 | U | notification/notification-read__no-content.json | iOS:NotificationSettingsTests L318 인접 |
| TC-NOTI-041 | Given 목록·상세 조회 / When 호출 기록 확인 / Then 조회만으로 PATCH read 호출이 0건이다 | NOTIFICATION-003, N6 | U | notification/notification-detail__rejected.json | 신규 |
| TC-NOTI-042 | Given 알림 상세(반려) / When 렌더링 / Then 본인 사진 원본과 "반려 사유" 섹션이 보이고 "새로 올리기" 버튼은 없으며 "알림함으로" 버튼이 있다 | NOTIFICATION-002, API§4.1 | W+C | notification/notification-detail__rejected.json | iOS:PushNotificationTests L372 / AN:legacy-android §2.13 |
| TC-NOTI-043 | Given 반려 사유 500자(상한) 긴 텍스트 / When 렌더링 / Then 줄바꿈과 스크롤로 전문이 보인다 | NOTIFICATION-002 | W | notification/notification-detail__rejected-long-reason.json | 신규 |
| TC-NOTI-044 | Given 공지 알림 상세 / When 렌더링 / Then 제목과 본문 전문이 보이고 사진·반려 사유 영역은 없다 | NOTIFICATION-013 | C+W | notification/notification-detail__notice.json | iOS:NotificationInboxTests L300 |
| TC-NOTI-045 | Given 상세 404 / When 렌더링 / Then 이전 알림 정보를 대신 보여 주지 않고 "더 이상 확인할 수 없는 알림이에요"를 보인다 | D-24 | U+W | notification/notification-detail__not-found.json | iOS:PushNotificationTests L389 |
| TC-NOTI-046 | Given 상세 로드가 500, 네트워크 오류 / When 렌더링 / Then 다시 시도할 수 있는 상태가 되고 시도하면 재요청한다 | D-20 | U | notification/notification-detail__internal-error.json | iOS:PushNotificationTests L401 |
| TC-NOTI-047 | Given 상세 응답이 승인 알림(type POST_APPROVED) / When 렌더링 / Then 사진이 있으면 표시하고 없으면 제목·본문만 보이며 깨지지 않는다 | API§1.5 | C+W | notification/notification-detail__approved.json | 신규 |
| TC-NOTI-048 | Given 알림 상세 화면 / When 진입·이탈 / Then screen_view `notification_detail`이 1회 전송된다 | D-22 | U | - | 신규 (ANL 참조) |
| TC-NOTI-049 | Given 홈이 보이고 hasUnread=true / When 렌더링 / Then 홈 알림 벨에 미읽음 점이 보이고 false면 점이 없다 | D-10 | C+W | notification/unread-status__true.json, notification/unread-status__false.json | iOS:NotificationInboxTests L257 [차이: AN은 조회만 하고 표시 안 함] |
| TC-NOTI-050 | Given 홈이 다시 보임 / 앱 포그라운드 복귀 / 알림함에서 돌아옴 / 푸시 수신 / When 각각 발생 / Then 각각 unread-status를 1회씩 다시 조회한다 | D-10 | U | notification/unread-status__true.json | iOS:legacy-ios §2.3 |
| TC-NOTI-051 | Given 게스트 / When 홈·복귀 / Then unread-status 조회 0건이고 점이 없다 | D-10 | U | - | 신규 |
| TC-NOTI-052 | Given unread-status 조회가 실패 / When 처리 / Then 이전 점 상태를 유지하고 토스트·오류 UI가 없다 [결정 필요: 규칙 없음, 임시] | D-10, D-20 | U | notification/unread-status__internal-error.json | 신규 |
| TC-NOTI-053 | Given 로그아웃 또는 계정 전환 / When 처리 / Then 이전 계정의 미읽음 점이 즉시 사라지고 늦게 도착한 이전 계정의 unread 응답은 반영되지 않는다 | 계정 전환 | U | notification/unread-status__true.json | iOS:NotificationSettingsTests L333 인접 |
| TC-NOTI-054 | Given 읽음 처리 후 홈으로 돌아옴 / When 홈 표시 / Then 미읽음 상태가 재조회되어 점이 갱신된다 | D-10 | E | notification/unread-status__false.json | 신규 |
| TC-NOTI-055 | Given unread-status 401 / When 처리 / Then refresh 후 1회 재전송하고 REAUTH면 로그인 화면으로 간다 | D-17 | U | notification/unread-status__unauthorized.json | 신규 |
| TC-NOTI-056 | Given 개발 서버 실제 계정의 알림함 / When 알림함 열기, 항목 탭, 읽음 처리, 홈 복귀 / Then 실제 목록·읽음 상태·미읽음 점이 서버 API 조회 결과와 일치한다 (읽음 처리는 되돌릴 수 없음) | NOTIFICATION-002, NOTIFICATION-003 | A | - | 신규 |
| TC-NOTI-057 | Given 관리자가 반려 처리한 실제 알림(사람 개입) / When 알림 상세 / Then 실제 원본 사진과 반려 사유가 읽기 좋게 표시된다 (시각 판단) | NOTIFICATION-002 | A | - | 신규 |

## PUSH

| ID | 검증 내용 | 근거 | 구분 | fixture | 기존 |
| --- | --- | --- | --- | --- | --- |
| TC-PUSH-001 | Given 인증 사용자의 최초 홈 진입, OS 권한 미결정(notDetermined) / When 홈 표시 / Then 앱 안내 없이 OS 권한 요청만 1회 호출된다 (옵션 alert, badge, sound) | NOTIFICATION-005, legacy-ios §2.10 | U | - | iOS:NotificationSettingsTests L7 |
| TC-PUSH-002 | Given OS 권한이 이미 허용 또는 거부 / When 최초 홈 진입 / Then 앱 안내 다이얼로그 "알림을 허용하시겠어요?"(본문 "오늘 주제와 게시물 승인 반려 소식을 알려드려요.", 버튼 거부/허용)가 뜬다 | legacy-ios §2.10 | U+W | - | iOS:NotificationSettingsTests L14 |
| TC-PUSH-003 | Given 안내를 한 번 보여 줌 / When 이후 홈 재진입, 앱 재시작 / Then 권한 상태와 관계없이 다시 보여 주지 않는다(기기 단위 플래그) | legacy-ios §2.10 | U | - | iOS:NotificationSettingsTests L23 |
| TC-PUSH-004 | Given 게스트 / When 홈 진입 / Then 권한 요청도 안내도 없다 | D-05 | U | - | iOS:legacy-ios §2.10(인증 사용자만) |
| TC-PUSH-005 | Given OS 권한 결과(허용/거부) / When 최초 안내 선택 / Then 세 설정(topicPushEnabled, moderationPushEnabled, aiReviewPushEnabled)이 같은 불리언으로 PATCH /notification-settings 한 요청에 담겨 저장된다 | NOTIFICATION-006, S2 | C+U | settings/notification-settings__patch-no-content.json | iOS:NotificationSettingsTests L48 |
| TC-PUSH-006 | Given 설정 저장 실패(네트워크, 500) / When 최초 안내 직후 / Then 성공으로 처리하지 않고 "알림 설정을 저장하지 못했어요. 앱 설정에서 다시 시도해 주세요."를 보여 준다 | NOTIFICATION-006 | U | settings/notification-settings__patch-internal-error.json | iOS:NotificationSettingsTests L71 |
| TC-PUSH-007 | Given OS 권한 요청 자체가 오류 / When 처리 / Then "알림 권한을 요청하지 못했어요. 기기 설정에서 확인해 주세요."를 보여 준다 | legacy-ios §2.10 | U | - | iOS:legacy-ios §2.10 |
| TC-PUSH-008 | Given Android 12 이하 / When 첫 인증 진입 / Then 런타임 권한 요청 없이 진행한다 | legacy-android §1.3-6 | U | - | 신규 |
| TC-PUSH-009 | Given Android 13+ / When 첫 인증 진입 후 / Then POST_NOTIFICATIONS를 1회만 요청하고 플래그를 저장해 재요청하지 않는다 | legacy-android §1.3-6 | U | - | AN:NotificationPermission 로직(미테스트였음) |
| TC-PUSH-010 | Given 가입 완료 직후 첫 홈 진입 / When 처리 / Then 로그인 후 첫 진입과 같게 권한 안내 1회 대상이다 | NOTIFICATION-005 | U | onboarding/signup__success.json | 신규 |
| TC-PUSH-011 | Given 로그아웃 후 다른 계정으로 로그인 / When 홈 진입 / Then 안내 플래그는 기기 단위라 다시 보여 주지 않는다 [결정 필요: 계정 단위 여부] | NOTIFICATION-006 | U | - | iOS:legacy-ios §2.10(@AppStorage 기기 단위) |
| TC-PUSH-012 | Given 로그인 성공 + FCM 토큰 준비 / When 처리 / Then PUT /push-devices/current 바디가 {fcmToken}뿐(기기 ID·플랫폼 없음)이고 204를 성공으로 읽는다 | NOTIFICATION-005, API§7.2-1 | C+U | push/push-devices-current__no-content.json | iOS:PushNotificationTests L119 |
| TC-PUSH-013 | Given 가입(social-signup) 직후 / When 처리 / Then 로그인 성공과 동일하게 기기 등록을 1회 시도한다 | API§7.2-3 | U | onboarding/signup__success.json | 신규 |
| TC-PUSH-014 | Given 인증된 상태로 앱을 다시 시작 / When 시작 / Then 기기 등록이 1회 시도된다 | API§7.2-2 | U | push/jwt__with-session-id.json | AN:legacy-android §1.6(onResume) |
| TC-PUSH-015 | Given FCM 토큰 갱신(onNewToken, tokenRefresh) / When 처리 / Then 새 토큰으로 마지막 값 기준 1회 등록한다 | API§7.2-2 | U | push/push-devices-current__no-content.json | iOS:PushNotificationTests L325 |
| TC-PUSH-016 | Given 로그인하지 않은 상태에서 FCM 토큰이 먼저 도착 / When 처리 / Then 등록하지 않고, 로그인 성공 후 등록한다 | NOTIFICATION-005 | U | - | iOS:PushNotificationTests L310 |
| TC-PUSH-017 | Given 게스트 / When FCM 토큰 도착 / Then 등록 0건이다 | D-05 | U | - | iOS:PushNotificationTests L310 |
| TC-PUSH-018 | Given FCM 토큰이 아직 없음 / When 등록 시도 / Then 건너뛰고(요청 0건) 토큰이 준비되면 등록한다 | API§7.2-1 | U | - | iOS:PushNotificationTests L355 |
| TC-PUSH-019 | Given 전달받은 토큰이 없으나 SDK에 현재 토큰이 있음 / When 등록 시도 / Then 현재 FCM 토큰을 조회해 등록한다 | API§7.2 | U | - | iOS:PushNotificationTests L341 |
| TC-PUSH-020 | Given 같은 (userId, token)으로 트리거가 연달아 발생 / When 처리 / Then 요청은 1회뿐이다(중복 제거) | API§7.2 | U | - | AN:PushDeviceRegistrationCoordinator(미테스트였음) |
| TC-PUSH-021 | Given 세션 변경, onResume, onNewToken이 동시에 발생 / When 처리 / Then 등록 요청이 직렬화되어 1회만 나간다 | 연타 | U | - | AN:PushDeviceRegistrationCoordinator(뮤텍스) |
| TC-PUSH-022 | Given JWT에 session_id 클레임이 있음 / When 등록 / Then refresh 없이 바로 등록한다 | API§7.2-4 | U | push/jwt__with-session-id.json | iOS:PushNotificationTests L119, L231 / AN:PushSessionReadinessTest |
| TC-PUSH-023 | Given JWT에 session_id 클레임이 없음 / When 등록 / Then 먼저 POST /auth/refresh로 새 JWT를 받고 새 토큰으로 등록한다 | API§7.2-4 | U | push/jwt__without-session-id.json, auth/refresh__success.json | iOS:PushNotificationTests L140 |
| TC-PUSH-024 | Given 갱신한 JWT에도 session_id가 없음 / When 등록 / Then 등록 요청 0건이고 로그인은 유지된다 | API§7.2-5 | U | push/jwt__without-session-id.json | iOS:PushNotificationTests L163 |
| TC-PUSH-025 | Given session_id 확인을 위한 refresh가 REAUTHENTICATION_REQUIRED / When 처리 / Then 세션을 지우고 로그인 화면으로 간다 | API§5.1 | U | auth/refresh__reauthentication-required.json | AN:PushSessionReadinessTest(갱신 거절=재인증) |
| TC-PUSH-026 | Given JWT 판별 / When 잘못된 형식, 점이 2개 아님, base64 오류, payload가 JSON 아님 / Then 예외 없이 session_id 없음으로 취급한다 (서명 검증은 하지 않는다) | API§7.2 | U | push/jwt__malformed.json | iOS:PushNotificationTests L231 |
| TC-PUSH-027 | Given 만료된 access 토큰으로 등록 → 401 UNAUTHORIZED / When 처리 / Then refresh 후 1회 재등록한다 | D-17, K1 | U | push/push-devices-current__unauthorized.json | iOS:PushNotificationTests L181 |
| TC-PUSH-028 | Given 등록이 401 REAUTHENTICATION_REQUIRED / When 처리 / Then refresh를 시도하고 성공하면 재등록, refresh도 REAUTH면 로그인 화면으로 간다 | API§5.1 | C+U | push/push-devices-current__reauthentication-required.json | iOS:PushNotificationTests L181 인접 |
| TC-PUSH-029 | Given 등록이 계속 거절됨(400, 401 반복) / When 처리 / Then 기기 등록 실패만으로 로그인을 해제하지 않고 토스트도 띄우지 않는다 | NOTIFICATION-005 예외 | U | push/push-devices-current__reauthentication-required.json | iOS:PushNotificationTests L206 |
| TC-PUSH-030 | Given 등록이 네트워크 오류, 500 / When 처리 / Then PUT은 멱등이라 0.5초, 1초 백오프로 최대 2회 재시도하고 그래도 실패하면 다음 앱 시작이나 토큰 변경 때 다시 시도한다(로그인 유지) | D-21, API§7.2-5 | U | push/push-devices-current__internal-error.json | 신규 |
| TC-PUSH-031 | Given 빈 FCM 토큰 문자열 / When 등록 시도 / Then 요청을 보내지 않는다(서버 400 "FCM 토큰이 필요합니다." 방지) | API§5.2 | U+C | push/push-devices-current__bad-request-empty-token.json | 신규 |
| TC-PUSH-032 | Given 로그아웃 후 다른 계정 B로 로그인 / When 같은 FCM 토큰 / Then 중복 제거 캐시가 초기화되어 B 세션으로 다시 등록한다 | API§7.2-6, 계정 전환 | U | push/push-devices-current__no-content.json | 신규 |
| TC-PUSH-033 | Given 정지 회원 / When 등록 / Then 204로 성공한다 | USER-002, API§7.2-8 | C+U | push/push-devices-current__no-content.json | 신규 |
| TC-PUSH-034 | Given 탈퇴 회원의 토큰으로 등록 → 401 / When 처리 / Then 로그인 화면으로 간다 | API§7.2-8 | U | push/push-devices-current__unauthorized.json | 신규 |
| TC-PUSH-035 | Given 로그아웃 또는 탈퇴 / When 호출 기록 확인 / Then 푸시 기기 해제 API 호출 0건이다 | D-16 | U | - | 신규 |
| TC-PUSH-036 | Given Web / When 로그인·시작 / Then PUT /push-devices/current 호출 0건, 서비스 워커 푸시 구독 없음 | Q-04 | U | - | 신규 (Web 한정) |
| TC-PUSH-037 | Given 푸시 payload type=TOPIC(notificationId 없음) / When 탭 / Then 홈 맨 위 + 새로고침, 읽음 호출 0건, 원래 sourceId 날짜는 무시하고 클릭한 날의 오늘 주제를 쓴다 | D-11, 푸시 계약 | U | push/payload__topic.json | iOS:PushNotificationTests L9, L21 / AN:ChalkakNavHostTest(TOPIC) |
| TC-PUSH-038 | Given type=REMINDER / When 탭 / Then 홈으로 이동하고 읽음 호출 0건이다 | D-11 | U | push/payload__reminder.json | 신규 |
| TC-PUSH-039 | Given type=POST_APPROVED, sourceId 유효 / When 탭 / Then 단건 읽음 성공 후 게시물 상세(내 게시물)로 이동한다 | D-11 | U | push/payload__post-approved.json | iOS:PushNotificationTests L33 |
| TC-PUSH-040 | Given type=AI_REVIEW_COMPLETED / AI_REVIEW_FAILED, sourceType=POST / When 탭 / Then 읽음 후 게시물 상세 + AI 시트 자동 열기(최신 GET 기준 1회)로 이동한다 | D-11 | U | push/payload__ai-review-completed.json, push/payload__ai-review-failed.json | iOS:PushNotificationTests L41 / AN:FeedScreenTest(notificationEntry) |
| TC-PUSH-041 | Given type=POST_REJECTED / When 탭 / Then 읽음 후 notificationId로 알림 상세가 열린다 | D-11 | U | push/payload__post-rejected.json | iOS:PushNotificationTests L64 |
| TC-PUSH-042 | Given type=NOTICE / When 탭 / Then 읽음 후 sourceId(공지 ID)가 아니라 notificationId로 알림 상세가 열린다 | D-11, 푸시 계약 | U | push/payload__notice.json | iOS:PushNotificationTests L71 / AN:ChalkakNavHostTest(공지 상세) |
| TC-PUSH-043 | Given NOTICE에 notificationId가 없거나 UUID 형식이 아님 / When 탭 / Then 상세를 열지 않고 알림함 목록으로 간다 | D-11 | U | push/payload__missing-notification-id.json | iOS:PushNotificationTests L80 |
| TC-PUSH-044 | Given 알 수 없는 type / When 탭 / Then 알림함 목록으로 이동하고 읽음 호출 0건이며 크래시하지 않는다 | D-11 | U | push/payload__unknown-type.json | iOS:PushNotificationTests L89 |
| TC-PUSH-045 | Given 필수 필드(type) 누락 / When 탭 / Then 알림함 목록으로 이동하고 읽음 호출 0건이다. 기존 iOS는 앱만 열기, Android는 토스트 "알림 정보를 확인할 수 없어요."였으나 D-11에 따라 알림함으로 통일 | D-11 | U | push/payload__missing-type.json | iOS:PushNotificationTests L89 / AN:legacy-android §1.5 |
| TC-PUSH-046 | Given sourceId 또는 notificationId가 UUID 형식이 아님 / When 탭 / Then 알림함 목록으로 이동하고 읽음 호출 0건이다 | D-11 | U | push/payload__invalid-uuid.json | iOS:PushNotificationTests L89 |
| TC-PUSH-047 | Given AI 리뷰 type인데 sourceType이 POST가 아님 / When 탭 / Then 알림함 목록으로 이동한다 | D-11 | U | push/payload__ai-source-type-not-post.json | iOS:PushNotificationTests L49 |
| TC-PUSH-048 | Given 대문자 UUID가 payload에 있음 / When 파싱·요청 / Then 형식은 유효로 보고 경로·바디에는 소문자 정규형으로 보낸다(서버는 소문자 UUID만 허용) | API§0 잘못된 UUID | U+C | push/payload__uppercase-uuid.json | 신규 |
| TC-PUSH-049 | Given data 값이 숫자·중첩 JSON·배열 등 문자열이 아님 / When 파싱 / Then 해당 필드를 누락으로 보아 알림함 목록으로 가고 예외가 나지 않는다 | 푸시 계약 | U | push/payload__non-string-values.json | 신규 |
| TC-PUSH-050 | Given iOS APNs userInfo(평탄 구조), Android intent extras, Flutter·RN 플러그인 메시지 / When 각 어댑터로 파싱 / Then 모두 같은 PushPayload가 된다. iOS 중첩 `notification/data` 구조는 가정하지 않는다 | 푸시 계약 | U | push/payload__post-approved.json | iOS:PushNotificationTests L9 계열 / AN:legacy-android §1.5 |
| TC-PUSH-051 | Given 같은 type에 서로 다른 notification.title/body / When 탭 / Then 목적지가 같다(문구로 분기하지 않는다) | 푸시 계약 | U | push/payload__post-approved.json | 신규 |
| TC-PUSH-052 | Given 같은 eventId의 푸시 탭이 두 번 / When 처리 / Then eventId로 중복 제거하지 않고 각각 처리한다(읽음은 서버 멱등) | 푸시 계약 | U | push/payload__post-approved.json | 신규 |
| TC-PUSH-053 | Given 푸시 탭 읽음 PATCH 성공 / When 처리 / Then 이동한다 | D-11 | U | notification/notification-read__no-content.json | iOS:PushNotificationTests |
| TC-PUSH-054 | Given 읽음이 네트워크 실패 / When 푸시 탭 / Then 토스트 "읽음 상태를 저장하지 못했어요. 네트워크 연결을 확인해 주세요." 후 이동한다 | D-11 | U | - | AN:legacy-android §1.5 / iOS:legacy-ios §1.4 |
| TC-PUSH-055 | Given 읽음이 404 / When 푸시 탭 / Then 토스트 "더 이상 확인할 수 없는 알림이에요.", 알림함·미읽음 새로고침, 이동 안 함 | D-11, D-24 | U | notification/notification-read__not-found.json | iOS:legacy-ios §1.4 [차이: AN은 "알림이 만료되었거나…" 후 알림 목록으로 이동했음] |
| TC-PUSH-056 | Given 읽음이 500·403 / When 푸시 탭 / Then 404와 같게 처리한다 | D-11 | U | notification/notification-read__internal-error.json | AN:legacy-android §1.5 |
| TC-PUSH-057 | Given 읽음이 401 / When 푸시 탭 / Then refresh 후 재전송해 성공하면 이동, REAUTH면 로그인 화면으로 가고 대기 이동은 폐기한다 | D-17 | U | notification/notification-read__unauthorized.json | 신규 |
| TC-PUSH-058 | Given 세션 없음(로그아웃) 상태 / When 푸시 탭 / Then 앱만 열리고 이동 대기도 저장하지 않으며 이후 로그인해도 목적지로 가지 않는다 | D-11, Q-12 | U | push/payload__post-approved.json | iOS:legacy-ios §1.4 |
| TC-PUSH-059 | Given 게스트 / When 푸시 탭 / Then 버리고 앱만 열린다 | D-11 | U | push/payload__post-approved.json | 신규 |
| TC-PUSH-060 | Given 인증 세션이 있으나 현재 화면이 사인 미리보기(가입 완료 처리 중) / When 푸시 탭 / Then 보류했다가 홈 진입 후 처리한다 | D-11 | U | push/payload__post-approved.json | AN:legacy-android §1.5(Login/Terms/Onboarding 화면에서는 소비 보류) |
| TC-PUSH-061 | Given 업로드 화면 또는 피드백 작성 중 / When 푸시 탭 / Then 이동을 차단하고 보류했다가 그 화면을 벗어난 뒤 처리하며 작성 중 내용이 보존된다 | D-11 | U+E | push/payload__post-approved.json | iOS:legacy-ios §1.4 |
| TC-PUSH-062 | Given 콜드 스타트 푸시 탭 / When 메인이 준비됨 / Then 그때까지 버퍼링했다가 정확히 1회만 소비한다 | D-11 | U | push/payload__topic.json | iOS:PushNotificationTests L506 |
| TC-PUSH-063 | Given 보류 중인 탭이 프로세스 종료 후 복원 / When 앱 재시작 / Then 대기 푸시가 복원되고 소비 뒤에는 저장되지 않으며 새 푸시 탭은 이전 보류분을 교체한다 | D-11 | U | push/payload__post-approved.json | AN:NotificationNavigationSavedStateTest(6) |
| TC-PUSH-064 | Given 같은 게시물 상세가 이미 열려 있음 / When AI 또는 승인 푸시 탭 / Then 새로 쌓지 않고 교체한다 | D-11 | U+E | push/payload__ai-review-completed.json | AN:ChalkakNavHostTest(같은 게시물 교체) |
| TC-PUSH-065 | Given 이미 홈 / When TOPIC 푸시 탭 / Then 중복 이동 없이 맨 위로 스크롤하고 새로고침한다 | D-11 | U+E | push/payload__topic.json | AN:ChalkakNavHostTest(Home 중복 방지) |
| TC-PUSH-066 | Given 푸시 탭 후 로그인 계정이 바뀜 / When 대기 중인 이동 / Then 폐기한다 | 계정 전환, D-11 | U | push/payload__post-approved.json | 신규 |
| TC-PUSH-067 | Given 푸시로 열 게시물이 비공개·삭제되어 상세가 404 / When 이동 / Then 상세 화면의 "게시물을 찾을 수 없어요" 처리를 따른다(FEED 영역) | NOTIFICATION-002 | U | (FEED 소유) | 신규 |
| TC-PUSH-068 | Given 포그라운드에서 푸시 수신(Android onMessageReceived) / When 권한 허용 / Then 앱이 알림을 직접 만든다(채널 id moderation_push, notification 제목·본문, 본문이 비면 "새 알림이 있어요. 알림함에서 확인해 주세요."). 권한 미허용이면 표시하지 않는다 | legacy-android §1.5 | U | push/payload__post-approved.json | AN:PushNotificationIconTest(아이콘만) |
| TC-PUSH-069 | Given 포그라운드에서 푸시 수신(iOS willPresent) / When 처리 / Then 배너·사운드를 표시하는 옵션을 돌려준다 [결정 필요: 기존 정의 없음] | 푸시 계약 | U | push/payload__post-approved.json | 신규 |
| TC-PUSH-070 | Given 사용자가 같은 게시물의 AI 피드백 화면을 보는 중 / When AI_REVIEW 푸시 수신 / Then 포그라운드 표시를 생략한다(권장 규칙을 임시 채택) | API§4.2, 푸시 계약 | U | push/payload__ai-review-completed.json | 신규 |
| TC-PUSH-071 | Given 포그라운드 푸시 수신 / When 처리 / Then unread-status를 재조회한다 | D-10 | U | notification/unread-status__true.json | 신규 |
| TC-PUSH-072 | Given 앱 시작 / When 알림 채널 초기화(Android) / Then 채널 moderation_push가 생성되고 푸시 아이콘이 설정된다 | legacy-android §1.5 | U | - | AN:PushNotificationIconTest |
| TC-PUSH-073 | Given 서버 설정이 꺼진 유형의 푸시가 어쩌다 도착 / When 수신 / Then 클라이언트가 로컬 설정으로 필터링하지 않고 payload 규칙대로 처리한다(수신 제어는 서버 책임) | NOTIFICATION-006 | U | push/payload__post-approved.json | 신규 |
| TC-PUSH-074 | Given OS 알림 권한 다이얼로그(시스템) / When 허용, 거부 각각 / Then 앱이 결과에 맞는 세 설정을 서버에 저장하고 거부해도 앱이 정상 동작한다 | NOTIFICATION-005 | A | - | 신규 |
| TC-PUSH-075 | Given 개발 서버에서 실제 푸시 발송(사람이 서버 측 발송 수단 제공) / When 앱이 백그라운드·포그라운드·강제 종료 상태 / Then 알림이 실제로 도착하고 탭하면 type별 목적지로 이동한다 | 푸시 계약 | A | - | 신규 |
| TC-PUSH-076 | Given 개발 서버 실제 세션 / When 로그아웃 후 푸시 발송 / Then 기기에 도착하지 않는다(서버가 세션과 함께 기기 행을 삭제) | NOTIFICATION-005 | A | - | 신규 |
| TC-PUSH-077 | Given iOS 시뮬레이터(APNs sandbox) 또는 실기기 / When 로그인 / Then APNs 토큰이 수동 전달되어 FCM 토큰으로 이어지고 기기 등록이 성공한다 | legacy-ios §2.10 | A | - | 신규 |

## 필요 fixture 목록

| 파일명 (shared/fixtures/ 기준) | 메서드 경로 | HTTP | 내용 요지 |
| --- | --- | --- | --- |
| notification/notifications__page1.json | GET /notifications?page=1&pageSize=20 | 200 | 20건, 모든 type을 포함(POST_APPROVED, POST_REJECTED, AI_REVIEW_COMPLETED, AI_REVIEW_FAILED, NOTICE), 읽음/미읽음 혼합, hasNext true |
| notification/notifications__page2-last.json | GET /notifications?page=2 | 200 | 5건, hasNext false |
| notification/notifications__overlap-page2.json | GET /notifications?page=2 | 200 | 1페이지와 같은 id 2건 포함 |
| notification/notifications__empty.json | GET /notifications | 200 | notifications [], hasNext false |
| notification/notifications__unknown-type.json | GET /notifications | 200 | type "FUTURE_TYPE", sourceType null |
| notification/notifications__topic-reminder.json | GET /notifications | 200 | type TOPIC, REMINDER 항목 |
| notification/notifications__null-source.json | GET /notifications | 200 | POST_APPROVED인데 sourceType·sourceId null |
| notification/notifications__bad-ai-source.json | GET /notifications | 200 | AI_REVIEW_COMPLETED인데 sourceType NOTICE 또는 sourceId가 UUID 아님 |
| notification/notifications__kst-boundary.json | GET /notifications | 200 | createdAt 2026-10-26T15:00:00Z, 2026-10-26T14:59:59Z, 소수초 포함 값 |
| notification/notifications__30day-boundary.json | GET /notifications | 200 | createdAt이 기준 시각에서 정확히 30일 전인 항목 |
| notification/notifications__missing-fields.json | GET /notifications | 200 | 필수 필드 title 누락(계약 위반) |
| notification/notifications__not-found.json | GET /notifications | 404 | BUSINESS_ERROR "알림을 찾을 수 없습니다." (방어용) |
| notification/notifications__unauthorized.json | GET /notifications | 401 | UNAUTHORIZED |
| notification/notifications__internal-error.json | GET /notifications | 500 | INTERNAL_ERROR |
| notification/notification-detail__rejected.json | GET /notifications/{id} | 200 | originalImageUrl, rejectionReason, readAt null |
| notification/notification-detail__rejected-long-reason.json | GET /notifications/{id} | 200 | rejectionReason 500자 |
| notification/notification-detail__notice.json | GET /notifications/{id} | 200 | title, body 전문, originalImageUrl·rejectionReason null |
| notification/notification-detail__approved.json | GET /notifications/{id} | 200 | type POST_APPROVED |
| notification/notification-detail__not-found.json | GET /notifications/{id} | 404 | BUSINESS_ERROR "알림을 찾을 수 없습니다." |
| notification/notification-detail__internal-error.json | GET /notifications/{id} | 500 | INTERNAL_ERROR |
| notification/unread-status__true.json | GET /notifications/unread-status | 200 | hasUnread true |
| notification/unread-status__false.json | GET /notifications/unread-status | 200 | hasUnread false |
| notification/unread-status__unauthorized.json | GET /notifications/unread-status | 401 | UNAUTHORIZED |
| notification/unread-status__internal-error.json | GET /notifications/unread-status | 500 | INTERNAL_ERROR |
| notification/notification-read__no-content.json | PATCH /notifications/{id}/read | 204 | 본문 없음 |
| notification/notification-read__not-found.json | PATCH /notifications/{id}/read | 404 | BUSINESS_ERROR "알림을 찾을 수 없습니다." |
| notification/notification-read__unauthorized.json | PATCH /notifications/{id}/read | 401 | UNAUTHORIZED |
| notification/notification-read__internal-error.json | PATCH /notifications/{id}/read | 500 | INTERNAL_ERROR |
| push/push-devices-current__no-content.json | PUT /push-devices/current | 204 | 본문 없음 |
| push/push-devices-current__bad-request-empty-token.json | PUT /push-devices/current | 400 | BUSINESS_ERROR "FCM 토큰이 필요합니다." |
| push/push-devices-current__reauthentication-required.json | PUT /push-devices/current | 401 | REAUTHENTICATION_REQUIRED |
| push/push-devices-current__unauthorized.json | PUT /push-devices/current | 401 | UNAUTHORIZED |
| push/push-devices-current__internal-error.json | PUT /push-devices/current | 500 | INTERNAL_ERROR |
| push/jwt__with-session-id.json | (토큰 시드) | - | payload에 sub, scope=USER, session_id가 있는 서명 없는 가짜 JWT |
| push/jwt__without-session-id.json | (토큰 시드) | - | session_id 클레임 없는 가짜 JWT |
| push/jwt__malformed.json | (토큰 시드) | - | 형식이 깨진 문자열 여러 종류 |
| push/payload__topic.json | (FCM data) | - | type TOPIC, sourceType TOPIC, sourceId, eventId. notificationId 없음 |
| push/payload__reminder.json | (FCM data) | - | type REMINDER, notificationId 없음 |
| push/payload__post-approved.json | (FCM data) | - | type POST_APPROVED, sourceType POST, 유효 UUID 3종, 값은 모두 문자열 |
| push/payload__post-rejected.json | (FCM data) | - | type POST_REJECTED |
| push/payload__ai-review-completed.json | (FCM data) | - | type AI_REVIEW_COMPLETED, sourceType POST |
| push/payload__ai-review-failed.json | (FCM data) | - | type AI_REVIEW_FAILED, sourceType POST |
| push/payload__notice.json | (FCM data) | - | type NOTICE, sourceType NOTICE |
| push/payload__unknown-type.json | (FCM data) | - | type "FUTURE_TYPE" |
| push/payload__missing-type.json | (FCM data) | - | type 키 없음 |
| push/payload__missing-notification-id.json | (FCM data) | - | NOTICE인데 notificationId 없음 |
| push/payload__invalid-uuid.json | (FCM data) | - | notificationId 또는 sourceId가 UUID 형식 아님 |
| push/payload__ai-source-type-not-post.json | (FCM data) | - | AI_REVIEW_COMPLETED인데 sourceType NOTICE |
| push/payload__uppercase-uuid.json | (FCM data) | - | 대문자 UUID |
| push/payload__non-string-values.json | (FCM data) | - | 숫자·중첩 JSON 값 |
| settings/notification-settings__patch-no-content.json, settings/notification-settings__patch-internal-error.json | PATCH /notification-settings | 204, 500 | settings-feedback.md에서 정의 |
| auth/refresh__success.json, auth/refresh__reauthentication-required.json | POST /auth/refresh | 200, 401 | boot-auth.md에서 정의 |
| onboarding/signup__success.json | POST /auth/social-signup | 200 | onboarding-signature.md에서 정의 |

## 흡수하지 않은 기존 테스트

- `iOS:NotificationInboxTests L272`(전체 읽음 PATCH 204): 알림 "모두 읽음"은 [overview §2](../../spec/00-overview.md) 범위 밖(UI 미연결)이라 제외했다. API 클라이언트에 메서드를 두더라도 이 레포의 필수 TC가 아니다.
- `iOS:LegacyDailyReminderCleanupTests`, `AN:LegacyReminderCleanupTest`: 레거시 로컬 리마인더 정리, 범위 밖.
- `iOS:PushNotificationTests L506`의 주제 푸시 보관 외 항목은 TC-PUSH-062로 흡수했다.
