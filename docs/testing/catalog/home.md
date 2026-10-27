# 테스트 카탈로그: 홈(HOME, BANR)

홈 화면(오늘 주제 히어로, 어제·오늘 랭킹, 이번 주 기록, AI 피드백 카드 진입, 알림 버튼, ISSUE 배너)과 배너 웹뷰의 동작을 다섯 클라이언트가 같게 만드는 테스트 목록이다. 히어로 상태는 `GET /posts/today` 한 곳으로 정하고(D-06) 반려는 `isPosted=false`로 돌아오는 것으로 처리한다. 모든 날짜 계산은 KST이고, 가짜 시계로 KST 자정(`2026-10-26T15:00:00Z`)·주 경계(일요일 시작)·월 경계·연말 경계를 직접 만든다. 기존 iOS `HomeFeatureTests`·`HomeAIReviewTests`·`BannerAPIClientTests`·`IssueWebNavigationPolicyTests`·`HomeScreenUITests`와 Android `HomeViewModelTest`·`HomeAiReviewTest`·`BannerRepositoryImplTest`·`IssueLinkNavigationTest`의 검증을 흡수했다(AI 폴링·요청 로직은 AIR 영역에 두고 홈은 카드 노출 조건만 다룬다). 기준일은 별도 표기가 없으면 오늘 KST = 2026-10-27(화)이다. fixture 열은 `shared/fixtures/` 기준 상대 경로이며 `<영역>/<api>__<상황>.json` 규칙을 따른다. A는 개발 서버·실제 기기 판단이 필요한 홈 2건(레이아웃 시각 확인, 실시간 KST 자정 통과)과 배너 1건(실제 웹 콘텐츠와 외부 브라우저 전환)뿐이고 나머지는 자동화한다.

## HOME 홈

