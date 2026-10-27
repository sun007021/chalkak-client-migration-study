# 테스트 카탈로그: 기록 캘린더(REC)

기록 탭(월별 캘린더, 월 이동, 월 선택, 사진 패널, 달력 이미지 저장)의 동작을 다섯 클라이언트가 같게 만드는 테스트 목록이다. 달력은 본인의 `PENDING`·`APPROVED` 게시물을 주제 날짜 기준으로 월에 배치하고(POST-009, C3), 현재 달은 화면에 들어올 때마다 KST 기준으로 다시 계산하며 월 목록에 없어도 선택지에 넣는다(D-19). 응답 검증(월 일치, 날짜 범위, 날짜 중복 없음, 썸네일 비어 있지 않음), 월별 캐시, 재검증, 삭제한 게시물 기억, 늦은 응답 폐기, 취소, 계정 전환, 오프라인, 가짜 시계(월말 KST 23:59:59/자정, 연말)를 포함한다. 기존 iOS `RecordFeatureTests`와 Android `RecordViewModelTest`·`RecordMonthPickerSheetTest`·`RecordScreenTest`·`PostRepositoryImplTest`(캘린더)의 검증을 흡수했다(Android는 파일 단위 출처). 기준일은 오늘 KST = 2026-10-27(화)이고 fixture 열은 `shared/fixtures/` 기준 상대 경로다. A는 달력 이미지 저장의 OS 권한·갤러리 확인과 실데이터 시각 확인 2건뿐이다.

## REC 기록 캘린더

