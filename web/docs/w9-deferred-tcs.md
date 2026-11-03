# W9 보류·제외 TC (기록 탭: 월 선택·달력·캐시·이미지 저장)

형식: TC — 이유 — 예정 PR/근거

W9는 기록 화면 본체(월 선택지, 달력 격자, 월별 조회와 응답 검증, 월별 캐시·재검증, 날짜 선택과 URL 진입·동기화, 오류 화면, 게스트·인증, 이미지 저장 포트, PostChanges 반영, screen_view)를 jsdom에서 검증한다. 실제 canvas 렌더와 파일 다운로드는 구현 단계에서 Playwright로 확인한다.

## 다룬 TC (테스트 파일)
- TC-REC-005, 006, 008(격자 부분), 010, 018(순수 함수) — `recordMonths.test.ts`
- TC-REC-001 ~ 003, 012 ~ 015, 030 ~ 032 — `RecordRepository.test.ts`(C: 요청·검증·정렬·오류 매핑)
- TC-REC-001 ~ 004, 007, 008, 012 ~ 014, 016, 017, 021, 025 ~ 027, 029 ~ 036, TC-TIME-016, TC-NAV-024 — `RecordViewModel.load.test.ts`
- TC-REC-019 ~ 024, 028, 043(VM), TC-FEED-044(기록 부분) — `RecordViewModel.cache.test.ts`
- TC-REC-038 ~ 040 — `RecordViewModel.save.test.ts`, `calendarImage.test.ts`(이미지 모델·PNG 헤더), `FileDownloader.test.ts`(`<a download>`)
- TC-REC-034(이동 계약), TC-FEED-004(기록 진입 부분) — `recordNavigation.test.ts`
- TC-REC-009, 011, 015, 003, 004, 008, 016, 017, 020 ~ 022, 024, 029 ~ 032, 035 ~ 040, 042 — `RecordScreen.test.tsx`(W)
- TC-REC-025, 026, 028, 033, 034, 042, 043, TC-NAV-010(기록 부분), TC-ANL-016, TC-FEED-004(W) — `RecordScreen.nav.test.tsx`(W: 실제 라우터, 홈·전시·상세와 이어 붙임)
- TC-REC-028, UserCaches 등록(TC-AUTH-041의 기록 부분, TC-NAV-050의 기록 부분) — `app/container.record.test.ts`

## 이전 PR에서 넘겨받아 W9에서 다루는 것
- 이번 주 기록 → 기록 탭 이동(W5 deferred, TC-HOME-021/022/023/031의 E 부분 중 기록 쪽) — `/record?date=`로 들어와 그 달·날짜를 선택하는 것까지 `RecordScreen.nav.test.tsx`
- 기록 캐시의 삭제 반영, 기록에서 상세 열기(`assumeMine`)(W6 deferred, TC-FEED-004·024·036·044의 기록 부분) — 삭제는 `RecordViewModel.cache.test.ts`, 상세 진입은 `RecordScreen.nav.test.tsx`. TC-FEED-024(제목 수정)의 기록 부분은 달력이 제목을 보여 주지 않아 해당 없음(title 이벤트는 무시함을 확인)
- TC-AUTH-041, TC-NAV-050의 기록 캐시 등록(W2/W3 deferred) — `container.record.test.ts`
- 세션 세대 토큰(W3 deferred "이전 계정 요청의 늦은 응답 폐기") — 기록 ViewModel의 `resetForAccountChange`가 진행 중 요청을 무효화(TC-REC-028)

