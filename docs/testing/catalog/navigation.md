# 테스트 카탈로그: NAV

하단 탭 4개(홈, 전시, 기록, 설정)와 가운데 업로드 버튼, 게스트 제한 토스트, 토스트 자체의 동작, 화면 간 이동과 뒤로가기, 로그인·로그아웃·재인증 때의 백스택 정리를 다룬다. 탭 상태와 게스트 분기는 라우팅·ViewModel 수준의 `U`와 컴포넌트 수준의 `W`로 닫고, 여러 화면을 건너는 여정(알림 → 뒤로, 기록 → 전시 → 뒤로, 배너 웹 → 뒤로)은 mock 서버를 쓰는 `E`(모바일 4종 Maestro 같은 YAML, Web은 Playwright)로 묶는다. 게스트 제한은 [D-05](../../spec/decisions.md#d-05-게스트-제한)에 따라 **네트워크 요청 0건 + 해당 토스트**를 확인하는 것이 핵심이다. 이 영역은 OS UI나 실서비스가 끼지 않아 `A`가 없다(그래서 agent-scenarios 파일도 없다). 하단바 스크럽 제스처, 스크롤 방향에 따른 compact 전환, Liquid Glass 변형은 iOS 플랫폼 고유 UI라 parity 대상에서 제외했다(아래 "흡수하지 않은 기존 테스트").

표기: fixture 열 경로는 `shared/fixtures/` 아래다. `-`는 Fake 주입만 쓴다. 다른 영역이 소유한 fixture는 영역을 괄호로 적는다. 기존 열은 [legacy-ios §4.3](../../reference/legacy-ios.md)과 [legacy-android §4](../../reference/legacy-android.md)를 가리킨다. `[결정 필요]`는 두 기존 앱이 서로 다르거나 규칙이 없어 임시로 적은 것이다.

## NAV

| ID | 검증 내용 | 근거 | 구분 | fixture | 기존 |
| --- | --- | --- | --- | --- | --- |
| TC-NAV-001 | Given 인증 사용자의 메인 / When 하단바 렌더링 / Then 홈, 전시, 가운데 업로드 버튼, 기록, 설정 순서로 5개 요소가 보이고 탭 라벨은 홈/전시/기록/설정이다 | overview §5 | W | - | AN:MainBottomBarLayoutTest, AN:ChalkakNavHostTest |
| TC-NAV-002 | Given 각 탭 / When 선택·비선택 상태 렌더링 / Then 상태에 맞는 아이콘 에셋을 쓰고 선택 탭은 선택 상태로 노출된다(testID에 selected 상태) | overview §5 | W | - | iOS:BottomBarIconTests L7 |
| TC-NAV-003 | Given 메인 첫 진입 / When 선택 탭 확인 / Then 홈이 선택되어 있다 | overview §5 | U | - | AN:ChalkakNavHostTest |
| TC-NAV-004 | Given 홈 / When 전시, 기록, 설정 탭을 차례로 탭 / Then 각 화면이 열리고 선택 표시가 따라온다 | overview §5 | U+E | - | AN:ChalkakNavHostTest(하단바 인스턴스 유지) |
| TC-NAV-005 | Given 인증 사용자 / When 가운데 업로드 버튼 탭 / Then 선택된 탭 표시는 바뀌지 않고 업로드 진입 게이트(GET /posts/today)가 호출된다 | overview §5, D-14 | U | (UPL 소유) upload/posts-today__not-posted.json | iOS:chalkakUITests L74 |
| TC-NAV-006 | Given 설정 탭에서 업로드 화면을 연 뒤 / When 닫기 / Then 설정 탭으로 돌아온다 | D-14 | E | (UPL 소유) upload/posts-today__not-posted.json | iOS:chalkakUITests L238 |
| TC-NAV-007 | Given 업로드 버튼을 연타 / When 게이트 확인 중 / Then GET /posts/today는 1회이고 업로드 화면도 하나만 열린다 | D-14 | U | (UPL 소유) upload/posts-today__not-posted.json | AN:PhotoUploadEntryGateViewModelTest(반복 탭 1회) |
| TC-NAV-008 | Given 전시 탭이 선택됨 / When 전시 탭을 다시 탭 / Then 목록이 맨 위로 스크롤된다 | NAV | W+U | - | AN:DisplayScreenTest(displayReselectRestoresTop) |
| TC-NAV-009 | Given 홈 탭이 선택됨 / When 홈 탭을 다시 탭 / Then 맨 위로 스크롤된다 [결정 필요: 새로고침 동반 여부는 기존 앱에 정의가 없다] | NAV | W+U | - | iOS:TodayFeatureTests L124(죽은 코드의 유사 동작) |
| TC-NAV-010 | Given 전시에서 스크롤·날짜·정렬을 바꾼 상태 / When 다른 탭에 갔다가 돌아옴 / Then 전시와 기록의 선택 날짜·월·정렬이 유지된다 | NAV | U+E | (DISP/REC 소유) | AN:ChalkakNavHostTest(탭 왕복) |
| TC-NAV-011 | Given 홈을 아래로 스크롤 / When 다른 탭 왕복 / Then iOS 기존은 스크롤 위치를 유지하고 Android 기존은 홈 상태를 복원하지 않아 처음부터 보인다 [결정 필요: open-questions 후보. 결정 전까지 이 TC는 공통 기대값 없이 보류] | NAV | E | - | iOS:HomeScreenUITests L89 / AN:ChalkakNavHost navigateToBottomBar(restoreState=item!=HOME) |
| TC-NAV-012 | Given 전시 또는 홈 랭킹에서 게시물 상세(피드) 진입 / When 상세 화면 / Then 하단바가 숨고, 뒤로 가면 다시 보인다 | NAV | E+W | (DISP 소유) display/posts__recent-page1.json | AN:ChalkakNavHostTest(bottomBarIsHiddenInFeedAndReturnsWithDisplay) |
| TC-NAV-013 | Given 하단바가 있는 화면과 없는 화면 / When 스크린샷 / Then 콘텐츠가 하단바에 가려지지 않는다(플랫폼 안에서만 비교) | NAV | S | - | AN:MainBottomBarLayoutTest |
| TC-NAV-014 | Given 게스트 홈 / When 진입 / Then 오늘 주제, 공개 랭킹, 배너가 보이고 인증 API(GET /posts/today, 캘린더, 알림 미읽음)는 호출되지 않는다 | D-05, D-06, D-10 | U | (HOME 소유) | AN:HomeViewModelTest(게스트) |
| TC-NAV-015 | Given 게스트 전시 탭 / When 진입 / Then GET /posts 목록이 Authorization 헤더 없이 호출되고 isLiked=false, isMine=false로 표시된다 | D-05, F10 | C+U | (DISP 소유) display/posts__guest-recent.json | iOS:legacy-ios §1.3 |
| TC-NAV-016 | Given 게스트 / When 기록 탭 탭 / Then 토스트 "기록을 보려면 로그인이 필요해요", 탭 전환 없음, API 0건 | D-05 | U+W | - | AN:legacy-android §1.2 / iOS:legacy-ios §1.3 |
| TC-NAV-017 | Given 게스트 / When 업로드 버튼 탭 / Then 토스트 "게시물을 추가하려면 로그인이 필요해요", GET /posts/today 0건, 업로드 화면 안 열림 | D-05 | U+E | - | iOS:chalkakUITests L168 / AN:PhotoUploadEntryGateViewModelTest |
| TC-NAV-018 | Given 게스트 / When 전시 카드, 홈 랭킹 사진, 홈 인기 사진을 탭 / Then 토스트 "게시물 피드를 보려면 로그인이 필요해요", GET /posts/{id} 0건 | D-05 | U+E | - | iOS:HomeScreenUITests L69(상세 로그인 안내) / AN:legacy-android §1.2 |
| TC-NAV-019 | Given 게스트 / When 좋아요 탭 / Then 토스트 "좋아요를 누르려면 로그인이 필요해요", PUT /posts/{id}/likes 0건, 개수 변화 없음 | D-05 | U | - | iOS:TodayFeatureTests L173 |
| TC-NAV-020 | Given 게스트 / When 홈 알림 벨 탭 / Then 토스트 "로그인 후 알림을 확인할 수 있어요", 알림 화면 안 열림, 알림 API 0건 | D-05, D-10 | U | - | iOS:legacy-ios §1.3 |
| TC-NAV-021 | Given 게스트 설정 탭 / When 렌더링 / Then "로그인" 버튼과 피드백/정보 섹션만 보이고 푸시 알림 설정, 사인, 로그아웃, 회원탈퇴는 보이지 않는다 | D-05 | W | - | iOS:chalkakUITests L195, SettingsScreenTests L19 / AN:SettingsScreenTest |
| TC-NAV-022 | Given 게스트 설정 / When "피드백 보내기" 탭 / Then 토스트 "피드백을 보내려면 로그인이 필요해요", 피드백 화면 안 열림 | D-05 | U | - | iOS:legacy-ios §1.3 |
| TC-NAV-023 | Given 게스트 제한 6종 / When 문구 확인 / Then 토스트 문구가 `shared/copy/ko.json` 키와 정확히 같다 | D-05 | U | - | 신규 |
| TC-NAV-024 | Given 정지(BANNED) 회원 / When 기록, 알림, 설정, 전시 접근 / Then 모두 열리고 조회 API가 정상 호출된다(제한은 쓰기 403 지점에서만) | USER-002, D-08 | U | (REC/NOTI 소유) | 신규 |
| TC-NAV-025 | Given 토스트 표시 / When 가상 시계로 2.49초, 2.5초 / Then 2.49초까지 보이고 2.5초에 사라진다 | overview §6 TOAST_DURATION | U | - | iOS:legacy-ios §1.3(2.5초) |
| TC-NAV-026 | Given 같은 문구의 토스트를 연달아 두 번 요청 / When 처리 / Then 두 번째도 다시 표시되고 지속 시간이 새로 시작된다 | D-20 | U | - | AN:UiMessage 규약(id 중복 제거) |
| TC-NAV-027 | Given 토스트가 떠 있을 때 다른 문구 요청 / When 처리 / Then 새 문구로 교체되고 이전 문구의 타이머가 새 문구를 일찍 지우지 않는다 | D-20 | U | - | 신규 |
| TC-NAV-028 | Given 화면이 보이지 않음(백그라운드, 다른 화면 아래) / When 토스트 요청 / Then 표시하지 않고 쌓지도 않는다 | D-20 | U | - | AN:legacy-android §2 공통 규약(RESUMED일 때만) |
| TC-NAV-029 | Given 하단바가 있는 화면과 없는 화면 / When 토스트 표시 / Then 토스트 위치가 화면 기준으로 같다 | NAV | S | - | iOS:ChalkakToastTests L8 |
| TC-NAV-030 | Given 인증 사용자 홈 / When 알림 벨 탭 후 뒤로 / Then 알림 목록이 열렸다가 홈으로 돌아온다 | NAV | E | (NOTI 소유) notification/notifications__page1.json | iOS:chalkakUITests L348 / AN:ChalkakNavHostTest |
| TC-NAV-031 | Given 알림 벨 연타 / When 처리 / Then 알림 화면이 하나만 쌓이고 뒤로 한 번에 홈으로 온다 | 연타 | U+E | - | AN:ChalkakNavHostTest(연타 방지) |
| TC-NAV-032 | Given 전시 카드 연타 / When 처리 / Then 피드 화면이 하나만 쌓인다 | 연타 | U | - | AN:ChalkakNavHostTest(연타 방지) |
| TC-NAV-033 | Given 업로드 성공 화면에서 "확인했어요." / When 탭 / Then 업로드한 주제 날짜의 전시가 열리고 뒤로 가면 홈이며 업로드 화면으로는 못 돌아간다 | D-14 | E | (UPL 소유) | AN:ChalkakNavHostTest(업로드 성공 후 전시) |
| TC-NAV-034 | Given 기록 탭에서 사진의 "전시 보러가기"나 "피드에서 보기" / When 전시·피드 진입 후 뒤로 / Then 기록으로 돌아오고 탭 이동이 계속 가능하다 | NAV | E | (REC 소유) | AN:ChalkakNavHostTest(displayOpenedFromRecordReturnsToRecordAndKeepsTabsNavigable) |
| TC-NAV-035 | Given 홈 랭킹 헤더 링크 / When 탭 / Then 해당 날짜의 인기순 전시가 열린다 | NAV | E | (HOME 소유) | AN:ChalkakNavHostTest(랭킹 링크) |
| TC-NAV-036 | Given 홈 배너 탭 / When 웹 화면 열림 후 뒤로 / Then 배너 웹이 열렸다가 홈으로 돌아온다 | NAV | E | (HOME 소유) banner/banners__page1.json | iOS:HomeScreenUITests L112 |
| TC-NAV-037 | Given 알림 상세 / When 뒤로 / Then 알림 목록으로 돌아온다 | NAV | E | (NOTI 소유) notification/notification-detail__rejected.json | AN:ChalkakNavHostTest |
| TC-NAV-038 | Given 설정 → 사인 변경 → 미리보기 → 완료 / When 성공 / Then 설정으로 pop 되고 토스트가 뜨며 뒤로 가도 변경 화면이 남지 않는다 | D-18 | E | signature/users-me-signature__put-success.json | AN:legacy-android §1.4 |
| TC-NAV-039 | Given 로그인 성공 / When 홈 진입 / Then 로그인 화면이 백스택에서 사라져 뒤로가기가 로그인 화면으로 돌아가지 않는다 | NAV | U+E | auth/social-login__login-success.json | AN:legacy-android §1.3-5 |
| TC-NAV-040 | Given 가입 성공 / When 홈 진입 / Then 약관·사인·미리보기가 백스택에서 사라진다 | NAV | E | onboarding/signup__success.json | AN:SignatureFlowTest |
| TC-NAV-041 | Given 로그아웃 완료 / When 로그인 화면에서 뒤로 / Then 메인으로 돌아가지 못한다 | D-16 | U+E | auth/logout__no-content.json | 신규 |
| TC-NAV-042 | Given 어느 화면에서든 REAUTHENTICATION_REQUIRED / When 처리 / Then 로그인 화면으로 이동하고 이전 화면들이 백스택에 남지 않는다 | D-17 | U | auth/refresh__reauthentication-required.json | iOS:AuthenticatedHTTPClientTests L181 |
| TC-NAV-043 | Given Android 계열에서 탭을 홈 → 전시 → 설정 순으로 이동 / When 시스템 뒤로 / Then 홈으로 가고, 홈에서 다시 뒤로 하면 앱이 백그라운드로 간다(탭 이동은 popUpTo(홈)) | NAV | E | - | AN:ChalkakNavHostTest(백스택) [플랫폼 차이: iOS는 해당 없음, Web은 TC-NAV-044] |
| TC-NAV-044 | Given Web / When 탭 이동 후 브라우저 뒤로 / Then 이전 탭 화면으로 돌아가고 인증 필요 화면에서 세션이 없으면 로그인으로 간다 [결정 필요: Web 라우트 구조 미정] | NAV | E | - | 신규 (Web 한정) |
| TC-NAV-045 | Given 앱 자체 딥링크 / When 카카오 스킴 이외의 URL(`chalkak://...`, https 링크)로 앱을 열려 함 / Then 어떤 화면 이동도 일어나지 않는다 | legacy-ios §1.4 | U | - | 신규 |
| TC-NAV-046 | Given 다른 화면을 보던 중 앱이 백그라운드로 갔다 포그라운드로 복귀 / When 복귀 / Then 현재 화면과 스크롤이 유지되고 미읽음 상태와 홈 데이터만 조용히 재조회된다 | D-10 | E | (NOTI 소유) notification/unread-status__true.json | AN:legacy-android §2.4(resume 갱신) |
| TC-NAV-047 | Given 회원이 설정에서 "피드백 보내기" / When 전체화면 열림 후 닫기 버튼 또는 아래 스와이프(iOS) 또는 뒤로가기 / Then 설정으로 돌아온다 | NAV | E | - | iOS:chalkakUITests L279 |
| TC-NAV-048 | Given 피드백 작성 중 입력창 위에서 드래그 / When 제스처 / Then 입력 중이던 내용이 그대로 보존된다 | NAV | E | - | iOS:chalkakUITests L317 |
| TC-NAV-049 | Given 게스트가 설정의 "로그인" 후 카카오 로그인 성공 / When 홈 복귀 / Then 기록, 업로드, 알림, 피드 진입이 제한 없이 동작한다 | D-05 | E | auth/social-login__login-success.json | 신규 |
| TC-NAV-050 | Given 계정 A에서 로그아웃 후 계정 B로 로그인 / When 메인 진입 / Then 선택 탭은 홈이고 A의 스크롤·선택 날짜·월·정렬 상태가 남아 있지 않다 | 계정 전환 | U | auth/social-login__login-success.json | 신규 |

## 필요 fixture 목록

NAV는 새 서버 응답을 거의 만들지 않고 다른 영역의 fixture를 재사용한다. 아래는 이 영역 TC가 의존하는 것이며 정의 위치를 적었다.

| 파일명 (shared/fixtures/ 기준) | 메서드 경로 | HTTP | 내용 요지 |
| --- | --- | --- | --- |
| auth/social-login__login-success.json | POST /auth/social-login | 200 | 정의: boot-auth.md |
| auth/logout__no-content.json | POST /auth/logout | 204 | 정의: boot-auth.md |
| auth/refresh__reauthentication-required.json | POST /auth/refresh | 401 | 정의: boot-auth.md |
| onboarding/signup__success.json | POST /auth/social-signup | 200 | 정의: onboarding-signature.md |
| signature/users-me-signature__put-success.json | PUT /users/me/signature | 200 | 정의: onboarding-signature.md |
| notification/notifications__page1.json | GET /notifications | 200 | 정의: notification-push.md |
| notification/notification-detail__rejected.json | GET /notifications/{id} | 200 | 정의: notification-push.md |
| notification/unread-status__true.json | GET /notifications/unread-status | 200 | 정의: notification-push.md |
| display/posts__recent-page1.json, display/posts__guest-recent.json | GET /posts | 200 | DISP 영역 담당이 정의(최신순 1페이지, 비로그인 응답 isLiked=false, isMine=false) |
| upload/posts-today__not-posted.json | GET /posts/today | 200 | UPL 영역 담당이 정의(isPosted=false) |
| banner/banners__page1.json | GET /banners | 200 | HOME 영역 담당이 정의 |

## 흡수하지 않은 기존 테스트

- `iOS:chalkakUITests L26, L58, L74(스크럽 부분), L95`: 하단바 스크럽 제스처와 compact 전환. iOS 고유 UI라 플랫폼별 UI 차이로 두며 TC-NAV-005는 L74의 "추가 위에서 떼면 업로드가 열린다"는 결과만 흡수했다.
- `iOS:chalkakUITests L130`(Xcode 템플릿 예제), `L369`(실행 성능 측정), `iOS:chalkakUITestsLaunchTests L21`: 템플릿.
- `AN:ExampleInstrumentedTest`, `AN:ArchitectureKonsistTest`, `AN:ComposeKonsistTest`: 패키지명·아키텍처 검사로 플랫폼별 린트 몫.
- `AN:ChalkakRouteTest`(라우트 직렬화 왕복): 플랫폼 내부 구현 세부.
- `iOS:HomeScreenUITests L175`(평면 디자인 뒤로 버튼 터치 영역): iOS 26 변형 디자인 고유.