| ID | 검증 내용 | 근거 | 구분 | fixture | 기존 |
| --- | --- | --- | --- | --- | --- |
| TC-REC-001 | Given 로그인 상태 / When 기록 탭 진입 / Then `GET /posts/calendar/months`와 `GET /posts/calendar?year=2026&month=10`(KST 현재 달)을 호출하고 Loading → Content로 바뀐다 | POST-009, D-19 | U+C | record/posts-calendar-months__recent-first.json, record/posts-calendar__2026-10.json | iOS:RecordFeatureTests L8 / AN:RecordViewModelTest |
| TC-REC-002 | Given 월 목록 응답이 `[{2026,10},{2026,9}]` / When 선택지 구성 / Then 최신순·중복 없음으로 쓰고, 응답이 비어(`[]`) 있어도 오류 없이 현재 달만 선택지에 있다 | C5, C6, POST-009 | C+U | record/posts-calendar-months__recent-first.json, record/posts-calendar-months__empty.json | AN:RecordViewModelTest / PostRepositoryImplTest(캘린더 정렬) |
| TC-REC-003 | Given 월 목록에 현재 달(2026-10)이 없음 / When 선택지 구성 / Then 현재 달이 선택지에 포함된다(서버는 임의 추가하지 않지만 클라이언트는 포함) | D-19, C5 | U | record/posts-calendar-months__without-current.json | iOS:RecordFeatureTests L63 / AN 2.10 |
| TC-REC-004 | Given 월 목록에 없는 기록 없는 달(예: 2026-08) / When 월 선택 휠에서 선택·이동 / Then 이동할 수 있고 빈 달로 표시되며 월 목록은 이동을 제한하지 않는다 | POST-009 | U+W | record/posts-calendar__2026-08-empty.json | AN:RecordViewModelTest(기록 없는 달 이동) / iOS:RecordFeatureTests L86 |
| TC-REC-005 | Given 가짜 시계 2026-10-31T14:59:59Z(KST 23:59:59) / When 현재 달 계산 / Then 2026-10이고 15:00:00Z(KST 11/01 00:00:00)에는 2026-11이다. 기기 시간대가 UTC·America/Los_Angeles여도 같다 | D-19, TOPIC-002 | U | - | AN 5.2-2(INITIAL_RECORD_MONTH 버그를 D-19로 수정) |
| TC-REC-006 | Given 가짜 시계 2026-12-31T14:59:59Z / When 현재 달 계산 / Then 2026-12이고 15:00:00Z에는 2027-01이다(연말 경계) | D-19 | U | - | 신규 |
| TC-REC-007 | Given 앱 프로세스를 유지한 채 월이 바뀜(10/31 → 11/1) / When 기록 탭에 다시 들어오거나 포그라운드로 복귀 / Then 현재 달을 다시 계산해 2026-11이 "현재 달"이 되고 이전 달이 고정되지 않는다 | D-19 | U | record/posts-calendar__2026-11-empty.json | AN 5.2-2 |
| TC-REC-008 | Given 주제 날짜가 2026-10-31이고 승인·제출이 11월 / When 달력 렌더 / Then 10월 31일 칸에 표시되고 11월에는 나타나지 않는다(제출·승인 시각이 아닌 주제 날짜 문자열 기준, 시간대 변환 없음) | C3, POST-009 | U | record/posts-calendar__2026-10.json | AN:PostRepositoryImplTest(캘린더) |
| TC-REC-009 | Given 달력 그리드 / When 렌더 / Then 일요일 시작 7열이고 요일 헤더는 "일월화수목금토"이며 오늘(KST)은 강조된다 | POST-009 | W | record/posts-calendar__2026-10.json | AN:RecordScreenTest(달력) |
| TC-REC-010 | Given 2026-02(일 시작·28일), 2026-10(목 시작·31일), 2026-05(금 시작·31일), 2026-11(일 시작·30일), 2027-01(금 시작·31일), 윤년 2028-02(화 시작·29일) / When 그리드 계산 / Then 행 수가 4, 5, 6, 5, 6, 5이고 첫 날 오프셋이 0, 4, 5, 0, 5, 2이며 마지막 날이 정확하다 | POST-009 | U | - | AN:RecordViewModelTest(달력 계산) |
| TC-REC-011 | Given 달력 응답 / When 칸 렌더 / Then APPROVED는 썸네일, PENDING은 썸네일 + "사진 반영 중" 배지, 기록 없는 날은 빈 칸이며 REJECTED·VALIDATING은 서버가 주지 않는다(C1) | C1, POST-009 | U+W | record/posts-calendar__2026-10.json | iOS 2.7 / AN:RecordScreenTest(PENDING 상태) |
| TC-REC-012 | Given 응답 `month`가 요청과 다름 / When 검증 / Then InvalidResponse로 "기록을 불러오지 못했어요" + 다시 시도다 | POST-009 | C+U | record/posts-calendar__month-mismatch.json | iOS 2.7 / AN:PostRepositoryImplTest(월 불일치) |
| TC-REC-013 | Given 날짜가 해당 월 밖이거나 같은 날짜가 중복이거나 썸네일 URL이 빈 문자열 / When 검증 / Then InvalidResponse로 처리하고 앱은 깨지지 않는다 | POST-009 | C+U | record/posts-calendar__date-out-of-month.json, record/posts-calendar__duplicate-date.json, record/posts-calendar__empty-thumbnail.json | iOS 2.7(응답 검증) |
| TC-REC-014 | Given 응답 `status`가 REJECTED 또는 알 수 없는 값 / When 파싱 / Then 앱은 깨지지 않고 해당 날짜는 사진 패널이 없는 날로 다룬다(쟁점 1) | C1, §8.1 | C+U | record/posts-calendar__unknown-status.json | iOS 2.7(상태 unknown) / AN 2.10(UNKNOWN) |
| TC-REC-015 | Given 응답 배열이 날짜 오름차순이 아님 / When 달력 구성 / Then 응답 순서와 무관하게 날짜 칸에 정확히 배치된다 | POST-009 | U | record/posts-calendar__2026-10-shuffled.json | AN:PostRepositoryImplTest(캘린더 정렬) |
| TC-REC-016 | Given 달력 / When 이전·다음 달 화살표 / Then 해당 월 `GET /posts/calendar`를 요청하고(처음 가는 달은 기존 기록을 비우고 로딩) 기록 없는 달로도 이동할 수 있다 | POST-009 | U | record/posts-calendar__2026-09.json | iOS:RecordFeatureTests L356 / AN:RecordViewModelTest |
| TC-REC-017 | Given 월 목록에 없는 달 또는 이미 불러온 현재 달 / When 그 달로 이동·재선택 / Then 불필요한 `calendar` 재요청을 보내지 않는다(기록 없는 달은 빈 달로 표시) | POST-009 | U | record/posts-calendar-months__recent-first.json | iOS:RecordFeatureTests L86 |
| TC-REC-018 | Given 2026-10에서 연도를 바꿈 / When 선택 / Then 그 해에 기록이 있는 달 중 가장 가까운 달이 선택되고(예: 2025에 12월·3월 기록이면 12월) 첫 해·마지막 해 범위를 벗어나지 않는다 | POST-009 | U | record/posts-calendar-months__multi-year.json | iOS:RecordFeatureTests L111 / AN:RecordMonthPickerSheetTest |
| TC-REC-019 | Given 월 이동 버튼 연타 / When 연달아 응답 / Then 마지막 선택 달만 표시되고 늦게 도착한 다른 달 응답이 화면을 덮지 않는다 | D-04 | U | record/posts-calendar__2026-09.json(지연), record/posts-calendar__2026-10.json | AN:RecordViewModelTest(늦은 응답) |
| TC-REC-020 | Given 이전에 본 달 / When 돌아옴 / Then 응답 전에도 캐시한 기록을 보여 주고 최신 값으로 교체한다 | D-20 | U | record/posts-calendar__2026-09.json | iOS:RecordFeatureTests L304 / AN:RecordViewModelTest |
| TC-REC-021 | Given 캐시된 달의 재조회가 실패 / When 응답 / Then 캐시를 유지하고 토스트를 띄운다. 처음 가는 달의 실패는 오류 + 다시 시도이며, 현재 달 실패는 이전 달 내용이 남지 않는다 | D-20 | U | record/posts-calendar__500-server-error.json | iOS:RecordFeatureTests L333 / AN:RecordViewModelTest(캐시 월 실패, 현재 월 실패) |
| TC-REC-022 | Given 기록 탭 재선택·복귀 / When 재검증 / Then 기존 기록을 유지하다 성공한 최신 값으로 교체하고, 실패하면 기존 기록을 유지한다 | D-20 | U | record/posts-calendar__2026-10.json, record/posts-calendar__500-server-error.json | iOS:RecordFeatureTests L8, L40 / AN:RecordViewModelTest(재검증) |
| TC-REC-023 | Given 사용자가 날짜를 선택해 둠 / When 캐시를 보여 주다 최신 값으로 교체되거나 재검증 / Then 선택 날짜가 유지된다 | D-20 | U | record/posts-calendar__2026-10.json | iOS:RecordFeatureTests L407 / AN:RecordViewModelTest(요청한 날짜 선택 유지) |
| TC-REC-024 | Given 게시물을 삭제하고 기록으로 복귀 / When 캐시된 달 재방문 또는 늦은 재검증 응답이 그 postId를 포함 / Then 삭제한 게시물은 다시 보이지 않고(삭제한 postId 기억) 현재 달의 마지막 게시물을 지워도 현재 달은 선택지에 남는다 | D-23, LIKE-005 | U+E | record/posts-calendar__2026-10-after-delete.json | iOS:RecordFeatureTests L124, L383 / AN:RecordViewModelTest(삭제한 postId 기억) |
| TC-REC-025 | Given 홈 주간 기록에서 이전 달 날짜를 선택해 기록으로 이동 / When 열림 / Then 그 달과 날짜가 선택되고 최신 사진보다 우선하며 재검증에도 유지된다. 본 적 있는 달이면 응답 전에도 캐시에서 해당 날짜 사진을 보여 주고 로딩 중이면 같은 요청을 다시 보내지 않는다 | POST-009 | U+E | record/posts-calendar__2026-09.json | iOS:RecordFeatureTests L146, L229, L252, L279 |
| TC-REC-026 | Given 홈에서 선택한 날짜의 게시물이 삭제됨 / When 기록 열림 / Then 다른 날짜의 사진을 대신 열지 않는다. 주간 기록 조회 실패 후 재시도해도 요청한 날짜를 선택한다 | D-23 | U | record/posts-calendar__2026-10-after-delete.json | iOS:RecordFeatureTests L168, L181 |
| TC-REC-027 | Given 화면을 벗어나 첫 조회가 취소됨 / When 결과 / Then 오류가 아니라 로딩 상태로 남고 화면이 다시 나타나면 불러온다 | D-20 | U | record/posts-calendar__2026-10.json(지연) | iOS:RecordFeatureTests L200 / AN:RecordViewModelTest |
| TC-REC-028 | Given 사용자 A 로그아웃 후 사용자 B 로그인 / When 기록 탭 / Then A의 월별 캐시·삭제 기억·선택 날짜가 지워지고 A 요청의 늦은 응답은 무시된다 | D-17 | U | - | 신규 |
| TC-REC-029 | Given 오프라인 / When 첫 진입 → 온라인 복귀 후 다시 시도 / Then 오류 + 다시 시도 후 성공 로드되고, 캐시가 있을 때는 유지 + 토스트 "네트워크 연결을 확인해 주세요."다 | D-20 | U+E | record/posts-calendar__2026-10.json | 신규 |
| TC-REC-030 | Given 토큰 만료 / When `GET /posts/calendar`가 401 `UNAUTHORIZED` / Then refresh 후 1회 재전송, `REAUTHENTICATION_REQUIRED`면 로그인 화면이다. 인증 불가 상태에서 직접 진입하면 "로그인이 필요해요" + "로그인 하기"다 | D-17, F12 | U+W | record/posts-calendar__401-unauthorized.json | AN 2.10(401) / iOS 2.7 |
| TC-REC-031 | Given 쿼리 생성 / When 월 이동 / Then `year`는 1~9999, `month`는 1~12 범위의 값만 보내고 서버 400 "조회 연월이 올바르지 않습니다."가 와도 "조회할 수 없는 연월이에요"로 처리한다 | C2, §5.2 | C+U | record/posts-calendar__400-invalid-month.json | iOS 2.7 / AN 2.10(400) |
| TC-REC-032 | Given 서버 오류 / When `GET /posts/calendar` 500 / Then "기록을 불러오지 못했어요" + "다시 시도"다 | D-20 | U+W | record/posts-calendar__500-server-error.json | AN 2.10 / iOS 2.7 |
| TC-REC-033 | Given 게스트 / When 기록 탭 탭 / Then 토스트 "기록을 보려면 로그인이 필요해요"이고 네트워크 요청이 0건이며 탭이 바뀌지 않는다 | D-05 | U+E | - | AN:RecordScreenTest(미인증) / iOS 1.3 |
| TC-REC-034 | Given 기록 있는 날짜 선택 / When APPROVED 사진 패널 / Then "피드에서 보기"는 게시물 상세(내 게시물)로, "전시 보러가기"는 해당 주제 날짜의 전시로 이동하고 뒤로 가면 기록으로 복귀한다 | POST-009, D-12 | W+E | record/posts-calendar__2026-10.json, feed/posts-detail__mine-today.json | AN:RecordScreenTest(피드·전시 열기), ChalkakNavHostTest(기록에서 전시 복귀) |
| TC-REC-035 | Given PENDING 날짜 선택 / When 패널 렌더 / Then 배지 "사진 반영 중"과 안내 "사진을 반영하고 있어요. 표시되기까지 조금 시간이 걸릴 수도 있어요!"가 보이고 액션 버튼은 숨겨지며 상세 API는 호출하지 않는다 | POST-007, F14 | U+W | record/posts-calendar__2026-10.json | AN:RecordScreenTest(PENDING 상태) / iOS 2.7 |
| TC-REC-036 | Given 처음 진입 / When 선택 날짜 결정 / Then 사용자가 정하지 않았다면 가장 최근 기록 날짜가 선택된다 | POST-009 | U | record/posts-calendar__2026-10.json | iOS:RecordFeatureTests L146(최신 사진보다 우선 선택) |
| TC-REC-037 | Given 기록 없는 날짜 선택 / When 렌더 / Then 사진 패널이 없고 오류가 아니다 | POST-009 | W | record/posts-calendar__2026-10.json | 신규 |
| TC-REC-038 | Given "이미지로 저장" / When 탭 / Then 현재 달 달력을 PNG로 렌더해(시그니처 `89 50 4E 47`, 가로세로 > 0) `chalkak-calendar-2026-10.png` 이름으로 저장하고 토스트 "달력을 이미지로 저장했어요"가 한 번 뜬다 | POST-009, D-14(저장) | U | record/posts-calendar__2026-10.json | AN:RecordViewModelTest(저장 권한 토스트) [실제 MediaStore 쓰기는 미테스트] |
| TC-REC-039 | Given 저장 권한 거부 또는 쓰기 실패 / When 저장 / Then 각각 "이미지 저장 권한이 필요해요", "이미지 저장에 실패했어요"이고 앱이 멈추지 않는다 (OS 권한 다이얼로그는 AG-REC-001) | D-20 | U | - | AN:RecordViewModelTest / iOS 2.7(RecordCalendarImageSaver 미테스트) |
| TC-REC-040 | Given 저장 진행 중 / When 저장 버튼 연타 / Then 저장은 1회만 실행된다 | D-14(연타) | U | - | 신규 |
| TC-REC-041 | Given 월별 레이아웃(4주, 5주, 6주, PENDING 배지, 빈 달, 오류) / When 렌더 / Then 플랫폼 내 스크린샷 기준선과 같다 | POST-009 | S | record/posts-calendar__*.json | AN:RecordScreenTest |
| TC-REC-042 | Given 기록 화면 / When 요소 렌더 / Then testIDs.md의 기록 식별자(이전·다음 달, 월 선택, 날짜 칸, 사진 패널, 이미지로 저장, 다시 시도)가 존재하고 `screen_view` `record`가 1회 전송된다 | strategy §2, D-22 | W+U | - | AN:RecordScreenTest |
| TC-REC-043 | Given 새 게시물을 업로드해 PENDING이 됨 / When 기록 탭으로 이동 / Then 탭 재검증으로 오늘 칸에 새 사진이 나타난다 | POST-009, POST-006 | E | record/posts-calendar__2026-10.json | 신규 |
| TC-REC-044 | Given 실제 기기와 개발 서버 계정(실행 시 받은 카카오 계정) / When "이미지로 저장" → OS 권한 다이얼로그 → 갤러리 확인 / Then 저장된 PNG에 월·요일·썸네일이 깨짐 없이 담긴다 (AG-REC-001) | strategy §1-2·3 | A | - | iOS 2.7(RecordCalendarImageSaver 미테스트) |
| TC-REC-045 | Given 개발 서버 실데이터 / When 기록 화면에서 월 이동·날짜 선택·"사진 반영 중" 배지를 확인 / Then 썸네일 비율·레이아웃·배지가 자연스럽다 (AG-REC-002) | strategy §1-3 | A | - | iOS:HomeScreenUITests L69(홈 연계) |

