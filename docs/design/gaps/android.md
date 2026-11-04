# Android 원본 대비 차이

기준은 `docs/design/README.md`와 `screens-a/b/c.md`, 토큰은 `shared/design/tokens.json`이다. 수정 전 상태는 Material 기본 ColorScheme·TopAppBar·원형 스피너가 그대로 드러나던 상태를 말한다. 기능, testTag, 문구, ViewModel, 분석 이벤트는 바꾸지 않았다.

처리 표기: 맞춤 / 관례 유지 / 보류(이유).

## 1. 토큰·테마

| 항목 | 원본 기준 | 수정 전 | 처리 |
|---|---|---|---|
| 색 | README §2, tokens.json colors | textNeutral·divider·destructive·actionSecondary·photoEdit*·calendar*·skeleton* 등 다수 없음, 토스트용 색을 따로 둠 | 맞춤. `ChalkakColors`가 tokens.json 전 항목을 기본값으로 가진다 |
| 타이포 | README §2 타이포 | 시스템 글꼴과 Material 기본 스케일 | 맞춤. Pretendard/Continuous/그린한글방울 번들 글꼴과 `ChalkakTypography`(display…photoCardTitle, brand, handwriting). Material 스케일은 `toMaterial()`로 토큰에 대응 |
| 간격·라운드 | README §2 | 하드코딩 dp | 맞춤. `ChalkakSpacing`, `ChalkakRadius`, `ChalkakShapes` |
| 앱 루트 테마 | README §3 | 일부 화면만 토큰, 나머지는 Material 보라·시스템 색 | 맞춤. `MaterialTheme`도 토큰으로 덮고, ripple은 textPrimary, 라이트 고정 |
| 값 대조 테스트 | README §5 | 없음 | 맞춤. `ChalkakTokensTest`가 색·간격·라운드·글자 크기/줄 높이/굵기/자간을 tokens.json과 비교 |
| 스켈레톤 쉬머 | screens-a 공통 | 없음 | 맞춤. 앱에서는 켜고, 무한 애니메이션이 Compose 테스트의 idle을 막으므로 테스트 기본값은 꺼 둠(`LocalSkeletonShimmer`) |

## 2. 공통 컴포넌트

| 컴포넌트 | 기준 | 수정 전 | 처리 |
|---|---|---|---|
| 주 버튼·아웃라인 버튼 | screens-a 1.1 | 기본 Material 버튼 형태 | 맞춤(높이·라운드·비활성 12% 채움·1dp 테두리) |
| 체크박스 | screens-a 1.2 | Material Checkbox | 맞춤(`ic_checkbox_*` 22dp) |
| 텍스트필드 | screens-a 1.3 | 화면마다 제각각 | 맞춤(`ChalkakTextField`: inputBackground, 라운드 14, 포커스 테두리, 글자 수) |
| 로고 | screens-a 1.4 | 시스템 글꼴 텍스트 | 맞춤(Continuous 브랜드 스타일, 접근성 문구는 copy). 글꼴에 한글 글리프가 없어 화면에는 "Chalkak" 표기 |
| 스켈레톤·이미지 플레이스홀더 | screens-a 1.6 | 원형 스피너, 빈 칸 | 맞춤(`ChalkakSkeleton`, `ImagePlaceholder`, 원격 이미지 로딩·실패 처리) |
| 토스트 | screens-a 1.9, screens-c 1.1 | 12dp 모서리 상자 | 맞춤(캡슐, 슬라이드 인 + 페이드) |
| 상단 바·뒤로 버튼 | screens-c 1.3 | 화면마다 다른 행 | 맞춤(`ChalkakTopBar` 72dp, 가운데 제목) |
| 정렬 선택기 | screens-b 1.1 | 텍스트 버튼 나열 | 맞춤(`ChalkakSortSelector`, 밑줄 표시) |
| 피커 시트 | screens-b 1.2 | Material 시트/AlertDialog | 맞춤(`ChalkakSheet`: 스크림, 상단 28, 핸들 32x4) |
| 다이얼로그 | screens-b 1.4, screens-c 1.1 | AlertDialog 형태 제각각 | 맞춤(`ChalkakDialogCard`, 버튼 Primary/Secondary/Destructive). 시스템 Dialog 대신 트리 안 오버레이를 유지(테스트 가능성) — 관례 유지 |
| 로딩 스피너 | screens-c 1.2 | 기본 색 | 일부 맞춤. 짧은 대기용으로만 남기고 색은 actionPrimary. 목록·상세 로딩은 스켈레톤으로 교체 |

## 3. 화면