| ID | 검증 내용 | 근거 | 구분 | fixture | 기존 |
| --- | --- | --- | --- | --- | --- |
| TC-HOME-001 | Given 로그인 상태 / When 홈 진입 직후 `GET /posts/today` 응답 전 / Then 히어로는 Loading("오늘의 주제를 불러오는 중")이고 랭킹·주간 기록·배너는 서로 기다리지 않고 각자 로딩한다 | D-06 | U+W | home/posts-today__posted-approved.json(지연) | iOS:HomeFeatureTests L101 / AN:HomeViewModelTest |
| TC-HOME-002 | Given 오늘 OPEN 주제 없음 / When `GET /posts/today`가 404 "참여할 수 있는 주제가 없습니다." / Then 히어로는 NoOpenTopic("지금은 참여할 수 있는 주제가 없어요")이고 일반 오류(Error)와 구분되며 "다시 시도" 버튼이 없다 | D-06, POST-011, T13 | U+W | home/posts-today__404-no-open-topic.json | iOS:HomeFeatureTests L172 / AN:HomeViewModelTest |
| TC-HOME-003 | Given 오늘 주제 OPEN, 작성 안 함 / When `isPosted=false` / Then 히어로는 Empty("\"{주제}\" 사진을 공유하지 않았어요") + 업로드 진입 버튼이고 postId·moderationStatus는 null로 받아도 깨지지 않는다 | D-06, POST-011, P7 | U+W | home/posts-today__not-posted.json, home/topics__open-2026-10-27.json | iOS:HomeScreenUITests L192 / AN:HomeScreenTest |
| TC-HOME-004 | Given 오늘 업로드가 막 끝남 / When `isPosted=true, moderationStatus=VALIDATING` / Then 히어로는 Processing("사진을 처리하고 있어요")이고 주간 기록 달력에 해당 postId가 없어도 Processing을 유지한다 | D-06, P6, §4.1 | U+W | home/posts-today__posted-validating.json, home/posts-calendar__2026-10-empty.json | iOS:HomeFeatureTests L148 / AN:HomeViewModelTest |
| TC-HOME-005 | Given 검수 대기 / When `moderationStatus=PENDING` / Then 히어로는 사진 + "검수 대기" 배지이고 썸네일은 주간 기록(`/posts/calendar`)의 같은 postId에서 가져오며 `GET /posts/{id}`는 호출하지 않는다 | D-06, POST-007, POST-009 | U+W | home/posts-today__posted-pending.json, home/posts-calendar__2026-10-week-pending.json | iOS:HomeFeatureTests L101 / AN:HomeViewModelTest |
| TC-HOME-006 | Given 승인됨 / When `moderationStatus=APPROVED` / Then 히어로는 배지 없는 사진이고 탭하면 게시물 상세(Feed)로 이동하며 `GET /posts/{id}`는 상세 화면에서만 호출된다 | D-06 | U+W | home/posts-today__posted-approved.json, home/posts-calendar__2026-10-week-approved.json | iOS:HomeFeatureTests L124 / AN:HomeScreenTest |
| TC-HOME-007 | Given `/posts/today`는 성공 / When 주간 기록 `/posts/calendar`가 실패하거나 같은 postId를 포함하지 않음 / Then 히어로는 Error로 바뀌지 않고 `/posts/today` 상태 문구·배지만 표시하며 썸네일 자리는 대체 이미지다(임시 동작, 쟁점 1) | D-06 | U+W | home/posts-today__posted-approved.json, home/posts-calendar__500-server-error.json | iOS:HomeFeatureTests L124(상세 실패 시 달력 썸네일 폴백을 대체) |
| TC-HOME-008 | Given 정지 회원 / When `/posts/today`가 403 "차단된 회원입니다." / Then 히어로는 Empty와 같은 모양이고 업로드 진입을 누르면 "이용이 정지되어 게시물을 작성할 수 없어요."를 보여 주며 같은 요청을 다시 보내지 않는다 | D-06, D-08, P11, §2.6 | U+W | home/posts-today__403-banned.json | 기존 항목 없음 |
| TC-HOME-009 | Given 서버 오류 / When `/posts/today`가 500 또는 연결 실패 / Then 히어로는 Error("사진 상태를 불러오지 못했어요") + "다시 시도"이고 버튼을 누르면 `GET /posts/today` 1회를 다시 보내 성공하면 해당 상태로 바뀐다 | D-06, D-20 | U+W | home/posts-today__500-server-error.json → home/posts-today__posted-approved.json | iOS:HomeScreenUITests L192 / AN:HomeScreenTest |
| TC-HOME-010 | Given 사진이 관리자 반려됨 / When `/posts/today`가 `isPosted=false`로 돌아옴 / Then 히어로는 Empty이고 업로드 진입이 가능하며 "사진 상태를 불러오지 못했어요"(iOS 기존 버그)가 뜨지 않는다 | D-06, C1, §4.1 | U+W | home/posts-today__not-posted-after-reject.json | iOS:HomeFeatureTests L101(버그 5.1-1 회귀 방지) |
| TC-HOME-011 | Given 서버가 알 수 없는 `moderationStatus`(예: REJECTED, 새 값)를 `isPosted=true`와 함께 보냄 / When 파싱 / Then 앱은 깨지지 않고 히어로를 Error("다시 시도")로 처리한다 | D-06, §8.1 | U | home/posts-today__unknown-status.json | iOS:HomeFeatureTests(5.1-9 [추정]) / AN:HomeContractTest |
| TC-HOME-012 | Given 게스트 / When 홈 진입 / Then `/posts/today`·`/posts/calendar` 호출 0건, 히어로 Empty, 주간 기록은 빈 상태이고 랭킹·배너만 요청한다 | D-05, D-06 | U+C | home/topics__open-2026-10-27.json, home/posts-list__popular-5.json, banner/banners__page1-10.json | iOS:HomeFeatureTests L82 / AN:HomeViewModelTest |
| TC-HOME-013 | Given 게스트 / When 히어로의 업로드 진입을 탭 / Then 토스트 "게시물을 추가하려면 로그인이 필요해요"가 뜨고 네트워크 요청이 0건이다 | D-05 | U+E | - | iOS:chalkakUITests L168 / AN:PhotoUploadEntryGateViewModelTest |
| TC-HOME-014 | Given 액세스 토큰 만료 / When 홈 진입 시 `/posts/today`가 401 `UNAUTHORIZED` / Then single-flight refresh 1회 후 원 요청이 1회 재전송되어 히어로가 정상 표시된다 | D-17, K1 | U | home/posts-today__401-unauthorized.json → home/posts-today__posted-approved.json | iOS:AuthenticatedHTTPClientTests L38 |
| TC-HOME-015 | Given 오늘 주제 있음 / When 홈 로드 / Then `GET /topics?date=2026-10-27` 후 응답의 `topicDate`로 `GET /posts?topicDate=…&sort=popular&page=1&pageSize=20`을 보내고(소문자 sort) 서버 순서 그대로 상위 5개만 "오늘 인기있는 사진"에 표시한다 | POST-008, F1, F2, TOPIC-005 | U+C | home/topics__open-2026-10-27.json, home/posts-list__popular-8.json | iOS:HomeFeatureTests L65 / AN:HomeViewModelTest(랭킹) |
| TC-HOME-016 | Given 어제 주제 있음 / When 홈 로드 / Then 어제(KST 2026-10-26) 주제로 같은 방식 조회해 상위 5개를 "어제 랭킹"에 표시한다(5개 미만이면 있는 만큼) | POST-008, TOPIC-005 | U | home/topics__open-2026-10-26.json, home/posts-list__popular-3.json | iOS:HomeFeatureTests L65 / AN:HomeViewModelTest |
| TC-HOME-017 | Given 어제 날짜에 주제가 없음 / When `/topics?date=어제`가 404 "주제를 찾을 수 없습니다." / Then 어제 랭킹 섹션만 빈 상태("아직 올라온 사진이 없어요")이고 다른 섹션은 정상이다 | T3, TOPIC-005 | U | home/topics__404-not-found.json | 기존 항목 없음 |
| TC-HOME-018 | Given 오늘 주제가 아직 없음 / When `/topics?date=오늘`이 404 / Then 오늘 주제 라벨·오늘 인기 섹션이 빈 ready 상태("오늘의 주제가 아직 준비되지 않았어요")이고 오류("오늘의 주제를 불러오지 못했어요")와 구분된다 | T3, T13 | U+W | home/topics__404-not-found.json | iOS:HomeFeatureTests L188 / AN:HomeViewModelTest |
| TC-HOME-019 | Given 오늘 인기 사진이 0개 또는 1개 또는 4개 / When 렌더 / Then 섹션이 깨지지 않고 있는 만큼만 표시하며 0개면 "아직 올라온 사진이 없어요"를 보여 준다 | POST-008 | W | home/posts-list__popular-0.json, home/posts-list__popular-1.json | AN:HomeScreenTest |
| TC-HOME-020 | Given 랭킹 API만 실패 / When 홈 로드 / Then 해당 랭킹 섹션만 오류("{title} 사진을 불러오지 못했어요" 계열)이고 히어로·주간 기록·배너 결과는 유지된다 | D-20 | U | home/posts-list__500-server-error.json | iOS:HomeFeatureTests L205 / AN:HomeViewModelTest |
| TC-HOME-021 | Given 랭킹 사진 표시 / When 사진 탭 / Then 게시물 상세(Feed)로 이동하고 목록의 이미지·좋아요 값을 시드로 넘겨 상세 응답 전에도 이미지가 보인다 | POST-007, D-04 | W+E | home/posts-list__popular-8.json, feed/posts-detail__mine-today.json | AN:ChalkakNavHostTest(랭킹 링크) / iOS:HomeScreenUITests L69 |
| TC-HOME-022 | Given 게스트 / When 랭킹 사진 탭 / Then 토스트 "게시물 피드를 보려면 로그인이 필요해요"가 뜨고 `GET /posts/{id}` 요청이 0건이다 | D-05 | U+E | - | iOS:HomeScreenUITests L69 |
| TC-HOME-023 | Given 랭킹 "더 보기" 링크 / When 오늘 또는 어제 링크 탭 / Then 전시 탭이 해당 날짜로 열리고 첫 페이지를 `sort=popular`로 요청한다 | POST-008, D-12 | U+E | display/posts-list__popular-page1.json | iOS:HomeFeatureTests L526 / AN:ChalkakNavHostTest |
| TC-HOME-024 | Given 오늘 2026-10-27(화) / When 이번 주 기록 계산 / Then 주는 일요일 2026-10-25 ~ 토요일 2026-10-31 7칸이고 요일 헤더는 일월화수목금토다 | POST-009, TOPIC-002 | U+W | - | iOS:HomeFeatureTests L7 / AN:HomeViewModelTest(일요일 시작) |
| TC-HOME-025 | Given 오늘이 일요일(2026-11-01) 또는 토요일(2026-10-31) / When 주 계산 / Then 일요일이면 11/1~11/7, 토요일이면 10/25~10/31이다(주 경계에서 하루 어긋나지 않음) | POST-009 | U | - | AN:HomeViewModelTest(주간 경계) |
| TC-HOME-026 | Given 오늘 2026-09-30(수) / When 주 계산 / Then 주는 9/27~10/3이고 `/posts/calendar?year=2026&month=9`와 `month=10`을 모두 요청해 합쳐 표시한다(월 경계) | POST-009, C3 | U+C | home/posts-calendar__2026-09-week.json, home/posts-calendar__2026-10-week-approved.json | AN:HomeViewModelTest(주가 걸치는 월 모두) |
| TC-HOME-027 | Given 오늘 2026-12-31(목) / When 주 계산 / Then 주는 12/27~1/2이고 2026-12와 2027-01 두 달을 조회하며 연도가 바뀌어도 칸 순서가 맞다(연말 경계) | POST-009 | U | home/posts-calendar__2026-12-week.json, home/posts-calendar__2027-01-empty.json | iOS:HomeFeatureTests L7 / AN:HomeViewModelTest(연말) |
| TC-HOME-028 | Given 윤년 2028-02-29(화) / When 주 계산 / Then 주는 2/27~3/4이고 2028-02·2028-03 두 달을 조회한다 | POST-009 | U | - | 기존 항목 없음 |
| TC-HOME-029 | Given 기기 시간대 UTC, 시각 2026-10-26T15:00:00Z(KST 10/27 00:00) / When 오늘·요일 계산 / Then 오늘은 10/27 화요일이며 UTC 날짜(10/26 월)를 쓰지 않는다. 기기 시간대 America/Los_Angeles에서도 같다 | T6, T7, TOPIC-002 | U | - | iOS:HomeFeatureTests L23 |
| TC-HOME-030 | Given 기간 내 기록이 PENDING·APPROVED / When 칸 렌더 / Then 기록 있는 날은 썸네일, 없는 날은 빈 칸이며 서버가 주지 않는 REJECTED·VALIDATING 날짜는 빈 칸이다. `2026-09-17` 이전 날짜 칸도 요청·표시는 정상(빈 칸)이다 | C1, POST-009, D-12 | U+W | home/posts-calendar__2026-10-week-approved.json | iOS:HomeFeatureTests L101 / AN:HomeViewModelTest |
| TC-HOME-031 | Given 이번 주 칸 / When 기록 있는 칸 탭 / Then 기록 탭이 해당 연월·날짜 선택 상태로 열리고(이전 달 날짜 포함) 최신 사진보다 홈에서 고른 날짜가 우선한다 | POST-009, D-19 | U+E | home/posts-calendar__2026-09-week.json | iOS:RecordFeatureTests L146 / AN:RecordViewModelTest |
| TC-HOME-032 | Given 주간 기록 조회가 실패 / When 홈 로드 / Then 해당 섹션만 "기록을 불러오지 못했어요" + 다시 시도이고 재시도 후에도 사용자가 고른 날짜 선택이 유지된다 | D-20 | U | home/posts-calendar__500-server-error.json | iOS:RecordFeatureTests L181 / AN:HomeViewModelTest |
| TC-HOME-033 | Given 월 두 개를 요청했는데 한 달만 실패 / When 합치기 / Then 섹션을 오류 상태로 두고(부분 표시 금지) 다시 시도하면 두 달을 모두 다시 요청한다(임시 동작, 쟁점 2) | D-20 | U | home/posts-calendar__2026-09-week.json, home/posts-calendar__500-server-error.json | 기존 항목 없음 |
| TC-HOME-034 | Given 로그인 / When 홈 로드 / Then 토픽·랭킹·어제·주간·배너·히어로 요청이 직렬이 아니라 병렬로 시작되고 느린 요청이 먼저 끝난 섹션의 표시를 막지 않는다 | D-20 | U | - | iOS:HomeFeatureTests L205 / AN:HomeViewModelTest(병렬 로드) |
| TC-HOME-035 | Given 콘텐츠가 이미 보임 / When 당겨서 새로고침 / Then 기존 콘텐츠를 유지한 채 인디케이터를 보이고 성공하면 교체, 실패하면 기존 콘텐츠 유지 + 토스트 "네트워크 연결을 확인해 주세요."(연결 실패일 때)이다 | D-20 | U+W | home/posts-today__posted-approved.json → home/posts-today__500-server-error.json | AN:HomeViewModelTest(새로고침) |
| TC-HOME-036 | Given 새로고침이 진행 중 / When 연타 또는 당겨서 새로고침 반복 / Then 요청 세트가 1회만 나가고 진행 중 새 요청은 무시된다 | D-20 | U | - | AN:HomeViewModelTest |
| TC-HOME-037 | Given 새로고침 A가 느리고 새로고침 B가 먼저 도착 / When A가 나중에 도착 / Then A 응답이 B의 최신 상태를 덮지 않는다(세대 보호) | D-04, D-20 | U | - | iOS:HomeFeatureTests L222 / AN:HomeViewModelTest |
| TC-HOME-038 | Given 홈이 화면 밖으로 나감(탭 이동) / When 진행 중 요청이 취소됨 / Then 취소는 오류 토스트·오류 상태로 보이지 않고 이미 표시된 콘텐츠가 유지된다 | D-20 | U | - | iOS:HomeFeatureTests L222, L295, L408 |
| TC-HOME-039 | Given 앱이 포그라운드로 복귀 / When 홈이 보임 / Then 인디케이터 없이 조용히 재조회해 성공하면 교체하고 실패하면 기존 콘텐츠를 유지한다 | D-10, D-20 | U | - | AN:HomeViewModelTest(resume) |
| TC-HOME-040 | Given 가짜 시계 KST 2026-10-27 23:59:59(=14:59:59Z) / When 홈이 떠 있는 채 시간 경과 직전 / Then 오늘 주제·랭킹·주간 범위가 그대로 10/27 기준이고 재로드가 일어나지 않는다 | TOPIC-002, T7 | U | - | iOS:HomeFeatureTests L35 / AN:HomeViewModelTest(KST 자정) |
| TC-HOME-041 | Given 홈이 떠 있음 / When 시계가 2026-10-28 00:00:00 KST(=15:00:00Z)를 지나 홈이 다시 보이거나 날짜 변경을 감지 / Then 전체 재로드: 오늘=10/28, 어제 랭킹=10/27, `GET /topics?date=2026-10-28`, `/posts/today` 재조회이며 이전 날짜 콘텐츠가 섞이지 않는다 | TOPIC-002, T6, T12 | U | home/topics__open-2026-10-28.json | iOS:HomeFeatureTests L35 / AN:HomeViewModelTest(first presentation after KST midnight) |
| TC-HOME-042 | Given 자정 직후 새 주제가 아직 없음 / When 2026-10-28 00:00:00 KST 재로드에서 `/topics?date=2026-10-28`과 `/posts/today`가 404 / Then 히어로 NoOpenTopic, 오늘 인기 빈 ready, 어제 랭킹은 10/27 기준으로 유지된다 | T13, TOPIC-003 | U | home/topics__404-not-found.json, home/posts-today__404-no-open-topic.json | 기존 항목 없음 |
| TC-HOME-043 | Given 토요일 2026-10-31 23:59:59 KST / When 일요일 00:00:00(2026-11-01)을 지나 재로드 / Then 이번 주 범위가 10/25~10/31에서 11/1~11/7로 바뀌고 달력 조회 월이 2026-11로 바뀐다 | POST-009 | U | home/posts-calendar__2026-11-empty.json | 기존 항목 없음 |
| TC-HOME-044 | Given 사용자 A가 로그아웃하고 사용자 B로 로그인 / When 홈 재진입 / Then A의 히어로·주간·캐시가 모두 지워지고 B 데이터만 보이며 A 요청의 늦은 응답은 무시된다 | D-17, D-16 | U | - | AN:HomeViewModelTest(계정 전환) [AN:TokenAuthenticatorTest 갱신 중 계정 전환] |
| TC-HOME-045 | Given 오프라인이고 캐시 없음 / When 홈 첫 진입 / Then 각 섹션이 "네트워크 연결을 확인해 주세요." + 다시 시도를 보여 주고 온라인 복귀 후 다시 시도하면 모두 로드된다 | D-20 | U+E | home/posts-today__network-failure(mock 연결 끊김) | 기존 항목 없음 |
| TC-HOME-046 | Given 피드에서 오늘 게시물을 삭제하고 홈으로 복귀 / When 홈 표시 / Then 히어로는 Empty, 주간 기록 해당 칸이 사라지고 랭킹에서도 빠지며 이전 화면에서 토스트 "게시물을 삭제했어요"가 한 번 떴다 | D-23, POST-010 | U+E | feed/posts-delete__204.json, home/posts-today__not-posted.json | iOS:HomeFeatureTests(삭제 후 토스트) [iOS 기존 문구 "게시물이 삭제됐어요"는 D-23로 대체] |
| TC-HOME-047 | Given 업로드 성공 직후 / When 홈으로 돌아옴 / Then 히어로가 `/posts/today` 재조회로 Processing 또는 PENDING 배지로 바뀐다 | POST-011, D-14 | E | home/posts-today__posted-validating.json | AN:ChalkakNavHostTest(업로드 성공 후 전시) |
| TC-HOME-048 | Given 로그인 / When 상단 알림 버튼 탭 / Then 알림함으로 이동하고 뒤로가기로 홈에 돌아온다 | NAV | W+E | - | iOS:chalkakUITests L348 / AN:ChalkakNavHostTest(알림 열기/뒤로) |
| TC-HOME-049 | Given 게스트 / When 알림 버튼 탭 / Then 토스트 "로그인 후 알림을 확인할 수 있어요"가 뜨고 요청 0건이며 미읽음 조회도 하지 않는다 | D-05, D-10 | U+E | - | iOS ContentView 게스트 게이트(1.3) [테스트 없음] |
| TC-HOME-050 | Given 로그인 / When `GET /notifications/unread-status`가 `hasUnread=true` / Then 알림 버튼에 미읽음 점이 표시되고 false이면 숨김이다 | D-10, N6 | U+W | home/notifications-unread-status__true.json, home/notifications-unread-status__false.json | iOS:HomeFeatureTests(미읽음 상태 갱신) / AN: 신규(Android는 미표시 5.2-7) |
| TC-HOME-051 | Given 홈 / When 홈이 보일 때·앱 포그라운드 복귀·알림함에서 돌아옴·푸시 수신 이벤트 / Then 각 시점마다 `unread-status`를 1회씩 재조회한다 | D-10 | U | home/notifications-unread-status__true.json | iOS:HomeFeatureTests(홈 active 시 갱신) |
| TC-HOME-052 | Given 미읽음 조회가 실패 / When 네트워크 오류·5xx / Then 점은 직전 값을 유지하고 토스트·오류 UI는 없다 | D-10, D-20 | U | home/notifications-unread-status__500-server-error.json | 신규 |
| TC-HOME-053 | Given 홈 상단 / When 날짜 라벨 렌더 / Then "10월 27일 · 오늘의 주제"처럼 KST 날짜이며 기기 시간대를 바꿔도 같다 | TOPIC-002, D-09 | U+W | home/topics__open-2026-10-27.json | AN:HomeViewModelTest(M월 d일 · 오늘의 주제) |
| TC-HOME-054 | Given 오늘 승인된 내 사진(히어로 APPROVED) / When 렌더 / Then AI 피드백 카드가 보이고, PENDING·VALIDATING·Empty·NoOpenTopic·게스트·지난 주제에서는 카드가 없고 `GET /posts/{id}/ai-review` 요청도 0건이다 | AIREVIEW-001, AIREVIEW-003 | U+W | home/posts-today__posted-approved.json, home/posts-today__posted-pending.json | AN:HomeAiReviewTest / iOS:HomeScreenUITests L5 |
| TC-HOME-055 | Given 같은 홈 이미지를 동시에 여러 곳에서 요청 / When 다운로드 / Then 네트워크 다운로드는 1회이고 이미지와 비율이 함께 모든 요청자에게 반환된다 | - | U | - | iOS:TodayImagePipelineTests L8 |
| TC-HOME-056 | Given 이미지 URL이 404 또는 디코딩 실패 / When 렌더 / Then 해당 항목만 "{title} 사진을 불러오지 못했어요" 대체 표시이고 다른 항목은 정상이다 | D-20 | W | - | AN:HomeScreenTest |
| TC-HOME-057 | Given 홈 / When 각 섹션·버튼 렌더 / Then testIDs.md의 홈 식별자(히어로, 랭킹 카드, 주간 칸, 배너, 알림 버튼, 미읽음 점, 다시 시도)가 모두 존재한다 | strategy §2 | W | - | iOS:HomeScreenUITests L69 |
| TC-HOME-058 | Given 히어로 7개 상태(Loading, NoOpenTopic, Empty, Processing, Photo+검수 대기, Photo, Error) / When 렌더 / Then 플랫폼 내 스크린샷 기준선과 다르지 않다 | D-06 | S | home/posts-today__*.json 전체 | iOS:HomeScreenUITests L192 / AN:HomeScreenTest |
| TC-HOME-059 | Given 개발 서버와 실제 계정(실행 시 받은 카카오 계정) / When 홈 전체를 실제 데이터로 열어 스크롤·새로고침 / Then 섹션 구성·이미지 비율·텍스트 잘림·배너 영역에 레이아웃 깨짐이 없다 (AG-HOME-001) | strategy §1-3 | A | - | iOS:HomeScreenUITests L69 |
| TC-HOME-060 | Given 개발 서버의 실제 주제 전환 / When 실제 KST 자정을 통과하거나 기기 시각을 자정 직전으로 옮겨 통과 / Then 홈이 새 날짜로 갱신되고 어제 랭킹이 바뀐다 (AG-HOME-002) | strategy §1-4, TOPIC-002 | A | - | 기존 항목 없음 |