## 구현 시 확인할 쟁점

1. 달력 응답의 `REJECTED`·알 수 없는 status 처리는 서버가 주지 않는 값이라 규칙이 없다. 이 카탈로그는 "깨지지 않고 사진 패널이 없는 날"로 임시 처리했다(TC-REC-014).
2. 미래 달(오늘 이후 달)로 이동할 수 있는지는 규칙이 없다(POST-009는 빈 달 선택을 제한하지 않는다). 정해지면 TC를 추가한다.
3. Android API 28 이하의 `WRITE_EXTERNAL_STORAGE` 권한 요청과 iOS 사진 추가 권한 흐름은 플랫폼 전용이라 권한 거부 동작의 단위 검증은 TC-REC-039에 두고 실제 OS 권한 다이얼로그는 A(AG-REC-001)로 둔다.
4. 달력 이미지의 렌더링 방식(Web은 canvas, 모바일은 비트맵)은 달라도 되지만 파일명 규칙 `chalkak-calendar-{yyyy-MM}.png`와 PNG 형식은 같게 한다.

## 필요 fixture 목록

파일은 `shared/fixtures/` 아래 상대 경로다. 표의 HTTP는 mock 서버가 돌려줄 상태 코드이고, 오류 fixture의 본문은 `{errorCode, message}`다.