| 화면 | 기준 | 수정 전 | 처리 |
|---|---|---|---|
| 시작·로그인 | screens-a 2 | 단색 배경, 기본 버튼 | 맞춤(배경 이미지 20%, display 문구, 카카오 버튼, 게스트 링크 min 48) |
| 약관 | screens-a 3 | 단순 체크 목록 | 맞춤(전체 동의 카드, 필수 항목 행, 보기 링크, 체크박스 아이콘, 시트 상단 바) |
| 서명 | screens-a 5 | 단순 캔버스 | 맞춤(패드 카드, 점선 가이드, 실행 취소·지우기 캡슐, 미리보기 합성). 시트 힌트 문구와 "사인" 플레이스홀더가 한 문구로 합쳐진 점은 보류: ko.json에 키 추가 불가 |
| 탭 셸·하단 바 | screens-a 6 | Material NavigationBar 느낌 | 맞춤(`ic_bottom_*`, 가운데 작성 버튼, 15/10 패딩, 선택 시 굵게). iOS 리퀴드 글라스 스크럽은 플랫폼 관례로 제외 |
| 홈 | screens-a 7 | 수치·상태 UI 불일치 | 맞춤(상단 바 로고·알림 점, 히어로 상태, 주간 셀, 배너 1672:941, 스켈레톤·오류·재시도). 랭킹의 82dp 가로 스크롤 카드는 테스트가 5칸 행에 묶여 있어 레이아웃을 유지하고 스타일만 맞춤 — 보류 |
| 전시 | screens-b 2 | 헤더·그리드 불일치 | 맞춤(헤더 화살표 아이콘, 정렬 선택기, 그리드 25/12, 대표작 인디케이터, 날짜 휠 시트, 좋아요 이미지 위 배치, 스켈레톤) |
| 피드(게시글 상세) | screens-b 3 | 하단 바 없는 단순 상세 | 맞춤(편집·삭제 아이콘, 날짜·사인·액션 행, 수정/삭제 다이얼로그, 스켈레톤). 작가 게시물 전환 애니메이션(AuthorPosts)은 보류: 기능 범위 밖 |
| 좋아요 | screens-b 4 | 아이콘 단색 | 맞춤(이미지 위 그림자·크기 변형) |
| 업로드 | screens-b 5 | 상단 행·여백 불일치 | 맞춤(공통 상단 바, 여백 25, 입력 라운드·카드 라운드). 업로드 이탈 다이얼로그는 기존 구조 유지 |
| 사진 편집 | screens-b 6 | 하드코딩 #141312 등 | 맞춤(photoEdit* 토큰, 조정 항목 `ic_adjust_*` 아이콘, 탭·버튼 타이포). 원본 Android의 룰러 슬라이더·156dp 컨트롤 영역은 보류: 슬라이더 testTag이 계약이라 항목별 슬라이더 구조 유지 |
| AI 리뷰 | screens-b 7 | 20dp 시트, 평문 | 맞춤(시트 28 라운드·핸들, 알약에 조리개 아이콘, 기준 다이얼로그를 공통 카드로). 시작 안내의 시계·스마트폰·알림 아이콘 행, 점수 링은 보류: copy 키와 상태 모델이 없음 |
| 기록 | screens-c 2 | "▾" 텍스트, 기본 셀 | 맞춤(chevron 아이콘, 셀 채움·테두리·선택 2dp, 스켈레톤, 월 선택 시트, 오류). 기둥·책 장식, 연간 달력은 보류: 기능 범위 확대 |
| 알림·알림 상세 | screens-c 3 | 단순 텍스트 행 | 맞춤(미읽음 점 열, 2줄 제목, 44dp 썸네일, 인셋 구분선, 빈 상태, 오류) |
| 설정 | screens-c 4 | 기본 Switch·목록 | 맞춤(카드 레이아웃, 섹션 제목, 브랜드 스위치, 사인 카드, 계정 행, 확인 다이얼로그) |
| 피드백 | screens-c 5 | 닫기 아이콘 행 | 맞춤(공통 상단 바, `ChalkakTextField`) |
| 배너 웹(이슈) | screens-c 1.3 | 좌측 정렬 제목 | 맞춤(공통 상단 바) |
| 업데이트 게이트 | screens-c 1.1 | 20dp 상자, 텍스트 버튼 | 맞춤(공통 다이얼로그 카드, Secondary+Primary 버튼, 스크림 토큰) |
| 스플래시 | screens-a 2.1 | 로고 텍스트 | 관례 유지. Continuous 글꼴로 `splash.logo` 문구(`app.name`)를 보임 — 테스트가 문구 일치를 단언 |

## 4. 테스트 기대값 조정

생김새 때문에 깨진 것만 고쳤다. 삭제·skip은 없다.

- `HomeScreenTest`: 히어로 재시도가 아이콘 버튼이 되어 텍스트 대신 contentDescription을 단언.
- `NotificationScreenTest`·`NotificationRouteTest`·`MainHostNotificationTest`: 행이 원본 높이(위아래 24)가 되어 화면 밖 행은 목록을 스크롤해서 찾음.
- `ToastLayerTest`: 등장 애니메이션이 가상 시계를 먼저 흘려 보내므로 시계를 직접 진행.
- `UploadScreenTest`: 상단 바가 72dp가 되어 뷰포트에 잘린 경계 대신 잘리지 않은 경계로 비율을 확인.

## 5. 검증 환경 메모

- Robolectric의 android-all 내려받기가 Maven Central 429로 막혀 캐시된 jar를 `-Drobolectric.offline=true -Drobolectric.dependency.dir=...`로 지정해 실행했다.
- `-PkakaoNativeAppKey=ci-dummy` 컴파일은 샌드박스에서 `devrepo.kakao.com`이 403이라 의존성 해석 단계에서 실패한다(코드 오류 아님).
