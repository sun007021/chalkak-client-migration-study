# 테스트 카탈로그: 전시·게시물 상세·좋아요(DISP, FEED, LIKE)

전시 탭(날짜 이동, 정렬, 랜덤 시드, 페이징, 아카이브), 게시물 상세(제목 수정·삭제, 줌), 좋아요(낙관적 갱신·롤백·직렬화)의 동작을 다섯 클라이언트가 같게 만드는 테스트 목록이다. 좋아요는 전시·홈 랭킹·피드 모든 화면에서 낙관적으로 바꾸고 실패하면 롤백과 토스트를 띄운다(D-04). 제목은 앞뒤 공백 제거 뒤 code point 10자(D-01)이고, 오류 분기는 errorCode·HTTP·호출 API로만 하며 `message` 문자열로 하지 않는다(D-02). 최초 전시일 `2026-09-17`(D-12), KST 자정, 월·연 경계, 가짜 시계, 늦은(stale) 응답, 연타, 계정 전환, 오프라인을 모두 포함한다. 기존 iOS `DisplayFeatureTests`·`FeedFeatureTests`·`FeedAPIClientTests`·`FeedZoomRenderingTests`와 Android `DisplayViewModelTest`·`FeedViewModelTest`·`FeedPhotoZoomTest`·`PostRemoteDataSourceImplTest`·`PostRepositoryImplTest`·`TopicRemoteDataSourceImplTest`의 검증을 흡수했고, Android 쪽 출처는 파일 단위로 적었다(줄 번호 없음). 기준일은 별도 표기가 없으면 오늘 KST = 2026-10-27(화)이며, fixture 열은 `shared/fixtures/` 기준 상대 경로다. 로그인 사용자의 userId는 fixture 전역에서 `11111111-1111-4111-8111-111111111111`(사용자 A)로 고정하고, 사용자 B는 `22222222-2222-4222-8222-222222222222`로 둔다(가짜 값이며 실제 계정과 무관). A 구분은 감각·시각 판단과 개발 서버 실데이터 확인에 한정한다.

## DISP 전시