| 파일명 | 메서드 경로 | HTTP | 내용 요지 |
| --- | --- | --- | --- |
| record/posts-calendar-months__recent-first.json | GET /posts/calendar/months | 200 | months [{2026,10},{2026,9}] 최신순 |
| record/posts-calendar-months__empty.json | GET /posts/calendar/months | 200 | months=[] |
| record/posts-calendar-months__without-current.json | GET /posts/calendar/months | 200 | months [{2026,9}] (현재 달 없음) |
| record/posts-calendar-months__multi-year.json | GET /posts/calendar/months | 200 | 2026-10, 2026-09, 2025-12, 2025-03 |
| record/posts-calendar__2026-10.json | GET /posts/calendar?year=2026&month=10 | 200 | 10/20 APPROVED, 10/27 PENDING, 10/31 APPROVED (주제 날짜 기준) |
| record/posts-calendar__2026-10-shuffled.json | GET /posts/calendar?year=2026&month=10 | 200 | 같은 데이터를 날짜 내림차순·무작위 순서로 |
| record/posts-calendar__2026-10-after-delete.json | GET /posts/calendar?year=2026&month=10 | 200 | 삭제한 게시물이 빠진 응답 |
| record/posts-calendar__2026-09.json | GET /posts/calendar?year=2026&month=9 | 200 | 9/17 APPROVED, 9/30 APPROVED |
| record/posts-calendar__2026-08-empty.json | GET /posts/calendar?year=2026&month=8 | 200 | posts=[] |
| record/posts-calendar__2026-11-empty.json | GET /posts/calendar?year=2026&month=11 | 200 | posts=[] |
| record/posts-calendar__month-mismatch.json | GET /posts/calendar?year=2026&month=10 | 200 | 응답 month=9 (요청과 불일치) |
| record/posts-calendar__date-out-of-month.json | GET /posts/calendar?year=2026&month=10 | 200 | topicDate=2026-11-02 포함 |
| record/posts-calendar__duplicate-date.json | GET /posts/calendar?year=2026&month=10 | 200 | 같은 topicDate 2건 |
| record/posts-calendar__empty-thumbnail.json | GET /posts/calendar?year=2026&month=10 | 200 | thumbnailImageUrl="" |
| record/posts-calendar__unknown-status.json | GET /posts/calendar?year=2026&month=10 | 200 | status="REJECTED" 및 "SOMETHING_NEW" |
| record/posts-calendar__400-invalid-month.json | GET /posts/calendar | 400 | BUSINESS_ERROR "조회 연월이 올바르지 않습니다." |
| record/posts-calendar__401-unauthorized.json | GET /posts/calendar | 401 | UNAUTHORIZED |
| record/posts-calendar__500-server-error.json | GET /posts/calendar | 500 | INTERNAL_ERROR |