## 제외·보류
- TC-REC-018 중 연도 휠 UI — Web 월 선택은 목록형 시트(플랫폼별 허용 차이)라 연도 휠이 없다. 연도를 바꿀 때 가장 가까운 달을 고르는 규칙은 순수 함수 `nearestAvailableMonth`로만 검증하고 화면에는 연결하지 않는다 — 해당 없음(웹은 목록형)
- TC-REC-004 중 "월 목록에 없는 기록 없는 달로 이동" — REQ-REC-005/006(선택지 밖의 달은 무시)과 충돌한다. 요구사항(Android·D-19)을 따라 선택지 안의 빈 달만 이동하고 선택지 밖은 무시한다(`RecordViewModel.load.test.ts`). 명세 확인 필요 항목 1번 — 결정되면 TC 추가
- TC-REC-014 — 카탈로그는 "해당 날짜만 사진 패널이 없는 날"이지만 REQ-REC-018(5)은 알 수 없는 status를 응답 전체의 계약 위반으로 본다. 요구사항을 따랐다(오류 화면 + 다시 시도, 앱은 깨지지 않음). 명세 확인 필요 항목 2번
- TC-REC-026 — 카탈로그의 "다른 날짜의 사진을 대신 열지 않는다"와 REQ-REC-032("기본 선택을 따른다")를 "가까운 날짜를 대신 열지 않고 기본 선택(가장 늦은 날짜)"으로 해석했다
- 날짜 선택 시트(명세 화면 3 "날짜 선택" 제목, `record.picker.title`) — testids에 별도 날짜 시트 식별자가 없고 날짜 칸을 직접 눌러 고른다. Web은 월 선택 시트의 제목을 `record.picker.title`로 쓰고 날짜는 달력 칸에서 고른다(임시). 명세 확인 필요 항목 4번
- REQ-REC-042(정지 회원 403) — D-08 표에 기록 조회 문구가 없고 TC도 없다. 403은 "기록을 불러오지 못했어요" 일반 오류(other)로 두는 임시안. TC-NAV-024는 정지 회원도 조회가 정상 호출되는 것까지(TC-REC-001) — 정지 문구가 정해지면 TC 추가
- REQ-REC-015 호버로 안내 풍선 열기 — 클릭 토글만 구현·검증한다(허용 차이: 클릭 또는 호버). 호버는 터치 기기에서 의미가 없다
- 달력 이미지의 PNG 실바이트·글꼴·썸네일 로드 실패 시 날짜만 그리기, 화면과 같은 내용인지(TC-REC-038의 실제 렌더, TC-REC-044의 Web 쪽) — jsdom canvas는 getContext가 null이다. 모델(`CalendarImageModel`)과 포트 계약(PNG 헤더·가로세로>0 검증, 파일 이름, 토스트)은 U로 닫았다 — 구현 PR에서 `e2e/calendar-image.spec.ts`(Chromium 다운로드 이벤트와 PNG 디코드)
- 실제 파일 다운로드 이벤트(`<a download>`가 브라우저에서 파일을 내려받는지) — jsdom은 다운로드하지 않는다. 앵커 속성·클릭·URL 해제까지 U — E2E
- TC-REC-041(월별 레이아웃 스냅샷) — S는 W 계층에서 제외 — 시각 회귀 PR
- TC-REC-044, 045(AG-REC-001, 002) — 실기기·실서버·실데이터 시각 확인(A). Web 차이(파일 다운로드, 창 폭 두 가지) 포함 — 에이전트 시나리오
- TC-REC-038 REQ-REC-038(Android MediaStore·iOS 사진 권한) — 플랫폼 전용, Web 비해당(파일 다운로드). 권한 거부 분기는 `SaveDeniedError`로 포트 계약만 검증(TC-REC-039)
- E (TC-REC-024, 025, 029, 033, 034, 043의 E 부분) — 실제 브라우저·오프라인·업로드 흐름은 E2E 계획. W에서 실제 라우터로 이어 붙인 흐름은 위 파일들이 검증
- 기록 화면 스크롤 복원(`useScrollRestore`) — 전시처럼 상세에 갔다 와도 스크롤을 복원할지는 TC가 없다. 달·날짜 유지만 검증(TC-NAV-010) — 필요하면 별도 TC