## BANR 배너 웹뷰

배너 목록 조회(홈 ISSUE 섹션)와 웹뷰 링크 정책이다. 링크 정책은 순수 함수(`Allow`/`OpenExternal`/`Block` 결과)로 만들어 다섯 플랫폼이 같은 입력 표로 검증한다.

| ID | 검증 내용 | 근거 | 구분 | fixture | 기존 |
| --- | --- | --- | --- | --- | --- |
| TC-BANR-001 | Given 게스트 또는 회원 / When 홈이 `GET /banners?page=1&pageSize=10`을 호출 / Then 요청에 Authorization 헤더가 없고(공개 호출) 응답 `id,title,subtitle,webViewUrl,thumbnailUrl,createdAt`이 순서 그대로 매핑된다 | BANNER-006, B6, PAGE_SIZE | C | banner/banners__page1-10.json | iOS:BannerAPIClientTests L8 / AN:BannerRepositoryImplTest |
| TC-BANR-002 | Given 회원의 액세스 토큰이 만료 / When 홈이 배너를 호출 / Then 토큰을 보내지 않으므로 401이 나지 않고 200으로 목록이 표시된다(B7 회피). 서버가 401을 주는 fixture에서도 refresh를 시도하지 않는다 | B7, BANNER-006 | C | banner/banners__401-unauthorized.json | iOS:BannerAPIClientTests L74 / AN:NetworkModuleTest(public client) |
| TC-BANR-003 | Given 지정 페이지 / When `page=2` 호출과 빈 페이지 응답 / Then 쿼리가 그대로 전달되고 빈 `banners`·`hasNext=false`는 오류 없이 처리된다 | BANNER-006 | C | banner/banners__page2-last.json, banner/banners__empty.json | iOS:BannerAPIClientTests L43 / AN:BannerRepositoryImplTest |
| TC-BANR-004 | Given 응답에 `hasNext`가 없음 / When 파싱 / Then 마지막 페이지로 처리해 추가 요청을 보내지 않는다 | BANNER-006 | C+U | banner/banners__no-has-next.json | iOS:BannerAPIClientTests L63 / AN:BannerRepositoryImplTest(hasNext 기본값) |
| TC-BANR-005 | Given 배너 조회가 400·500 / When 호출 / Then 인증 갱신을 시도하지 않고, 5xx·연결 오류는 D-21의 GET 재시도(최대 2회) 뒤 오류로 반환된다 | D-21, §5.2 | C+U | banner/banners__500-server-error.json, banner/banners__400-bad-query.json | iOS:BannerAPIClientTests L74, L123 / AN:BannerRepositoryImplTest(HTTP 오류) |
| TC-BANR-006 | Given 응답 JSON이 깨졌거나 `webViewUrl`이 `http://` 등 안전하지 않은 주소 / When 파싱 / Then 잘못된 응답으로 처리해 ISSUE 섹션만 숨기고 앱은 깨지지 않는다 | BANNER-002, D-20 | C+U | banner/banners__malformed.json, banner/banners__insecure-url.json | iOS:BannerAPIClientTests L89 / AN:BannerRepositoryImplTest(깨진 응답) |
| TC-BANR-007 | Given `thumbnailUrl`이 잘못된 URL / When 파싱 / Then 배너는 유지되고 썸네일 자리만 대체 이미지로 표시된다 | BANNER-002 | C+W | banner/banners__bad-thumbnail.json | iOS:BannerAPIClientTests L104 |
| TC-BANR-008 | Given 요청이 취소됨 / When 화면 이탈 / Then 취소는 네트워크 오류로 바뀌지 않고 섹션 상태가 변하지 않는다 | D-20 | U | - | iOS:BannerAPIClientTests L133, HomeFeatureTests L295 |
| TC-BANR-009 | Given 게스트 / When 홈 로드 / Then 배너를 조회해 ISSUE 섹션을 보여 주고 랭킹이 실패해도 배너는 독립적으로 표시된다 | D-05, BANNER-006 | U | banner/banners__page1-10.json | iOS:HomeFeatureTests L244 / AN:HomeViewModelTest |
| TC-BANR-010 | Given 최초 배너 조회 실패 / When 홈 로드 / Then ISSUE 섹션이 숨겨지고 다른 홈 섹션은 영향이 없다. 빈 응답(`banners:[]`)도 섹션 숨김이다 | D-20 | U+W+E | banner/banners__500-server-error.json, banner/banners__empty.json | iOS:HomeFeatureTests L260 / iOS:HomeScreenUITests L135 / AN:HomeScreenTest(배너 섹션) |
| TC-BANR-011 | Given 기존 배너가 보임 / When 새로고침이 실패하거나 빈 성공(`banners:[]`)으로 끝남 / Then 실패면 기존 배너를 유지하고 빈 성공이면 기존 배너를 제거한다 | D-20 | U | banner/banners__500-server-error.json, banner/banners__empty.json | iOS:HomeFeatureTests L275 |
| TC-BANR-012 | Given 배너 20개(hasNext=true) / When 가로 목록 끝에서 2번째 항목 근처 도달 / Then 다음 페이지(`page=2`)를 1회만 요청해 10개씩 누적하고 로딩 중에는 중복 요청하지 않는다 | PAGE_SIZE, BANNER-006 | U | banner/banners__page1-10.json, banner/banners__page2-last.json | iOS:HomeFeatureTests L311 / AN:HomeViewModelTest(배너 페이징 prefetch) |
| TC-BANR-013 | Given 추가 페이지 조회가 실패 / When 다시 끝에 도달 / Then 같은 페이지를 다시 요청하고 성공하면 중복 ID를 제거해 누적한다 | D-20 | U | banner/banners__500-server-error.json → banner/banners__page2-last.json | iOS:HomeFeatureTests L336 |
| TC-BANR-014 | Given `hasNext=false` 또는 빈 추가 페이지 / When 끝 도달 / Then 더 이상 요청하지 않고 빈 추가 페이지는 기존 목록을 유지하며 조회를 종료한다 | BANNER-006 | U | banner/banners__page2-last.json, banner/banners__empty.json | iOS:HomeFeatureTests L357, L374 / iOS:HomeScreenUITests L149 |
| TC-BANR-015 | Given 배너가 누적됨 / When 새로고침 / Then 누적 목록이 교체되고 다음 페이지 요청은 `page=2`부터 다시 시작한다 | BANNER-006 | U | banner/banners__page1-10.json | iOS:HomeFeatureTests L390 |
| TC-BANR-016 | Given 추가 페이지 요청 진행 중 / When 화면 이탈(취소) 후 또는 새로고침 후 이전 응답이 늦게 도착 / Then 새 목록·상태를 덮어쓰지 않는다 | D-20 | U | banner/banners__page2-last.json | iOS:HomeFeatureTests L408, L426 |
| TC-BANR-017 | Given 정책 판정 함수 / When 최초 https 배너 URL 로드 / Then `AllowInApp`이고 http·빈 문자열·호스트 없음은 `Block`("링크를 열 수 없어요")이다 | BANNER-002, 쟁점 3 | U | - | iOS:IssueWebNavigationPolicyTests L10 / AN:IssueLinkNavigationTest |
| TC-BANR-018 | Given 웹뷰 안 / When 사용자 탭 없이 자동 이동(리다이렉트·스크립트)이나 새 창 자동 열기 / Then `Block`이다(최초 이슈 이후) | - | U | - | iOS:IssueWebNavigationPolicyTests L10 / AN:IssueLinkNavigationTest(자동 네비게이션 차단) |
| TC-BANR-019 | Given 웹뷰 안 / When 사용자가 일반 링크 또는 새 탭(`target=_blank`) 링크를 탭(같은 호스트·같은 URL 포함) / Then `OpenExternal`로 시스템 브라우저가 열린다(Web은 새 탭, `noopener`) | - | U+W | - | iOS:IssueWebNavigationPolicyTests L19 / AN:IssueLinkNavigationTest |
| TC-BANR-020 | Given 웹뷰 안 / When 같은 문서의 앵커(`#section`)를 탭 / Then 웹뷰 안에서 이동하고, 새 탭 앵커는 외부로 보낸다 | - | U | - | iOS:IssueWebNavigationPolicyTests L27 / AN:IssueLinkNavigationTest(앵커) |
| TC-BANR-021 | Given 웹뷰 안 / When `tel:`·`mailto:`·`intent:`·`javascript:`·`file:`·커스텀 스킴 링크 탭 / Then 실행하지 않는다(Block) | - | U | - | iOS:IssueWebNavigationPolicyTests L39 / AN:IssueLinkNavigationTest(비 http 차단) |
| TC-BANR-022 | Given 하위 프레임(iframe) 이동 / When 정책 판정 / Then 앱 밖으로 열지 않고 프레임 안에서 처리한다 | - | U | - | iOS:IssueWebNavigationPolicyTests L45 / AN:IssueLinkNavigationTest(서브프레임) |
| TC-BANR-023 | Given 외부 브라우저가 없거나 열기에 실패 / When OpenExternal 수행 / Then 토스트 "링크를 열 수 있는 브라우저가 없어요" 또는 "브라우저에서 링크를 열지 못했어요"가 뜬다 | D-20 | U+W | - | AN:IssueLinkNavigationTest(토스트 문구, 2.5) |
| TC-BANR-024 | Given 웹뷰 로드 실패(네트워크·HTTP 오류) / When 오류 화면에서 "다시 시도" 탭 / Then "페이지를 불러오지 못했어요" 표시 후 같은 URL을 다시 로드하고 성공 시 페이지가 보인다 | D-20 | W+E | banner/banners__page1-10.json(+ 웹뷰 대상 mock 페이지 500 → 200) | iOS ISSUE 오류 문구(2.3) [테스트 없음] |
| TC-BANR-025 | Given 배너 탭 / When 연타 / Then 웹뷰 화면이 1개만 열리고 `screen_view` `issue`가 1회만 전송된다 | D-22 | U+E | banner/banners__page1-10.json | AN:ChalkakNavHostTest(연타 방지, 이슈 웹 screen_view) |
| TC-BANR-026 | Given 웹뷰 화면 / When 뒤로가기 / Then 홈으로 복귀하고 홈의 스크롤 위치와 로딩된 배너 목록이 유지된다 | NAV | E | banner/banners__page1-10.json | iOS:HomeScreenUITests L112 |
| TC-BANR-027 | Given 게스트 / When 배너 탭 / Then 로그인 요구 없이 웹뷰가 열린다 | D-05 | E | banner/banners__page1-10.json | iOS:HomeScreenUITests L112 |
| TC-BANR-028 | Given 오프라인 / When 배너 탭 → 웹뷰 오류 → 온라인 복귀 후 다시 시도 / Then 오류 화면이 뜨고 복귀 후 정상 로드된다 | D-20 | E | banner/banners__page1-10.json | 신규 |
| TC-BANR-029 | Given 배너 항목 / When 렌더 / Then 제목·부제목이 접근성 라벨로 읽히고 testID `banner-item-<index>`가 붙는다 | strategy §2 | W | banner/banners__page1-10.json | AN:HomeScreenTest(배너 섹션) |
| TC-BANR-030 | Given 개발 서버 실제 배너(`/banners`) / When 배너를 탭해 웹뷰를 열고 링크를 눌러 외부 브라우저 전환을 확인 / Then 실제 웹 콘텐츠가 깨짐 없이 보이고 링크는 시스템 브라우저에서 열린다 (AG-BANR-001) | strategy §1-2·3 | A | - | iOS:HomeScreenUITests L112 |
| TC-BANR-031 | Given 개발 서버 / When 공개 `GET /banners` 스모크와 스키마 비교 / Then 응답이 OpenAPI 스냅샷·fixture 스키마와 일치한다 | BANNER-006 | D | banner/banners__page1-10.json(스키마 기준) | 신규 |