| ID | 검증 내용 | 근거 | 구분 | fixture | 기존 |
| --- | --- | --- | --- | --- | --- |
| TC-DISP-001 | Given 전시 탭 진입 직후 / When 응답 전 / Then 상태는 Loading이고 날짜 이동 버튼은 비활성이다 | D-12 | U+W | display/topics__open-2026-10-27.json(지연) | iOS:DisplayFeatureTests L7 / AN:DisplayViewModelTest |
| TC-DISP-002 | Given 오늘 전시 / When 로드 / Then `GET /topics?date=2026-10-27`을 먼저 호출하고 응답 `topicDate`를 정규(canonical) 날짜로 삼아 `GET /posts?topicDate=…&sort=recent&page=1&pageSize=20`을 호출하며 사진 4종 URL(원본·썸네일·사인 원본·사인 썸네일)과 `likeCount`·`isLiked`·`isMine`·`title`을 매핑한다 | POST-008, TOPIC-005, F1, PAGE_SIZE | C+U | display/topics__open-2026-10-27.json, display/posts-list__recent-page1.json | iOS:DisplayFeatureTests L21, L904 / AN:TopicRemoteDataSourceImplTest, PostRemoteDataSourceImplTest |
| TC-DISP-003 | Given `posts` 요청 / When 쿼리 생성 / Then `sort`는 소문자(`recent`·`popular`·`random`), `pageSize=20`, `page`는 1 이상이며 `randomSeed`는 `[A-Za-z0-9_-]{1,64}`일 때만 붙는다(대문자·0·101·65자·`!`는 만들 수 없다) | F1, F2, F6, F7 | C | - | AN:PostRemoteDataSourceImplTest(정렬·seed 쿼리) |
| TC-DISP-004 | Given 로그인 토큰 있음 / When `GET /posts` / Then Authorization 헤더를 붙이고, 게스트면 헤더를 붙이지 않으며 응답의 `isLiked=false, isMine=false`를 그대로 쓴다 | F10, §0.1 | C | display/posts-list__recent-page1.json, display/posts-list__guest-page1.json | iOS:DisplayFeatureTests L987 / AN:PostRemoteDataSourceImplTest(Bearer) |
| TC-DISP-005 | Given 최초 로드 실패 / When `/topics`·`/posts`가 500 또는 연결 실패 / Then 요청 날짜를 유지한 오류 상태("전시를 불러오지 못했어요" 또는 연결 실패면 "네트워크 연결을 확인해 주세요") + 다시 시도이고 다시 시도하면 같은 날짜로 재요청한다 | D-20 | U+W | display/posts-list__500-server-error.json → display/posts-list__recent-page1.json | iOS:DisplayFeatureTests L427 / AN:DisplayViewModelTest |
| TC-DISP-006 | Given 오늘 날짜에 주제가 없음 / When `/topics?date=오늘`이 404 "주제를 찾을 수 없습니다." / Then 최초 로드면 빈 상태("이 날 올라온 사진이 없어요")이고 오류가 아니다 | T3, D-12 | U+W | display/topics__404-not-found.json | iOS:DisplayFeatureTests L289 / AN:DisplayViewModelTest |
| TC-DISP-007 | Given 주제는 있으나 posts가 404 "해당 날짜의 주제를 찾을 수 없습니다." / When 로드 / Then 빈 상태이고 다시 시도 버튼 없이 날짜 이동은 가능하다 | §5.2, POST-008 | U | display/posts-list__404-topic-not-found.json | iOS:DisplayFeatureTests L1051 / AN:PostRemoteDataSourceImplTest(HTTP 오류) |
| TC-DISP-008 | Given 서버가 400 "미래 날짜의 게시물은 조회할 수 없습니다." 또는 "조회 조건이 올바르지 않습니다."를 줌 / When 로드 / Then 앱은 깨지지 않고 일반 오류 상태(다시 시도)이며 `message`로 분기하지 않는다 | D-02, §5.2 | U | display/posts-list__400-future-date.json, display/posts-list__400-bad-query.json | AN:PostRepositoryImplTest(HTTP 오류 보존) |
| TC-DISP-009 | Given 오늘 주제의 `phase`가 BEFORE_OPEN 또는 CLOSED / When 로드 / Then `phase`와 무관하게 posts를 조회해 있는 사진을 보여 준다(없으면 빈 상태) | TOPIC-003, §4.4 | U | display/topics__before-open.json, display/posts-list__recent-page1.json | 신규 |
| TC-DISP-010 | Given 이미 사진이 보임 / When 새로고침·다음 페이지 실패 / Then 콘텐츠를 유지하고 토스트만 띄우며 오류 화면으로 바꾸지 않는다 | D-20 | U+W | display/posts-list__500-server-error.json | iOS:DisplayFeatureTests L490 / AN:DisplayViewModelTest(재검증 실패) |
| TC-DISP-011 | Given 오늘 전시 / When 정렬 탭 렌더 / Then 최신순·인기순·랜덤순 3개가 보이고 기본은 최신순이며 선택에 따라 `sort`가 `recent`·`popular`·`random`으로 요청된다 | POST-008 | W+U | display/posts-list__recent-page1.json, display/posts-list__popular-page1.json | AN:DisplayScreenTest(정렬) |
| TC-DISP-012 | Given 정렬을 최신→인기로 변경 / When 새 정렬 응답 대기 / Then 기존 사진을 유지한 채 로딩하고 도착하면 교체하며, 처음 보는 정렬만 네트워크를 쓰고 다시 선택하면 (날짜, 정렬) 캐시를 즉시 보여 준다 | D-20 | U | display/posts-list__recent-page1.json, display/posts-list__popular-page1.json | iOS:DisplayFeatureTests L70 / AN:DisplayViewModelTest(정렬 재조회) |
| TC-DISP-013 | Given 과거 날짜(예: 2026-10-26) / When 전시 표시 / Then 아카이브 모드로 `sort=popular`만 쓰고 정렬 탭을 숨기며 상위 5개를 추천 캐러셀 + 나머지 그리드로 보여 주고 헤더 문구 "가장 사람들이 좋아했던 사진들이에요" / "같은 주제에서 다른 시선을 느껴보세요"가 보인다 | POST-008, D-12 | U+W | display/topics__open-2026-10-26.json, display/posts-list__popular-page1.json | iOS:DisplayFeatureTests L43 / AN:DisplayScreenTest |
| TC-DISP-014 | Given 오늘에서 랜덤순을 보다가 과거 날짜로 갔다 돌아옴 / When 오늘 복귀 / Then 직전 정렬(랜덤순)이 복원된다 | POST-008 | U | display/posts-list__random-page1-seed.json | iOS:DisplayFeatureTests L43 |
| TC-DISP-015 | Given 랜덤순 첫 페이지 / When 요청 / Then `randomSeed`를 보내지 않고 응답 `randomSeed`를 저장한다 | POST-008, F3 | C+U | display/posts-list__random-page1-seed.json | iOS:DisplayFeatureTests L940 / AN:DisplayViewModelTest(seed 유지) |
| TC-DISP-016 | Given 저장된 seed / When 랜덤 2페이지 요청 / Then `page=2&randomSeed=<저장값>`을 보내고 seed 없이 2페이지를 요청하는 일(F4의 400)이 없다 | F4, POST-008 | C+U | display/posts-list__random-page2.json | iOS:DisplayFeatureTests L625, L961 / AN:PostRepositoryImplTest(랭킹 페이지/seed 규칙) |
| TC-DISP-017 | Given 랜덤 첫 페이지를 재검증(탭 복귀·새로고침) / When 재요청 / Then 기존 seed를 첫 페이지 요청에도 보내고 같은 seed의 뒤쪽 페이지는 유지한다 | POST-008 | U | display/posts-list__random-page1-seed.json | iOS:DisplayFeatureTests L185, L940 |
| TC-DISP-018 | Given 랜덤순 / When 정렬을 최신·인기로 바꿈 / Then 저장 seed를 폐기하고 이후 `recent`·`popular` 요청에 `randomSeed`가 없다(F5의 400 방지) | F5, POST-008 | C+U | display/posts-list__recent-page1.json | AN:DisplayViewModelTest, PostRemoteDataSourceImplTest |
| TC-DISP-019 | Given 랜덤 응답에 `randomSeed`가 null/없음 / When 다음 페이지 도달 / Then 2페이지 요청을 보내지 않고 연속 로딩을 멈춘다(seed 없는 random 연속 페이지는 400) | F4, §5.2 | U | display/posts-list__random-no-seed.json | iOS:DisplayFeatureTests L1051 |
| TC-DISP-020 | Given 랜덤 페이지 사이에 같은 사진 ID가 중복 / When 누적 / Then 페이지 경계에서 중복 ID를 제거한다 | POST-008, §8.2-19 | U | display/posts-list__random-page1-seed.json, display/posts-list__random-page2-overlap.json | iOS:DisplayFeatureTests L625 |
| TC-DISP-021 | Given 랜덤 seed 보유 / When 날짜를 바꿈 / Then 새 날짜 첫 페이지는 seed 없이 요청되고 이전 날짜 seed를 쓰지 않는다 | F3 | U | display/posts-list__random-page1-seed.json | 신규 |
| TC-DISP-022 | Given 20개씩 로드 / When 끝 임계 도달 / Then 다음 페이지를 1회만 요청하고(진행 중 중복 호출 없음) 응답을 이어 붙인다 | PAGE_SIZE, POST-008 | U | display/posts-list__recent-page1.json, display/posts-list__recent-page2.json | AN:DisplayViewModelTest(페이징) |
| TC-DISP-023 | Given `hasNext=false` / When 끝 도달 / Then 요청이 없고, 범위 밖 `page=99`에 대한 빈 `posts`·`hasNext=false` 응답도 오류 없이 처리한다 | F9 | U | display/posts-list__page99-empty.json | AN:DisplayViewModelTest |
| TC-DISP-024 | Given 첫 페이지 재검증 진행 중 / When 끝 도달 / Then 다음 페이지를 요청하지 않는다 | D-04 | U | - | iOS:DisplayFeatureTests L577 |
| TC-DISP-025 | Given 2페이지까지 캐시 / When 첫 페이지만 재검증 성공 / Then 캐시된 다음 페이지는 유지된다(최신·인기순) | D-20 | U | display/posts-list__recent-page1.json, display/posts-list__recent-page2.json | iOS:DisplayFeatureTests L142 |
| TC-DISP-026 | Given 다음 페이지 요청 실패 / When 다시 끝 도달 / Then 토스트 후 같은 `page`를 다시 요청하고 이미 있는 사진은 유지된다 | D-20 | U | display/posts-list__500-server-error.json → display/posts-list__recent-page2.json | AN:DisplayViewModelTest |
| TC-DISP-027 | Given 페이지 사이 새 글로 오프셋이 밀림 / When 이어 붙임 / Then 같은 ID 중복은 제거하고 건너뛴 항목은 허용한다(스냅샷 고정 없음) | §8.2-19, POST-012 | U | display/posts-list__recent-page2-overlap.json | 신규 |
| TC-DISP-028 | Given 2026-09-17(최초 전시일)을 보는 중 / When 이전 날짜 이동 시도 / Then 이동하지 않고(이전 버튼 비활성) 요청도 없다. 2026-09-18에서 이전은 `2026-09-17`로 이동한다 | D-12 | U+W | display/topics__first-date-2026-09-17.json | iOS:DisplayFeatureTests L314 / AN:DisplayViewModelTest(clamp) |
| TC-DISP-029 | Given 오늘(KST) / When 다음 날짜 이동 시도 / Then 이동하지 않는다(미래 금지). 어제에서 다음은 오늘이다 | T2, T7, TOPIC-005 | U+W | - | AN:DisplayViewModelTest, DisplayScreenTest(날짜 내비) |
| TC-DISP-030 | Given 월·연 경계 / When 2026-10-01에서 이전, 2027-01-01에서 이전, 2026-12-31에서 다음 / Then 요청 날짜는 각각 `2026-09-30`, `2026-12-31`, `2027-01-01`로 정확한 `yyyy-MM-dd`다(가짜 시계로 오늘을 해당 값 이후로 설정) | TOPIC-005 | U+C | - | AN:DisplayViewModelTest(날짜 이동) |
| TC-DISP-031 | Given 이전 날짜 이동 / When 그 날짜 `/topics`가 404 / Then 직전 성공 전시와 날짜를 복원하고 최초 전시일 상수를 바꾸지 않으며 안내 토스트 "해당 날짜의 전시가 없어요"를 띄운다(문구는 copy) | D-12, T3 | U | display/topics__404-not-found.json | iOS:DisplayFeatureTests L289 / AN:DisplayViewModelTest(주제 없는 날짜) |
| TC-DISP-032 | Given 날짜 선택으로 여러 날을 건너뜀 / When 도착 날짜가 404 / Then 직전 성공 전시를 복원하고 최초 전시일을 바꾸지 않는다 | D-12 | U | display/topics__404-not-found.json | iOS:DisplayFeatureTests L383 |
| TC-DISP-033 | Given 날짜 이동 중 네트워크 실패 / When 응답 / Then 경계를 만들지 않고 직전 성공 콘텐츠를 복원하며 토스트 "네트워크 연결을 확인해 주세요"를 띄운다 | D-20 | U | display/topics__500-server-error.json | iOS:DisplayFeatureTests L405 |
| TC-DISP-034 | Given 날짜 선택 시트 / When 범위 밖 날짜(2026-09-01, 내일) 선택 / Then `[2026-09-17, 오늘]` 범위 끝으로 맞춘다 | D-12 | U | - | iOS:DisplayFeatureTests L337 / AN:DisplayViewModelTest(clamp), DisplayDatePickerSheetTest |
| TC-DISP-035 | Given 현재 보는 날짜 / When 같은 날짜를 다시 선택 / Then 재요청하지 않는다 | D-20 | U | - | iOS:DisplayFeatureTests L365 |
| TC-DISP-036 | Given 날짜 피커의 연·월 목록 / When 첫 해·마지막 해 / Then 첫 해는 9월부터, 마지막 해는 오늘의 월까지만 고를 수 있고 첫 달은 17일부터, 마지막 달은 오늘까지, 사이 달은 말일까지 고를 수 있다 | D-12 | U+W | - | iOS:DisplayFeatureTests L871, L879 / AN:DisplayDatePickerSheetTest |
| TC-DISP-037 | Given 일 보정 / When 31일에서 30일뿐인 달로 월 변경, 2027-02-29, 윤년 2028-02-29 선택(가짜 시계 2028-03-05) / Then 없는 날은 말일로, 2028-02-29는 허용, 2027-02는 28일로 맞춘다 | D-12 | U | - | iOS:DisplayFeatureTests L888 / AN:DisplayDatePickerSheetTest |
| TC-DISP-038 | Given 이전 버튼 연타 N회 / When 연달아 응답 / Then 최종 표시는 마지막 이동 날짜이고 중간 날짜 응답이 늦게 와도 덮지 않는다 | D-04 | U | display/posts-list__recent-page1.json(지연) | 신규 |
| TC-DISP-039 | Given 가짜 시계 2026-10-27T14:59:59Z(KST 23:59:59) / When 날짜 상한 계산 / Then 상한은 2026-10-27이고 15:00:00Z에는 2026-10-28이다. 기기 시간대 UTC·America/Los_Angeles에서도 같다 | T6, T7, TOPIC-002 | U | - | AN:DisplayViewModelTest(KST) |
| TC-DISP-040 | Given 전시 탭이 오래 열려 있다가 자정 이후 복귀 / When 포그라운드 / Then 상한만 새 오늘로 갱신하고 보던 날짜는 바꾸지 않으며, 어제가 된 날짜는 다음 로드부터 아카이브 모드로 취급한다(임시, 쟁점 1) | TOPIC-002, D-19 | U | - | 신규 |
| TC-DISP-041 | Given 날짜 라벨 / When 렌더 / Then 응답 `topicDate` 문자열의 "M월 d일"을 그대로 쓰고(예: 9월 7일, 10월 27일) 기기 시간대와 무관하다 | D-09 | U+W | display/topics__open-2026-10-27.json | iOS:FeedFeatureTests(날짜 라벨) / AN:DisplayScreenTest |
| TC-DISP-042 | Given 같은 날짜의 지난 전시를 다시 불러옴 / When 재검증 / Then 보던 추천 캐러셀 페이지를 유지하고, 다른 날짜로 이동하면 첫 페이지로 돌아간다 | D-20 | U | display/posts-list__popular-page1.json | iOS:DisplayFeatureTests L515, L546 |
| TC-DISP-043 | Given 아카이브에 사진이 5개 미만 / When 렌더 / Then 있는 만큼만 추천에 쓰고 그리드는 비며(또는 나머지만) 깨지지 않는다 | POST-008 | U+W | display/posts-list__popular-3.json | AN:DisplayScreenTest |
| TC-DISP-044 | Given 전시 탭 재선택·복귀 / When 재검증 성공 / Then 기존 전시를 유지한 채 최신 값으로 교체하고, 실패하면 기존 전시를 유지한다(토스트) | D-20 | U | display/posts-list__recent-page1.json | iOS:DisplayFeatureTests L443, L490 / AN:DisplayViewModelTest |
| TC-DISP-045 | Given 피드에서 전시로 복귀 / When 재검증 / Then 랜덤 seed와 페이지 꼬리를 유지하고 다음 페이지도 같은 seed로 요청한다 | POST-008 | U | display/posts-list__random-page1-seed.json, display/posts-list__random-page2.json | iOS:DisplayFeatureTests L242 |
| TC-DISP-046 | Given 날짜 A→B로 이동 / When A의 느린 응답이 B 이후 도착 / Then 이전 세대(generation) 응답은 최신 상태를 덮지 않는다 | D-04 | U | display/posts-list__recent-page1.json(지연) | iOS:DisplayFeatureTests L672 / AN:DisplayViewModelTest |
| TC-DISP-047 | Given 정렬 A→B 빠른 전환 / When A 응답이 늦게 도착 / Then 정렬 B 화면을 덮지 않고 A 결과는 (날짜, 정렬) 캐시에만 남는다 | D-04 | U | display/posts-list__popular-page1.json(지연) | 신규 |
| TC-DISP-048 | Given 전시 화면 이탈로 요청 취소 / When 취소 결과 / Then 오류 토스트·오류 화면이 없고 재진입 시 다시 로드한다 | D-20 | U | - | AN:DisplayViewModelTest |
| TC-DISP-049 | Given 사용자 A 로그아웃 후 사용자 B 로그인 / When 전시 재진입 / Then A의 `isLiked`·캐시·seed가 B 화면에 보이지 않는다 | D-17 | U | - | 신규 |
| TC-DISP-050 | Given 오프라인 / When 전시 진입(캐시 없음) 후 온라인 복귀 → 다시 시도 / Then 오류 + 다시 시도 → 성공 로드 | D-20 | E | display/posts-list__recent-page1.json(연결 끊김 → 복구) | 신규 |
| TC-DISP-051 | Given 토큰 만료 / When `GET /posts`가 401 `UNAUTHORIZED` / Then 공개 API라도 refresh 후 1회 재전송한다(만료 토큰을 보낸 경우 익명 처리 안 됨) | §0.1, D-17 | U | display/posts-list__401-unauthorized.json → display/posts-list__recent-page1.json | AN:TokenAuthenticatorTest |
| TC-DISP-052 | Given `Retry-After`가 있는 429/503 / When GET 재시도 / Then 지정한 시간만 기다린 뒤 재시도하고 멱등 GET은 최대 2회, 0.5s·1s 백오프다 | D-21 | U | display/posts-list__503-retry-after.json | 신규 |
| TC-DISP-053 | Given 게스트 / When 전시 탭 진입 / Then 목록을 볼 수 있고 Authorization 없이 `GET /topics`·`GET /posts`만 호출한다 | D-05 | U+E | display/posts-list__guest-page1.json | iOS 1.3(전시 게스트 허용) [테스트 없음] |
| TC-DISP-054 | Given 게스트 / When 사진 탭 / Then 토스트 "게시물 피드를 보려면 로그인이 필요해요"가 뜨고 `GET /posts/{id}` 요청 0건이며 화면 이동이 없다 | D-05 | U+E | display/posts-list__guest-page1.json | iOS:HomeScreenUITests L69 |
| TC-DISP-055 | Given 사진 탭 / When 상세로 이동 / Then 목록의 id·이미지 URL·likeCount·isLiked와 셀 좌표를 시드로 전달하고 상세 응답 전에도 이미지가 보인다 | POST-007 | U+E | display/posts-list__recent-page1.json, feed/posts-detail__other.json | iOS:FeedFeatureTests L365 / AN:DisplayScreenTest |
| TC-DISP-056 | Given 업로드 성공 후 "확인했어요." / When 전시 열림 / Then 업로드한 `topicDate`의 전시가 열린다. 기록 화면의 "전시 보러가기"도 해당 날짜로 열리고 뒤로가면 기록으로 복귀한다 | D-14 | E | display/posts-list__recent-page1.json | AN:ChalkakNavHostTest(업로드 성공 후 전시, 기록에서 전시 복귀) |
| TC-DISP-057 | Given 2열 메이슨리 그리드 / When 서로 다른 비율의 사진 렌더 / Then 열 높이가 균형 있게 배치되고 사진 비율이 유지된다 | D-13(플랫폼 관례) | W+S | display/posts-list__mixed-ratio.json | AN:DisplayPhotoCardTest, FittedPhotoCardShapeTest |
| TC-DISP-058 | Given 스크롤 / When 헤더 접힘 계산 / Then 접힘 진행도가 0~1로 clamp되고 위로 스크롤하면 펼쳐진다 | - | U+W | - | AN:CollapsingScrollTest / AN:DisplayScreenTest(헤더 접힘) |
| TC-DISP-059 | Given 상태별 화면(Loading, 오류, 빈 상태, 최신·인기·랜덤, 아카이브 헤더) / When 렌더 / Then 플랫폼 내 스크린샷 기준선과 같다 | - | S | display/*.json 전체 | AN:DisplayScreenTest |
| TC-DISP-060 | Given 전시 화면 / When 요소 렌더 / Then testIDs.md의 전시 식별자(정렬 탭, 이전·다음, 날짜 선택, 사진 카드, 좋아요, 다시 시도)가 존재한다 | strategy §2 | W | - | AN:DisplayScreenTest |
| TC-DISP-061 | Given 개발 서버 공개 API / When `GET /topics?date=2026-09-17`, `GET /posts?topicDate=<오늘>&sort=recent·popular·random` 스모크 / Then 200이고 `FIRST_TOPIC_DATE`에 주제가 존재하며 스키마가 fixture와 일치한다(드리프트 검사) | D-12, F3 | D | display/posts-list__recent-page1.json(스키마 기준) | 신규 |
| TC-DISP-062 | Given 개발 서버 실데이터(실행 시 받은 카카오 계정) / When 전시를 날짜별·정렬별로 스크롤 / Then 이미지 비율·메이슨리 배치·무한 스크롤 감각·헤더 접힘에 깨짐이 없다 (AG-DISP-001) | strategy §1-3 | A | - | 신규 |

## FEED 게시물 상세

| ID | 검증 내용 | 근거 | 구분 | fixture | 기존 |
| --- | --- | --- | --- | --- | --- |
| TC-FEED-001 | Given 전시·홈·기록에서 진입 / When 상세 첫 렌더 / Then 시드(이미지·likeCount·isLiked·제목)로 즉시 보이고 기본 상태에서는 좋아요가 비활성이며, 전시 시드는 상세 확정 후에만 좋아요가 활성화된다 | D-04 | U+W | feed/posts-detail__other.json(지연) | iOS:FeedFeatureTests L51, L107 / AN:FeedViewModelTest |
| TC-FEED-002 | Given 상세 요청 / When `GET /posts/{id}` / Then Authorization 필수, 응답 `id, authorId, topic{id,title,topicDate}, originalImageUrl, thumbnailImageUrl, signatureOriginalImageUrl, title, likeCount, isLiked`를 매핑하고 trailing slash 없는 base URL에서도 경로가 유지된다 | POST-007, POST-008 | C | feed/posts-detail__other.json | iOS:FeedAPIClientTests L7 / AN:PostRemoteDataSourceImplTest(상세) |
| TC-FEED-003 | Given `thumbnailImageUrl`이 null / When 렌더 / Then 원본 이미지로 대체하고 오류 상태가 되지 않는다 | §1.3(nullable) | C+U | feed/posts-detail__null-thumbnail.json | AN:PostRemoteDataSourceImplTest(썸네일) |
| TC-FEED-004 | Given 응답에는 `isMine`이 없음 / When 내 게시물 판정 / Then `authorId == 로그인 userId`로 판정하고, 기록에서 진입한 FeedTarget은 상세 응답 후에도 내 게시물로 유지된다(쟁점 2) | POST-008(authorId), §1.3 | U | feed/posts-detail__mine-today.json, feed/posts-detail__other.json | iOS:FeedFeatureTests L292 / AN:FeedViewModelTest |
| TC-FEED-005 | Given 게스트 / When 전시 또는 홈 랭킹에서 상세 진입 시도 / Then 토스트 "게시물 피드를 보려면 로그인이 필요해요"이고 `GET /posts/{id}` 0건이다. 서버가 401을 주는 직접 진입도 로그인 화면으로 보낸다(F11) | D-05, F11 | U+D | feed/posts-detail__401-unauthorized.json | iOS 1.3("상세를 보려면 로그인이 필요해요" → D-05로 문구 변경) |
| TC-FEED-006 | Given 토큰 만료 / When 상세 401 `UNAUTHORIZED` / Then refresh 1회 후 재전송, `REAUTHENTICATION_REQUIRED`면 세션 정리 + 로그인 화면 | D-17, K1, K2 | U | feed/posts-detail__401-unauthorized.json | AN:TokenAuthenticatorTest |
| TC-FEED-007 | Given 삭제·비공개·미승인 게시물 / When 상세 404 "게시물을 찾을 수 없습니다." / Then "게시물을 찾을 수 없어요" 화면, 뒤로 가면 해당 게시물이 목록에서 사라지거나 목록이 새로고침된다 (F14: 승인 전 본인 게시물도 404) | §5.2, F14 | U+W | feed/posts-detail__404-not-found.json | iOS:FeedFeatureTests(404 문구) / AN:FeedViewModelTest(404) |
| TC-FEED-008 | Given 잘못된 ID 형식 400 "ID 형식이 올바르지 않습니다." 또는 500 / When 로드 / Then 일반 오류 "게시물을 불러오지 못했어요" + 다시 시도이고 연결 실패면 "네트워크 연결을 확인해 주세요"다 | D-02, D-20 | U+W | feed/posts-detail__400-invalid-id.json, feed/posts-detail__500-server-error.json | AN:FeedViewModelTest(로드 오류) |
| TC-FEED-009 | Given 응답 계약 위반(필수 필드 누락, `likeCount`가 문자열·음수) / When 파싱 / Then "게시물 정보를 불러오지 못했어요"이고 앱은 깨지지 않는다 | D-02 | C+U | feed/posts-detail__invalid-schema.json | AN:PostRepositoryImplTest(상세 매핑), PostRemoteDataSourceImplTest(빈·깨진 body) |
| TC-FEED-010 | Given 상세가 이미 보임 / When 재진입·복귀 후 갱신 실패 / Then 기존 콘텐츠를 유지하고 토스트만 띄운다 | D-20 | U | feed/posts-detail__500-server-error.json | AN:FeedViewModelTest(상세 갱신 실패) |
| TC-FEED-011 | Given 상세 요청 중 화면 이탈 / When 응답이 늦게 도착 / Then 요청은 취소되고 오류로 보이지 않으며 늦은 응답은 무시된다 | D-20 | U | feed/posts-detail__other.json(지연) | AN:FeedViewModelTest |
| TC-FEED-012 | Given 오프라인 / When 시드 있는 상세 진입 / Then 시드 콘텐츠를 보여 주고 상세 확정 불가 오류를 토스트로 알리며 좋아요·수정·삭제는 상세 확정 전까지 막힌다 | D-20 | U | feed/posts-detail__network-failure(mock 연결 끊김) | 신규 |
| TC-FEED-013 | Given 상세 / When 렌더 / Then 라벨은 "{M}월 {d}일의 주제"(topic.topicDate, KST, 기기 시간대 무관), 제목이 null·빈 값이면 "무제", 접근성 설명은 "작품 이미지: {title}" 또는 "무제 작품 이미지"이고 사인 이미지가 사진 위에 표시된다 | D-09, POST-008 | U+W | feed/posts-detail__no-title.json, feed/posts-detail__mine-today.json | iOS:FeedZoomRenderingTests L116 / AN:FeedScreenTest |
| TC-FEED-014 | Given 사인 이미지 URL 로드 실패 / When 렌더 / Then 사진은 정상 표시되고 사인만 생략된다 | SIGN-005 | W | feed/posts-detail__mine-today.json | 신규 |
| TC-FEED-015 | Given 상세에서 뒤로가기 / When 이전 화면 복귀 / Then 이전 화면의 스크롤 위치·선택 날짜·정렬이 유지된다 | NAV | E | feed/posts-detail__other.json | AN:ChalkakNavHostTest |
| TC-FEED-016 | Given 내 게시물 + topic.topicDate가 KST 오늘 / When 상세 렌더 / Then 제목 수정 버튼이 보이고, 남의 게시물이거나 지난 주제면 보이지 않으며 어떤 수정 요청도 보내지 않는다 | D-23, POST-010 | U+W | feed/posts-detail__mine-today.json, feed/posts-detail__mine-past.json, feed/posts-detail__other.json | iOS:FeedFeatureTests L234 / AN:FeedViewModelTest, FeedScreenTest(삭제/수정 버튼 노출) |
| TC-FEED-017 | Given 가짜 시계 2026-10-27T14:59:59.999Z(KST 23:59:59.999)이고 topicDate=2026-10-27 / When 렌더 / Then 수정 버튼이 보인다. 15:00:00.000Z(KST 10/28 00:00)에는 보이지 않는다(화면이 열린 채 자정을 지나도 재평가) | D-23, T6, T9 | U | feed/posts-detail__mine-today.json | AN:FeedViewModelTest(KST dateProvider) |
| TC-FEED-018 | Given 수정 다이얼로그 / When 열기 / Then 현재 제목이 미리 채워지고 플레이스홀더 "제목을 입력해 주세요.", "취소"/"저장" 버튼이 있으며 "취소"는 요청을 보내지 않는다 | D-23 | W+U | feed/posts-detail__mine-today.json | iOS 2.5 문구 / AN:FeedScreenTest |
| TC-FEED-019 | Given 제목 입력 / When 이모지 10개 입력 후 11번째 입력 / Then 10개는 허용(UTF-16 20)되고 11번째는 입력되지 않는다 | D-01, H4, H2 | U+W | - | iOS:chalkakTests L31, L38 / AN:FeedViewModelTest |
| TC-FEED-020 | Given 제목 입력 / When 결합 이모지 👨‍👩‍👧(5 code point) 2개 + 한 글자(11) 입력, 또는 11자 붙여넣기 / Then 11번째 code point부터 막히고 붙여넣기는 10 code point까지만 들어간다(grapheme로 세지 않는다) | D-01, H3 | U+W | - | iOS:chalkakTests L18, L31(grapheme 기준 → code point로 전환) / AN:FeedViewModelTest(takeGraphemes 대체) |
| TC-FEED-021 | Given 입력 " 가나다라마바사아자차 "(앞뒤 공백 포함 12자) / When 저장 / Then strip 후 10자이므로 허용되고 전송·표시 값은 공백이 제거된 "가나다라마바사아자차"다 | D-01, H5 | U | feed/posts-title-update__200.json | iOS:FeedFeatureTests L197 / AN:PostRepositoryImplTest(제목 trim) |
| TC-FEED-022 | Given 빈 입력 또는 공백만 / When 저장 / Then 요청 본문에 `title` 키를 포함해 `null`을 보내고(키 누락 금지) 성공 후 "무제"로 표시된다 | D-01, H1, H6 | C+U | feed/posts-title-update__200-null-title.json | iOS:FeedAPIClientTests L35, L68 / AN:PostRemoteDataSourceImplTest(제목 수정) |
| TC-FEED-023 | Given 제목 저장 / When `PUT /posts/{id}` / Then 메서드·경로·Authorization·JSON 본문이 계약과 같고 응답 `{postId, title}`의 title로 화면·목록 캐시·기록 캐시를 갱신한다 | POST-005, D1 | C+U | feed/posts-title-update__200.json | iOS:FeedAPIClientTests L35 / AN:PostRemoteDataSourceImplTest |
| TC-FEED-024 | Given 저장 성공 / When 완료 / Then 토스트 "제목을 수정했어요"가 1회 뜨고 다이얼로그가 닫히며 상세·전시·기록·홈에 새 제목이 반영된다 | D-23 | U+W | feed/posts-title-update__200.json | iOS:FeedFeatureTests L197 / AN:FeedViewModelTest |
| TC-FEED-025 | Given 저장 중 / When 저장 버튼 연타 / Then 버튼은 "저장 중..."으로 비활성화되고 PUT은 1회만 나간다 | D-14(연타) | U+W | feed/posts-title-update__200.json(지연) | AN:FeedViewModelTest |
| TC-FEED-026 | Given 상세 재조회가 진행 중 / When 그동안 제목을 수정해 성공 / Then 늦게 도착한 이전 상세 응답이 수정한 제목을 덮지 않는다 | D-04 | U | feed/posts-detail__mine-today.json(지연), feed/posts-title-update__200.json | iOS:FeedFeatureTests L259 / AN:FeedViewModelTest |
| TC-FEED-027 | Given 수정 요청 400 / When 응답(상태 변경·참여 기간 종료) / Then "수정할 수 없는 상태이거나 주제 참여 기간이 끝났어요"를 보여 주고 게시물 제목은 변경 전 값이며 `message` 문자열로 분기하지 않는다 | D-02, §5.2 | U | feed/posts-title-update__400-not-editable.json | AN:FeedViewModelTest(제목 수정 오류) |
| TC-FEED-028 | Given 서버 400 "제목은 10자 이하여야 합니다." (클라 우회) / When 응답 / Then 서버 message를 표시하고 입력은 유지된다 | §5.2, H3 | U | feed/posts-title-update__400-title-too-long.json | 신규 |
| TC-FEED-029 | Given 정지 회원 / When `PUT`이 403 "차단된 회원입니다." / Then "이용이 제한되어 제목을 수정할 수 없어요."를 보여 주고 같은 요청을 다시 보내지 않는다 | D-08, P11 | U | feed/posts-title-update__403-banned.json | 신규 |
| TC-FEED-030 | Given 수정 404 / When 응답 / Then "게시물을 찾을 수 없어요" 표시 후 상세를 닫고 목록을 갱신한다 | §5.2 | U | feed/posts-title-update__404-not-found.json | AN:FeedViewModelTest(404) |
| TC-FEED-031 | Given 수정 401 / When 응답 / Then refresh 후 1회 재전송하고 실패하면 "로그인이 필요해요"/로그인 화면이다 | D-17 | U | feed/posts-title-update__401-unauthorized.json | AN:FeedViewModelTest(401) |
| TC-FEED-032 | Given PUT이 500 또는 연결 실패 / When 응답 / Then 멱등이므로 0.5s·1s 백오프로 최대 2회 재시도하고 모두 실패하면 연결 실패는 "네트워크 연결을 확인해 주세요", 5xx는 "게시물 제목을 수정하지 못했어요"다 | D-21, §5.2 | U | feed/posts-title-update__500-server-error.json | AN:FeedViewModelTest(네트워크/기타) |
| TC-FEED-033 | Given 응답 유실 후 같은 제목으로 다시 저장 / When 재요청 / Then 200 멱등 응답을 정상 성공으로 처리한다 | D-07 | U | feed/posts-title-update__200.json | 신규 |
| TC-FEED-034 | Given 상세 / When 렌더 / Then 삭제 버튼은 내 게시물에만 보이고 남의 게시물에서는 어떤 삭제 요청도 보내지 않는다 | D-23, POST-010 | U+W | feed/posts-detail__mine-today.json, feed/posts-detail__other.json | iOS:FeedFeatureTests L130 / AN:FeedViewModelTest, FeedScreenTest |
| TC-FEED-035 | Given 삭제 버튼 / When 탭 / Then 확인창 "게시물 삭제" / "게시물을 삭제하시겠어요?" / "삭제"가 뜨고 취소하면 요청이 없다 | D-23 | W+U | - | iOS 2.5 문구 / AN:FeedScreenTest |
| TC-FEED-036 | Given 삭제 확인 / When `DELETE /posts/{id}`가 204 / Then 이전 화면으로 돌아가 전시·기록·홈에서 해당 게시물이 빠지고 토스트 "게시물을 삭제했어요"가 한 번 뜬다 | D-23, POST-010, LIKE-005 | U+E | feed/posts-delete__204.json | iOS:FeedFeatureTests L130 / AN:FeedViewModelTest |
| TC-FEED-037 | Given 이미 삭제된 게시물에 DELETE 반복 / When 204 / Then 성공과 같이 처리한다(멱등) | §4.1 | U | feed/posts-delete__204.json | 신규 |
| TC-FEED-038 | Given 삭제 진행 중 / When 연타 / Then DELETE는 1회만 나가고 완료 후 반복 탭은 무시된다 | D-14(연타) | U | feed/posts-delete__204.json(지연) | AN:FeedViewModelTest |
| TC-FEED-039 | Given 삭제 요청 400 / When VALIDATING·REJECTED 상태 등 / Then "삭제할 수 없는 상태의 게시물이에요"이고 게시물과 화면은 유지된다 | §4.1, D-23 | U | feed/posts-delete__400-validating.json, feed/posts-delete__400-rejected.json | AN:FeedViewModelTest(삭제 오류) |
| TC-FEED-040 | Given 삭제 403 / When 응답 / Then "본인이 작성한 게시물만 삭제할 수 있어요"이고 정지 회원도 삭제는 허용되므로 정지 문구가 아니다(D-02 호출 API로 구분) | D-08, D9 | U | feed/posts-delete__403-not-owner.json | AN:FeedViewModelTest |
| TC-FEED-041 | Given 삭제 404 / When 응답 / Then "게시물을 찾을 수 없어요" 후 목록에서 제거한다 | §5.2 | U | feed/posts-delete__404-not-found.json | AN:FeedViewModelTest |
| TC-FEED-042 | Given 삭제 401·연결 실패·기타 실패 / When 응답 / Then 각각 "로그인이 필요해요"(재인증), "네트워크 연결을 확인해 주세요", "게시물을 삭제하지 못했어요"이고 실패 후 다시 시도할 수 있다 | D-20 | U | feed/posts-delete__401-unauthorized.json, feed/posts-delete__500-server-error.json | iOS:FeedFeatureTests L166 / AN:FeedViewModelTest |
| TC-FEED-043 | Given 정지 회원 / When 삭제 / Then 정상 삭제된다(DELETE는 정지 허용) | §2.6, USER-002 | U | feed/posts-delete__204.json | 신규 |
| TC-FEED-044 | Given 삭제 성공 후 / When 이전 화면의 늦은 재검증 응답이 해당 게시물을 다시 포함 / Then 삭제한 postId는 기억되어 목록·기록 캐시에 되살아나지 않는다 | D-23, LIKE-005 | U | - | AN:RecordViewModelTest(삭제한 postId 기억) |
| TC-FEED-045 | Given 삭제 진행 중 화면 이탈 / When 응답 도착 / Then 결과는 반영되고 토스트는 화면이 보일 때만 뜬다 | D-20 | U | feed/posts-delete__204.json(지연) | 신규 |
| TC-FEED-046 | Given 두 손가락 핀치 / When 배율 계산 / Then 배율은 1x~4x로 clamp되고 손을 떼면 1x로 복귀한다(복귀 애니메이션 0.3초·0.7초 상수) | iOS 2.5 | U+W | - | AN:FeedPhotoZoomTest / iOS:FeedZoomRenderingTests L231 |
| TC-FEED-047 | Given 확대 상태 / When 두 손가락 팬 / Then 이동은 확대된 이미지 범위 안으로 제한된다 | - | U | - | AN:FeedPhotoZoomTest |
| TC-FEED-048 | Given 핀치 / When 확대 중심 / Then 손가락 아래 지점이 화면에서 움직이지 않는다 | - | U | - | iOS:FeedZoomRenderingTests L231 |
| TC-FEED-049 | Given 사진 비율 전환(정사각→세로→가로) / When 줌 전환 / Then 레이아웃 크기가 고정되고 크롭 경계가 연속적으로 이동하며 클립이 모서리를 유지한다 | - | S+U | - | iOS:FeedZoomRenderingTests L7, L196, L215, L287 / iOS:FeedFeatureTests L438 |
| TC-FEED-050 | Given 목록→상세 전환 / When 시작 셀이 사라지거나 등록이 누락되거나 그리드가 재배치 / Then 선택 순간의 전환 좌표와 가림 영역이 유지되고 클립이 사진 전체를 포함한다 | - | U | - | iOS:FeedFeatureTests L365, L380, L391, L404, L411, L422 / AN:PhotoTransitionTest, FittedPhotoCardShapeTest |
| TC-FEED-051 | Given iOS 뒤로 스와이프(수직 드래그) / When 가로 흔들림·느린 가로 드래그·손 뗄 때 세로 속도 / Then 가로 흔들림은 진행도를 바꾸지 않고, 느린 가로 이동은 반영하며, 세로 속도는 완료 거리 계산에 쓰지 않는다(edge 24, min 12, full 300, close 120). 다른 플랫폼은 시스템 뒤로 제스처를 쓰고 이 TC는 차이로 기록 | iOS 2.5 | U | - | iOS:FeedFeatureTests L8, L26, L39 |
| TC-FEED-052 | Given 뒤로 스와이프를 잡고 있는 동안 / When 렌더 / Then 사진·사인은 정지하고 헤더·바텀바 뒤에 위치하며 지오메트리는 컨테이너 원점과 무관하다 | iOS 2.5 | S | - | iOS:FeedZoomRenderingTests L35, L39, L244 |
| TC-FEED-053 | Given 짧은·긴·빈 제목 / When 제목 행 렌더 / Then 줄바꿈 없이 말줄임 또는 줄바꿈 규칙대로 보이고 빈 제목은 "무제"다 | D-01 | S+W | feed/posts-detail__no-title.json | iOS:FeedZoomRenderingTests L116 |
| TC-FEED-054 | Given 핀치 줌과 뒤로 스와이프를 실제 기기에서 사용 / When 반복 조작 / Then 손가락 추종·복귀 애니메이션·스크롤 충돌에 이질감이 없다 (AG-FEED-001) | strategy §1-3 | A | - | iOS:FeedZoomRenderingTests L231 |
| TC-FEED-055 | Given 개발 서버 실데이터와 본인 오늘 게시물(실행 시 받은 카카오 계정) / When 제목 수정·삭제 / Then 서버 응답이 계약과 같고 목록·기록·홈에 반영된다. 삭제는 슬롯을 비우지만 서버에 논리 삭제 기록이 남는다 (AG-FEED-002) | strategy §1-1, POST-010 | A | - | 신규 |
| TC-FEED-056 | Given 개발 서버 공개 API / When 토큰 없이 `GET /posts/<임의 UUID>` / Then 401이다(F11). 로그인 없이 확인 가능한 계약 드리프트 검사 | F11 | D | feed/posts-detail__401-unauthorized.json | 신규 |
| TC-FEED-057 | Given 사용자 A 로그아웃 후 B 로그인 / When 상세 화면이 열려 있던 기록 / Then 상세 상태·삭제 기억 postId·제목 수정 버튼 판정이 A 기준으로 남지 않는다 | D-17 | U | - | 신규 |
| TC-FEED-058 | Given 상세 화면 / When 요소 렌더 / Then testIDs.md의 피드 식별자(사진, 사인, 제목, 날짜 라벨, 좋아요, 수정, 삭제, 다시 시도)가 존재한다 | strategy §2 | W | - | AN:FeedScreenTest |

## LIKE 좋아요

좋아요 상태 전이는 화면과 무관한 공용 컨트롤러(Fake Repository + 가짜 시계)로 U 테스트를 쓰고, 화면별로는 W/E에서 연결만 확인한다.

| ID | 검증 내용 | 근거 | 구분 | fixture | 기존 |
| --- | --- | --- | --- | --- | --- |
| TC-LIKE-001 | Given 좋아요 등록 / When `PUT /posts/{id}/likes` / Then 본문 없이 Authorization을 붙여 보내고, 취소는 `DELETE`로 같은 경로를 쓴다 | LIKE-001, LIKE-003 | C | like/posts-likes-put__liked.json, like/posts-likes-delete__unliked.json | iOS:DisplayFeatureTests L1011, L1031 / AN:PostRemoteDataSourceImplTest(좋아요 PUT·DELETE) |
| TC-LIKE-002 | Given 응답 `{postId, likeCount, isLiked}` / When 파싱 / Then 값을 그대로 쓰고, postId가 요청과 다르거나 PUT 응답이 `isLiked=false`인 모순은 계약 위반으로 실패 처리(롤백)한다 | LIKE-004 | C+U | like/posts-likes-put__postid-mismatch.json, like/posts-likes-put__inconsistent-state.json | AN:PostRepositoryImplTest(좋아요 응답 검증) |
| TC-LIKE-003 | Given 전시 그리드 / When 하트 탭 / Then 서버 응답 전에 즉시 `isLiked=true`, `likeCount+1`로 바뀐다 | D-04 | U+W | like/posts-likes-put__liked.json(지연) | AN:DisplayViewModelTest(낙관적) [iOS 기존 서버 확정형은 D-04로 대체] |
| TC-LIKE-004 | Given 전시 추천(캐러셀) 카드 / When 하트 탭 / Then 즉시 낙관 반영되고 같은 사진의 그리드 카드와 값이 항상 같다 | D-04 | U | like/posts-likes-put__liked.json | iOS:DisplayFeatureTests L697 |
| TC-LIKE-005 | Given 홈 랭킹 카드 / When 하트 탭 / Then 즉시 낙관 반영된다(홈도 전시·피드와 같은 규칙) | D-04 | U+E | like/posts-likes-put__liked.json | iOS 홈 좋아요(서버 확정형) → D-04로 통일 |
| TC-LIKE-006 | Given 게시물 상세 / When 하트 탭 / Then 즉시 낙관 반영된다 | D-04 | U+W | like/posts-likes-put__liked.json | AN:FeedViewModelTest(낙관/롤백) |
| TC-LIKE-007 | Given 좋아요한 사진 / When 하트를 다시 탭 / Then 즉시 `isLiked=false`, `likeCount-1`이고 0 아래로 내려가지 않는다 | LIKE-003 | U | like/posts-likes-delete__unliked.json | AN:DisplayViewModelTest |
| TC-LIKE-008 | Given 낙관 반영 후 / When 성공 응답의 `likeCount`가 낙관 값과 다름(다른 사용자 동시 좋아요) / Then 서버 값 `likeCount`·`isLiked`로 덮어쓴다 | D-04, LIKE-004 | U | like/posts-likes-put__liked-count-differs.json | iOS:DisplayFeatureTests L697 / AN:DisplayViewModelTest |
| TC-LIKE-009 | Given 낙관 반영 후 / When 요청 실패(500·연결 실패) / Then 이전 상태로 되돌리고 토스트 "좋아요를 반영하지 못했어요"를 띄운다. 전시·홈·피드 모두 같다(Android 피드의 무음 롤백 금지) | D-04 | U | like/posts-likes-put__500-server-error.json | iOS:DisplayFeatureTests L727 / AN:DisplayViewModelTest, FeedViewModelTest |
| TC-LIKE-010 | Given 게시물이 삭제·비공개 / When 좋아요 PUT/DELETE가 404 "게시물을 찾을 수 없습니다." / Then 롤백 후 해당 게시물을 목록에서 빼고(상세면 닫고 목록 갱신) 토스트를 띄운다 | D-04, L5, LIKE-002 | U | like/posts-likes-put__404-not-found.json | 신규 |
| TC-LIKE-011 | Given 정지 회원 / When 좋아요 등록 403 "차단된 회원입니다." / Then 롤백하고 "이용이 제한되어 좋아요를 누를 수 없어요."를 띄우며 재요청하지 않는다 | D-08, L3, LIKE-001 | U | like/posts-likes-put__403-banned.json | 신규 |
| TC-LIKE-012 | Given 정지 회원 / When 이미 한 좋아요를 취소(DELETE) / Then 200으로 정상 취소된다 | L3, LIKE-001 | U | like/posts-likes-delete__unliked.json | 신규 |
| TC-LIKE-013 | Given 토큰 만료 / When 좋아요가 401 `UNAUTHORIZED` / Then single-flight refresh 후 같은 요청을 1회 재전송한다. 재인증 필요면 롤백 후 로그인 화면으로 간다 | D-17 | U | like/posts-likes-put__401-unauthorized.json → like/posts-likes-put__liked.json | AN:TokenAuthenticatorTest |
| TC-LIKE-014 | Given 게스트 / When 전시 그리드·캐러셀·홈 랭킹에서 하트 탭 / Then 상태 변화 없이 토스트 "좋아요를 누르려면 로그인이 필요해요"가 뜨고 네트워크 요청 0건이다 | D-05 | U+E | - | iOS:TodayFeatureTests L173(죽은 코드, 동작만 승계) / iOS 5.1-5 |
| TC-LIKE-015 | Given 한 사진에서 on·off·on 3회 연타(PUT 진행 중) / When 모두 처리 / Then 요청을 쌓지 않고 PUT 1회로 끝나며 최종 `isLiked=true`다 | D-04 | U | like/posts-likes-put__liked.json(지연) | iOS:DisplayFeatureTests L750 / AN:FeedViewModelTest(순서) |
| TC-LIKE-016 | Given on·off 2회 연타 / When PUT 응답 후 최종 의도(off)와 서버 상태(on)가 다름 / Then DELETE를 1회 더 보내 총 2회이며 최종 `isLiked=false`다 | D-04 | U | like/posts-likes-put__liked.json, like/posts-likes-delete__unliked.json | 신규 |
| TC-LIKE-017 | Given 임의 탭 순서(길이 1~9)와 지연이 있는 가짜 서버 / When 모두 처리 / Then 항상 동시 진행 요청 ≤1이고 최종 서버 상태가 마지막 의도와 같다(속성 테스트) | D-04 | U | - | AN:FeedViewModelTest(서버 쓰기 순서 TODO를 해결) |
| TC-LIKE-018 | Given PUT 진행 중 / When 같은 사진 하트를 또 탭 / Then 중복 요청이 나가지 않는다 | D-04 | U | like/posts-likes-put__liked.json(지연) | iOS:DisplayFeatureTests L750 |
| TC-LIKE-019 | Given 서로 다른 두 사진 / When 동시에 좋아요 / Then 각각 독립적으로 병렬 요청되고 서로의 상태·롤백에 영향이 없다 | D-04 | U | like/posts-likes-put__liked.json | 신규 |
| TC-LIKE-020 | Given PUT 진행 중 사용자가 다시 탭해 의도=off / When PUT이 실패 / Then 롤백 결과(미좋아요)가 이미 의도와 같으므로 추가 요청 없이 토스트만 띄운다 | D-04 | U | like/posts-likes-put__500-server-error.json | 신규 |
| TC-LIKE-021 | Given 좋아요 완료 후 / When 이전에 보낸 목록 재검증 응답이 늦게 도착 / Then 완료된 좋아요 상태를 덮어쓰지 않는다(revision 병합) | D-04 | U | display/posts-list__recent-page1.json(지연) | iOS:DisplayFeatureTests L781 / AN:DisplayViewModelTest(좋아요 revision 병합) |
| TC-LIKE-022 | Given 실패한 요청의 롤백이 늦게 도착 / When 그 사이 더 새로운 좋아요 동작이 있었음 / Then 오래된 롤백이 새 동작을 되돌리지 않는다(generation) | D-04 | U | like/posts-likes-put__500-server-error.json(지연) | AN:FeedViewModelTest(generation 카운터) |
| TC-LIKE-023 | Given 상세 로딩 중 / When 좋아요가 먼저 완료되고 상세 응답이 나중에 도착 / Then 상세 응답이 완료된 좋아요 값을 덮지 않는다 | D-04 | U | feed/posts-detail__mine-today.json(지연) | iOS:FeedFeatureTests L64 |
| TC-LIKE-024 | Given 상세 확정 전 전시 시드 / When 좋아요 탭 / Then 막히고(비활성) 확정 후에만 허용된다 | D-04 | U+W | feed/posts-detail__other.json(지연) | iOS:FeedFeatureTests L107 |
| TC-LIKE-025 | Given 피드에서 좋아요 / When 전시·홈 랭킹·기록으로 돌아감 / Then 같은 사진의 카드 값이 즉시 같은 값이다(화면 간 동기) | D-04 | E | like/posts-likes-put__liked.json | iOS:DisplayFeatureTests L697(featured+list 반영) |
| TC-LIKE-026 | Given PUT/DELETE가 500 두 번 후 200 / When 자동 재시도(0.5s, 1s) / Then 최종 성공이면 토스트 없이 서버 값이 반영되고, 세 번 모두 실패하면 롤백 + 토스트다 | D-21 | U | like/posts-likes-put__500-server-error.json ×2 → like/posts-likes-put__liked.json | 신규 |
| TC-LIKE-027 | Given 429/503에 `Retry-After` / When 재시도 / Then 지정 시간만큼 기다린 뒤 재시도한다 | D-21, Q-14 | U | like/posts-likes-put__429-retry-after.json | 신규 |
| TC-LIKE-028 | Given 오프라인 / When 좋아요 탭 / Then 낙관 반영 후 재시도 소진 시 롤백 + 토스트 "좋아요를 반영하지 못했어요"가 한 번 뜬다 | D-04, D-20 | U+E | like/posts-likes-put__network-failure(mock 연결 끊김) | 신규 |
| TC-LIKE-029 | Given 요청 진행 중 화면 이탈 / When 응답 도착 / Then 상태는 캐시에 반영되고 토스트는 화면이 보일 때만 뜬다 | D-20 | U | like/posts-likes-put__500-server-error.json(지연) | 신규 |
| TC-LIKE-030 | Given 서로 다른 두 사진이 연달아 실패 / When 같은 문구 토스트 두 번 / Then 두 번 모두 표시된다(메시지 고유 ID) | D-20 | U+W | like/posts-likes-put__500-server-error.json | AN:NotificationViewModelTest(토스트 id) 계열 |
| TC-LIKE-031 | Given 사용자 A의 좋아요 응답이 진행 중 / When 로그아웃·사용자 B 로그인 / Then A 응답은 무시되고 B 화면의 `isLiked`는 서버 값으로만 채워진다 | D-17 | U | - | 신규 |
| TC-LIKE-032 | Given 내 게시물 / When 좋아요 / Then 정상 등록된다(작성자 본인도 허용) | L4, LIKE-002 | U | like/posts-likes-put__liked.json | 신규 |
| TC-LIKE-033 | Given 서버에 이미 좋아요한 글 / When PUT / Then `likeCount`가 늘지 않은 멱등 응답을 정상 성공으로 처리한다. 좋아요 없는 글 DELETE도 `isLiked=false`로 정상이다 | L1, L2, LIKE-003 | C+U | like/posts-likes-put__already-liked.json, like/posts-likes-delete__not-liked.json | 신규 |
| TC-LIKE-034 | Given 하트 버튼 / When 렌더 / Then 접근성 라벨이 "좋아요 N개"와 선택 상태를 읽고 testID `like-button-<postId>`가 있다 | strategy §2 | W | - | AN:DisplayPhotoCardTest(좋아요 영역) |
| TC-LIKE-035 | Given 개발 서버 실계정(실행 시 받은 카카오 계정) / When 사진에 좋아요를 연타 후 서버 상태를 조회 / Then 앱 최종 상태와 서버(`GET /posts/{id}`의 `isLiked`·`likeCount`)가 일치한다. 좋아요는 취소로 되돌릴 수 있다 (AG-LIKE-001) | strategy §1-1, D-04 | A | - | 신규 |

## 구현 시 확인할 쟁점

1. 자정 이후 전시 탭 동작(상한만 갱신, 보던 날짜 유지)은 D-12·D-19에서 직접 정하지 않아 임시 처리했다(TC-DISP-040).
2. `GET /posts/{id}` 응답에 `isMine`이 없다(api-contract §1.3). legacy-android §2.7은 `isMine`을 적었으므로 구현 전에 서버 OpenAPI 스냅샷으로 확인하고, 없으면 `authorId`와 로그인 userId 비교를 쓴다(TC-FEED-004).
3. 전시 최초 로드 404 문구는 기존 두 앱이 다르다(iOS "이 날의 전시가 아직 없어요", Android "이 날 올라온 사진이 없어요"). 위 표는 Android 문구를 쓰고 `shared/copy/ko.json` 키를 따른다.
4. 좋아요 개수 표기 형식(천 단위, 축약)은 규칙·legacy에 없다. 정해지면 LIKE에 W 항목을 추가한다.
5. iOS 뒤로 스와이프·공유 전환 애니메이션은 iOS 관례다. 다른 플랫폼은 패리티 매트릭스에 `차이`로 기록한다(TC-FEED-050~052).
6. iOS `Today*`, Android `feature/today/*` 테스트는 죽은 코드라 흡수하지 않았다. 다만 Today의 "게스트 좋아요 안내"(iOS TodayFeatureTests L173)와 "취소된 새로고침은 오류 토스트를 띄우지 않음"(L246)은 D-05·D-20과 같은 동작이라 해당 TC에 반영했다.

## 필요 fixture 목록

파일은 `shared/fixtures/` 아래 상대 경로다. 표의 HTTP는 mock 서버가 돌려줄 상태 코드이고, 오류 fixture의 본문은 `{errorCode, message}`다.

| 파일명 | 메서드 경로 | HTTP | 내용 요지 |
| --- | --- | --- | --- |
| display/topics__open-2026-10-27.json | GET /topics?date=2026-10-27 | 200 | phase=OPEN, topicDate=2026-10-27, startsAt 2026-10-26T15:00:00Z |
| display/topics__open-2026-10-26.json | GET /topics?date=2026-10-26 | 200 | 과거 주제 phase=CLOSED |
| display/topics__first-date-2026-09-17.json | GET /topics?date=2026-09-17 | 200 | 최초 전시일 주제 |
| display/topics__before-open.json | GET /topics?date=… | 200 | phase=BEFORE_OPEN |
| display/topics__404-not-found.json | GET /topics?date=… | 404 | BUSINESS_ERROR "주제를 찾을 수 없습니다." |
| display/topics__500-server-error.json | GET /topics | 500 | INTERNAL_ERROR |
| display/posts-list__recent-page1.json | GET /posts?sort=recent&page=1&pageSize=20 | 200 | 20개, hasNext=true, 사진 4종 URL, isMine 혼합 |
| display/posts-list__recent-page2.json | GET /posts?sort=recent&page=2 | 200 | 7개, hasNext=false |
| display/posts-list__recent-page2-overlap.json | GET /posts?sort=recent&page=2 | 200 | page1과 ID 1개 중복 |
| display/posts-list__popular-page1.json | GET /posts?sort=popular&page=1 | 200 | 좋아요 내림차순 20개 |
| display/posts-list__popular-3.json | GET /posts?sort=popular | 200 | 3개(아카이브 5개 미만) |
| display/posts-list__random-page1-seed.json | GET /posts?sort=random&page=1 | 200 | randomSeed="seed_abc123", hasNext=true |
| display/posts-list__random-page2.json | GET /posts?sort=random&page=2&randomSeed=seed_abc123 | 200 | 같은 seed 2페이지 |
| display/posts-list__random-page2-overlap.json | GET /posts?sort=random&page=2&randomSeed=… | 200 | page1과 ID 중복 포함 |
| display/posts-list__random-no-seed.json | GET /posts?sort=random&page=1 | 200 | randomSeed=null, hasNext=true(비정상 응답) |
| display/posts-list__guest-page1.json | GET /posts (비로그인) | 200 | isLiked=false, isMine=false |
| display/posts-list__mixed-ratio.json | GET /posts | 200 | 원본 비율이 다른 사진 8개(1:1, 3:4, 4:3, 9:16) |
| display/posts-list__page99-empty.json | GET /posts?page=99 | 200 | posts=[], hasNext=false, currentPage=99 |
| display/posts-list__404-topic-not-found.json | GET /posts | 404 | BUSINESS_ERROR "해당 날짜의 주제를 찾을 수 없습니다." |
| display/posts-list__400-future-date.json | GET /posts | 400 | BUSINESS_ERROR "미래 날짜의 게시물은 조회할 수 없습니다." |
| display/posts-list__400-bad-query.json | GET /posts | 400 | BUSINESS_ERROR "조회 조건이 올바르지 않습니다." |
| display/posts-list__401-unauthorized.json | GET /posts | 401 | UNAUTHORIZED |
| display/posts-list__500-server-error.json | GET /posts | 500 | INTERNAL_ERROR |
| display/posts-list__503-retry-after.json | GET /posts | 503 | Retry-After: 1 헤더 포함 |
| feed/posts-detail__mine-today.json | GET /posts/{id} | 200 | authorId=사용자 A, topicDate=2026-10-27, 제목 "비 오는 날" |
| feed/posts-detail__mine-past.json | GET /posts/{id} | 200 | authorId=사용자 A, topicDate=2026-10-20 |
| feed/posts-detail__other.json | GET /posts/{id} | 200 | authorId=사용자 B |
| feed/posts-detail__no-title.json | GET /posts/{id} | 200 | title=null |
| feed/posts-detail__null-thumbnail.json | GET /posts/{id} | 200 | thumbnailImageUrl=null |
| feed/posts-detail__invalid-schema.json | GET /posts/{id} | 200 | likeCount가 문자열, topic 누락 |
| feed/posts-detail__404-not-found.json | GET /posts/{id} | 404 | BUSINESS_ERROR "게시물을 찾을 수 없습니다." |
| feed/posts-detail__400-invalid-id.json | GET /posts/{id} | 400 | BUSINESS_ERROR "ID 형식이 올바르지 않습니다." |
| feed/posts-detail__401-unauthorized.json | GET /posts/{id} | 401 | UNAUTHORIZED |
| feed/posts-detail__500-server-error.json | GET /posts/{id} | 500 | INTERNAL_ERROR |
| feed/posts-title-update__200.json | PUT /posts/{id} | 200 | {postId, title:"가나다라마바사아자차"} |
| feed/posts-title-update__200-null-title.json | PUT /posts/{id} | 200 | {postId, title:null} |
| feed/posts-title-update__400-not-editable.json | PUT /posts/{id} | 400 | BUSINESS_ERROR "현재 상태의 게시물은 수정할 수 없습니다." (참여 기간 종료 문구 변형 포함) |
| feed/posts-title-update__400-title-too-long.json | PUT /posts/{id} | 400 | BUSINESS_ERROR "제목은 10자 이하여야 합니다." |
| feed/posts-title-update__403-banned.json | PUT /posts/{id} | 403 | FORBIDDEN "차단된 회원입니다." |
| feed/posts-title-update__404-not-found.json | PUT /posts/{id} | 404 | BUSINESS_ERROR "게시물을 찾을 수 없습니다." |
| feed/posts-title-update__401-unauthorized.json | PUT /posts/{id} | 401 | UNAUTHORIZED |
| feed/posts-title-update__500-server-error.json | PUT /posts/{id} | 500 | INTERNAL_ERROR |
| feed/posts-delete__204.json | DELETE /posts/{id} | 204 | 본문 없음 |
| feed/posts-delete__400-validating.json | DELETE /posts/{id} | 400 | BUSINESS_ERROR "이미지 처리 중인 게시물은 삭제할 수 없습니다." |
| feed/posts-delete__400-rejected.json | DELETE /posts/{id} | 400 | BUSINESS_ERROR "검수 거절된 게시물은 삭제할 수 없습니다." |
| feed/posts-delete__403-not-owner.json | DELETE /posts/{id} | 403 | FORBIDDEN "본인의 게시물만 접근할 수 있습니다." |
| feed/posts-delete__404-not-found.json | DELETE /posts/{id} | 404 | BUSINESS_ERROR "게시물을 찾을 수 없습니다." |
| feed/posts-delete__401-unauthorized.json | DELETE /posts/{id} | 401 | UNAUTHORIZED |
| feed/posts-delete__500-server-error.json | DELETE /posts/{id} | 500 | INTERNAL_ERROR |
| like/posts-likes-put__liked.json | PUT /posts/{id}/likes | 200 | {postId, likeCount:11, isLiked:true} |
| like/posts-likes-put__liked-count-differs.json | PUT /posts/{id}/likes | 200 | 낙관 값(+1)과 다른 likeCount(+3) |
| like/posts-likes-put__already-liked.json | PUT /posts/{id}/likes | 200 | 이미 좋아요: likeCount 변화 없음, isLiked:true |
| like/posts-likes-put__postid-mismatch.json | PUT /posts/{id}/likes | 200 | 요청과 다른 postId |
| like/posts-likes-put__inconsistent-state.json | PUT /posts/{id}/likes | 200 | isLiked:false(PUT인데) |
| like/posts-likes-put__404-not-found.json | PUT /posts/{id}/likes | 404 | BUSINESS_ERROR "게시물을 찾을 수 없습니다." |
| like/posts-likes-put__403-banned.json | PUT /posts/{id}/likes | 403 | FORBIDDEN "차단된 회원입니다." |
| like/posts-likes-put__401-unauthorized.json | PUT /posts/{id}/likes | 401 | UNAUTHORIZED |
| like/posts-likes-put__500-server-error.json | PUT /posts/{id}/likes | 500 | INTERNAL_ERROR |
| like/posts-likes-put__429-retry-after.json | PUT /posts/{id}/likes | 429 | Retry-After: 1 헤더 포함 |
| like/posts-likes-delete__unliked.json | DELETE /posts/{id}/likes | 200 | {postId, likeCount:10, isLiked:false} |
| like/posts-likes-delete__not-liked.json | DELETE /posts/{id}/likes | 200 | 좋아요 안 한 글 취소: 멱등 |