## 구현 시 확인할 쟁점

1. 달력(`/posts/calendar`)에서 오늘 postId를 못 찾을 때 썸네일 표시는 D-06에 명시가 없다. 이 카탈로그는 "Error로 바꾸지 않고 상태만 표시"로 임시 처리했다. 확정되면 TC-HOME-007을 고친다.
2. 주가 두 달에 걸칠 때 한 달만 실패하면 부분 표시할지는 규칙이 없다. 임시로 섹션 오류로 처리했다(TC-HOME-033).
3. 웹뷰 `AllowInApp`의 URL 조건(https만, 호스트 필수)은 BANNER-002(등록 시 https)에서 유추했다. features/home.md가 다르게 정하면 TC-BANR-017을 맞춘다.
4. iOS 전용 UI(평면 디자인 뒤로 버튼 터치 영역 `HomeScreenUITests L175`, 탭 왕복 스크롤 유지 L89, Liquid Glass)와 Android `HomeViewModelTest`의 초기 표시 데드라인(스플래시 700ms)은 각각 플랫폼 관례·BOOT 영역이라 이 목록에서 제외했다. 홈 탭 왕복 시 스크롤 위치 유지는 iOS만 하고 Android는 복원하지 않으므로 NAV 영역에서 통일 여부를 정한다.
5. iOS `Today*` 테스트와 Android `feature/today/*` 테스트는 죽은 코드(legacy-ios §4.2, legacy-android §5.2-8)라 흡수하지 않았다.

## 필요 fixture 목록

파일은 `shared/fixtures/` 아래 상대 경로다. 표의 HTTP는 mock 서버가 돌려줄 상태 코드이고, 오류 fixture의 본문은 `{errorCode, message}`다.

| 파일명 | 메서드 경로 | HTTP | 내용 요지 |
| --- | --- | --- | --- |
| home/posts-today__not-posted.json | GET /posts/today | 200 | topicDate=2026-10-27, isPosted=false, postId=null, moderationStatus=null |
| home/posts-today__not-posted-after-reject.json | GET /posts/today | 200 | 반려 후 재조회: isPosted=false(위와 같은 모양, 별도 파일로 상황 구분) |
| home/posts-today__posted-validating.json | GET /posts/today | 200 | isPosted=true, postId, moderationStatus=VALIDATING |
| home/posts-today__posted-pending.json | GET /posts/today | 200 | isPosted=true, moderationStatus=PENDING |
| home/posts-today__posted-approved.json | GET /posts/today | 200 | isPosted=true, moderationStatus=APPROVED |
| home/posts-today__unknown-status.json | GET /posts/today | 200 | moderationStatus="SOMETHING_NEW" (알 수 없는 값) |
| home/posts-today__404-no-open-topic.json | GET /posts/today | 404 | BUSINESS_ERROR "참여할 수 있는 주제가 없습니다." |
| home/posts-today__403-banned.json | GET /posts/today | 403 | FORBIDDEN "차단된 회원입니다." |
| home/posts-today__401-unauthorized.json | GET /posts/today | 401 | UNAUTHORIZED "유효하지 않은 인증 정보입니다." |
| home/posts-today__500-server-error.json | GET /posts/today | 500 | INTERNAL_ERROR "서버에서 요청을 처리하지 못했습니다." |
| home/topics__open-2026-10-27.json | GET /topics?date=2026-10-27 | 200 | phase=OPEN, startsAt 2026-10-26T15:00:00Z, endsAt 2026-10-27T15:00:00Z, title="우산" |
| home/topics__open-2026-10-26.json | GET /topics?date=2026-10-26 | 200 | 어제 주제, phase=CLOSED |
| home/topics__open-2026-10-28.json | GET /topics?date=2026-10-28 | 200 | 자정 이후 새 주제(자정 재로드 TC용) |
| home/topics__404-not-found.json | GET /topics?date=… | 404 | BUSINESS_ERROR "주제를 찾을 수 없습니다." |
| home/posts-list__popular-8.json | GET /posts?topicDate&sort=popular | 200 | posts 8개, 좋아요 내림차순, hasNext=false |
| home/posts-list__popular-5.json | GET /posts?sort=popular | 200 | 게스트용 5개(isLiked=false, isMine=false) |
| home/posts-list__popular-3.json | GET /posts?sort=popular | 200 | 3개 |
| home/posts-list__popular-1.json | GET /posts?sort=popular | 200 | 1개 |
| home/posts-list__popular-0.json | GET /posts?sort=popular | 200 | posts=[] |
| home/posts-list__500-server-error.json | GET /posts | 500 | INTERNAL_ERROR |
| home/posts-calendar__2026-10-week-approved.json | GET /posts/calendar?year=2026&month=10 | 200 | 10/27 APPROVED 포함 이번 주 기록 3건 |
| home/posts-calendar__2026-10-week-pending.json | GET /posts/calendar?year=2026&month=10 | 200 | 10/27 PENDING 포함 |
| home/posts-calendar__2026-10-empty.json | GET /posts/calendar?year=2026&month=10 | 200 | posts=[] |
| home/posts-calendar__2026-09-week.json | GET /posts/calendar?year=2026&month=9 | 200 | 9/27~9/30 기록 2건(월 경계 TC) |
| home/posts-calendar__2026-12-week.json | GET /posts/calendar?year=2026&month=12 | 200 | 12/27~12/31 기록 |
| home/posts-calendar__2027-01-empty.json | GET /posts/calendar?year=2027&month=1 | 200 | posts=[] |
| home/posts-calendar__2026-11-empty.json | GET /posts/calendar?year=2026&month=11 | 200 | posts=[] |
| home/posts-calendar__500-server-error.json | GET /posts/calendar | 500 | INTERNAL_ERROR |
| home/notifications-unread-status__true.json | GET /notifications/unread-status | 200 | hasUnread=true |
| home/notifications-unread-status__false.json | GET /notifications/unread-status | 200 | hasUnread=false |
| home/notifications-unread-status__500-server-error.json | GET /notifications/unread-status | 500 | INTERNAL_ERROR |
| banner/banners__page1-10.json | GET /banners?page=1&pageSize=10 | 200 | 배너 10개, hasNext=true, createdAt 내림차순 |
| banner/banners__page2-last.json | GET /banners?page=2&pageSize=10 | 200 | 배너 3개, hasNext=false |
| banner/banners__empty.json | GET /banners | 200 | banners=[], hasNext=false |
| banner/banners__no-has-next.json | GET /banners | 200 | hasNext 필드 없음 |
| banner/banners__malformed.json | GET /banners | 200 | 깨진 JSON(필수 필드 누락) |
| banner/banners__insecure-url.json | GET /banners | 200 | webViewUrl이 http:// |
| banner/banners__bad-thumbnail.json | GET /banners | 200 | thumbnailUrl 형식 오류, 나머지 정상 |
| banner/banners__401-unauthorized.json | GET /banners | 401 | UNAUTHORIZED (만료 토큰 B7 재현) |
| banner/banners__400-bad-query.json | GET /banners | 400 | BUSINESS_ERROR "조회 조건이 올바르지 않습니다." |
| banner/banners__500-server-error.json | GET /banners | 500 | INTERNAL_ERROR |
