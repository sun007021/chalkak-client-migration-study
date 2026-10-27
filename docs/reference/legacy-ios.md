# Chalkak iOS 앱 분석 (읽기 전용)

> 원본: `woowacourse-teams/2026-Chalkak` main(2026-10-27) 읽기 전용 분석. 경로는 원본 레포 기준이다. 정리·결정은 [`../spec/`](../spec/)가 우선한다.

- 대상: `client/iOS/chalkak` (SwiftUI, `@Observable` 뷰모델). 앱 코드 `chalkak/chalkak`(이하 `A/`), 테스트 `chalkakTests`, `chalkakUITests`.
- 표기: 근거는 `A/` 기준 상대경로와 줄 번호. 줄 번호는 대략값(~)일 수 있음. 확인 못한 것은 [추정].
- 비밀값(키, 계정, 시크릿)은 기재하지 않음. 빌드 설정은 키 이름만 적음.
- 소셜 로그인은 카카오만 범위. Apple/Google은 "보류".

## 0. 플랫폼 개요

| 항목 | 값 |
|---|---|
| 최소 iOS | 18.0, MARKETING_VERSION 1.1.1, 번들 `com.stonefive.chalkak` |
| 테마/방향 | 라이트 고정, iPhone 세로 고정 |
| 의존성(SPM) | GoogleSignIn 9, Kakao iOS SDK 2.29, SDWebImageWebPCoder 0.9.1, Firebase 12.19.2(Messaging, Analytics), Mantis(크롭) |
| 아키텍처 | SwiftUI + `@Observable` ViewModel, `Core/`(인프라), `Data/`(API 저장소), `Features/`(화면) |

## 1. 화면 목록과 내비게이션

### 1.1 라우트와 탭
- `AppRoute`: `login` / `onboarding` / `main` / `photoUploadSuccess` (`A/ContentView.swift`, `initialRoute` ~1085).
- 메인 탭 `ChalkakBottomBarItem`: 홈 / 전시 / 기록 / 설정 + 중앙 "추가" 버튼(업로드 진입, 탭 아님). `select` ContentView ~554, `openPhotoUpload` ~700.
- 하단바: 스크럽 제스처, 스크롤 방향 임계값 16에서 compact, iOS 26은 Liquid Glass 변형.
- 모달/푸시 화면: Feed(게시물 상세), Notifications, NotificationDetail, Issue(배너 웹뷰), PhotoUpload(+PhotoEdit), PhotoUploadSuccess, Feedback, 약관 웹뷰 시트, AI 리뷰 시트.

### 1.2 시작 흐름 (버전 게이트 → 인증 게이트 → 온보딩/가입 → 홈)
1. 버전 게이트 (`A/Features/VersionGate/AppVersionGate.swift`)
   - iTunes lookup: bundleId + country(Storefront) + entity=software. 타임아웃 3초(~77).
   - 스토어 버전의 major/minor가 더 높을 때만 강제 업데이트(~29). patch 차이는 무시.
   - 조회 실패는 `unavailable`(~152): 앱 허용, 이미 알려진 강제 상태는 유지.
   - 닫을 수 없는 다이얼로그: 제목 "업데이트가 필요해요", 본문 "원활한 서비스 이용을 위해 최신 버전으로 업데이트해 주세요.", 버튼 "업데이트". scene이 active가 될 때 재확인.
2. 인증 게이트 (`initialRoute`, `KeychainSessionStore`)
   - `hasAuthenticatedSession` = userId 존재 + 만료되지 않은 refresh token → main. `hasActiveSession` = 인증 또는 게스트 플래그.
   - 세션 없음 → login. 게스트면 main(제한 모드).
3. 로그인 → `POST auth/social-login`. 응답 `LOGIN_SUCCESS`면 main, `SIGN_UP_REQUIRED`면 onboarding.
4. 온보딩(약관 → 사인 그리기 → 미리보기) → 가입 완료 시 main.
5. main 첫 진입(인증 사용자만) 시 알림 권한 안내(2.9 참고), Home 로드.

### 1.3 게스트 제한 (ContentView 토스트, 2.5초 `ContentView.swift:~751`)
| 기능 | 메시지 |
|---|---|
| 기록 탭 | 기록을 보려면 로그인이 필요해요 |
| 게시물 추가 | 게시물을 추가하려면 로그인이 필요해요 |
| 상세 | 상세를 보려면 로그인이 필요해요 |
| 알림 | 로그인 후 알림을 확인할 수 있어요 |
| 피드백 | 피드백을 보내려면 로그인이 필요해요 |
- 전시(Display) 탭은 게스트 허용(조회 가능). 단 Feed 좋아요는 서버 401 → 토스트 실패.
- 게스트는 Authorization 헤더 없이 요청. 배너, 토픽, 게시물 목록은 비인증으로 호출 가능 [추정: 서버 정책 확인 필요].

### 1.4 딥링크 / 푸시 탭 라우팅
- 외부 URL 딥링크: 카카오(`kakao<APPKEY>` 스킴)와 구글 reversed client id 스킴만 `onOpenURL`로 SDK에 전달(`A/chalkakApp.swift`). 앱 자체 딥링크(universal link, 커스텀 스킴 라우팅)는 없음.
- 푸시 탭 페이로드(`A/Core/Push/PushNotificationTap.swift`): APNs userInfo 최상위 키.
  - `type` ∈ TOPIC / POST_APPROVED / POST_REJECTED / NOTICE / AI_REVIEW_COMPLETED / AI_REVIEW_FAILED
  - `notificationId`, `sourceId`는 UUID여야 함. AI 리뷰 타입은 `sourceType == "POST"` 필수. 위반 시 무시(앱만 열림).
- 목적지 (`handlePendingPushTap` ContentView ~606, `openNotificationDestination` ~672):
  | type | 이동 |
  |---|---|
  | TOPIC | Home (맨 위 스크롤 + 새로고침) |
  | POST_APPROVED | Feed (route `approved`) |
  | AI_REVIEW_COMPLETED / FAILED | Feed (route `aiReview`, AI 시트 자동 오픈, 본인 게시물로 취급) |
  | POST_REJECTED / NOTICE | NotificationDetail (`GET notifications/{id}`) |
- 이동 전 `PATCH notifications/{id}/read`. 404면 인박스 새로고침 + 토스트 "더 이상 확인할 수 없는 알림이에요."(이동 안 함). 네트워크 실패 시 "읽음 처리하지 못했어요. 다시 열어 주세요." 토스트를 띄우되 이동은 수행.
- 로그아웃 상태 탭은 폐기. 사진 업로드/피드백 화면 표시 중에는 이동 차단. `PushTapRouter`가 콜드 스타트 탭을 버퍼링.
- 인앱 알림 인박스 항목 탭도 같은 `NotificationRoute`(ContentView ~1198) 사용.

## 2. 기능별 상세

### 2.1 로그인 (카카오) 및 게스트
- 화면: "매일 하나의 주제,\n각자의 한 장". 버튼 3종(Apple, Google, 카카오로 계속하기; `SocialLoginProvider.allCases` 순서) + "로그인 없이 사진 둘러보기". 새 플랫폼은 카카오만 구현, Apple/Google은 보류.
- 카카오 (`A/Core/Auth/KakaoLoginClient.swift`): 카카오톡 앱 로그인 우선, 불가 시 카카오계정 로그인으로 폴백. nonce는 base64url 원문을 SHA256 해시해 SDK에 전달, 원문은 서버에 `rawNonce`로 전송.
- API: `POST auth/social-login` body `{provider, idToken, rawNonce, authorizationCode?}`. 응답 status `LOGIN_SUCCESS`(토큰 포함) / `SIGN_UP_REQUIRED`(signupToken 등).
- 로그인 취소는 무음. 오류 알림 제목 "로그인", 버튼 "확인". 기본 문구: "로그인하지 못했어요. 다시 시도해 주세요.", "로그인 설정을 확인해 주세요.", "로그인 응답을 확인할 수 없어요. 다시 시도해 주세요.", "로그인 요청에 실패했어요. 다시 시도해 주세요.".
- 로그인 후 `PUT push-devices/current` 등록(2.9).
- 게스트: 로컬 플래그(`UserDefaults` 키 `stonefive.chalkak.guest-access`)만 설정, 서버 호출 없음(`APIAuthRepository` ~133).
- 로그아웃: 로컬 세션 삭제 후 `POST auth/logout` body `{refreshToken}` (~138). 서버 실패 무시.
- 회원 탈퇴: `DELETE users/me` 성공 후 로컬 세션 삭제.

### 2.2 온보딩 / 회원가입 (`A/Features/Onboarding`, `A/Features/Signature`)
- 1단계 약관: 제목 "찰캌에\n오신 것을 환영합니다." (소스 원문 그대로 "찰캌"로 표기됨, 브랜드명 "찰칵" 오타 가능성 [추정]), 전체 동의 / (필수) 서비스 이용약관 / (필수) 개인정보 처리방침 / 보기 / 다음. 약관은 Notion URL을 WKWebView 시트로 표시.
- 2단계 사인: "작가님의\n사인을 그려주세요", 안내 "모든 사진에 함께할 사인이에요.\n자유롭게 남겨주시고, 실제 서명은 피해 주세요.", 되돌리기 / 전체 지우기 / "이 사인으로 할래요".
  - PNG 출력 1024x512, 패딩 48, 선 두께 14, 투명 배경 + 흰색 선, 최대 1 MiB(1,048,576), 최소 정규화 크기 0.02.
- 3단계 미리보기: "이렇게 보여요", 다시 그리기, 시작하기.
- 가입 API 순서:
  1. `POST auth/social-signup/signature/uploads` → `uploadId, uploadUrl, expiresInSeconds, signupToken`
  2. `PUT {uploadUrl}` PNG, `Content-Type: image/png`
  3. `POST auth/social-signup` body `{signupToken}`
  4. errorCode `SIGNATURE_PROCESSING_PENDING`이면 1000ms 간격 최대 10회 재시도, 초과 시 타임아웃 실패.
- 실패 알림(제목 "회원가입"): "사인 이미지가 1MB를 초과했어요.", "사인 처리에 시간이 걸리고 있어요. 다시 시도해 주세요.", "사인을 다시 업로드해 주세요.", "사용할 수 없는 사인이에요. 다시 그려주세요.", "네트워크 연결을 확인해 주세요.", "회원가입을 완료하지 못했어요. 다시 시도해 주세요."
- 로그인 컨텍스트 소실 또는 401 → 로그인 화면 복귀 + "로그인 정보가 만료되었어요. 다시 로그인해 주세요.".

### 2.3 홈 (`A/Features/Home/HomeViewModel.swift`)
- 병렬 로드: 오늘 토픽 + 인기 게시물, 어제 랭킹(`prefix(5)`), 이번 주 개인 기록(일~토, 월별 캘린더), 배너(`GET banners?page=&pageSize=10`, 비인증).
- 섹션: "이번 주 기록", "어제 랭킹", "오늘 인기있는 사진", "ISSUE".
- 히어로 상태: loading / empty / noOpenTopic / processing / error / rejected / photo.
  - 문구: "사진을 확인하고 있어요", "지금은 참여할 수 있는 주제가 없어요", "사진을 처리하고 있어요", "사진 상태를 불러오지 못했어요", "검수 대기"/"대기", 반려 "사진이 반려되었어요 / 참여 기간 안에 다시 제출할 수 있어요" 및 "사진이 반려되었어요\n이 주제의 참여 기간이 종료되었어요", "\"주제\" 사진을 공유하지 않았어요", "오늘의 주제를 불러오는 중", "오늘의 주제를 불러오지 못했어요", "오늘의 주제가 아직 준비되지 않았어요", "기록을 불러오지 못했어요", "아직 올라온 사진이 없어요", "ISSUE를 불러오지 못했어요. 다시 시도".
- 배너 웹뷰(Issue): https만 허용. 링크 클릭 메인 프레임 이동은 외부 브라우저, 그 외 이동은 취소. 오류 "링크를 열 수 없어요", "페이지를 불러오지 못했어요", "다시 시도".
- 홈 AI 리뷰 폴링 5초(HomeViewModel ~97), 300초 데드라인 후 "처리가 오래 걸리고 있어요. 나중에 다시 확인해 주세요.". 홈 문구: "AI 리뷰를 확인할 수 없는 게시물입니다.", "AI 리뷰를 불러오지 못했어요. 잠시 후 다시 시도해 주세요."(~214).
- 게시물 삭제 후 토스트 "게시물이 삭제됐어요". 홈이 보일 때 및 앱 active 시 미읽음 알림 상태 갱신.

### 2.4 전시 (Display, `A/Features/Display/DisplayViewModel.swift`)
- API: `GET topics?date=yyyy-MM-dd`, `GET posts?topicDate=&sort=recent|popular|random&page=&pageSize=20[&randomSeed]`.
- 과거 날짜는 `popular` 고정(아카이브 모드, 상위 5개 캐러셀). 오늘은 최신순/인기순/랜덤순 선택. 랜덤 시드는 다음 페이지에 재사용.
- `firstTopicDate` 하드코딩: KST 2026-09-17(~115).
- 날짜 키 단위 (date, sort) 캐시 + stale generation 보호. 2열 메이슨리 그리드.
- 좋아요는 서버 확정형(낙관적 아님). 실패 토스트 "좋아요를 변경하지 못했어요".
- 문구: "해당 날짜의 전시가 없어요", "네트워크 연결을 확인해 주세요", "전시를 불러오지 못했어요", 빈 상태 "이 날의 전시가 아직 없어요", 설명 "가장 사람들이 좋아했던 사진들이에요" / "같은 주제에서 다른 시선을 느껴보세요".

### 2.5 피드 (게시물 상세, `A/Features/Feed`)
- API: `GET posts/{id}`, `PUT/DELETE posts/{id}/likes`(응답 postId, likeCount, isLiked), `DELETE posts/{id}`, `PUT posts/{id}` body `{title}`(빈 문자열은 null로 정규화).
- 좋아요는 낙관적 + 직렬화 + 실패 롤백. 상세 응답이 진행 중인 좋아요/제목 수정을 덮어쓰지 않음.
- 제목 최대 10자, grapheme 기준(`FeedTitleEditDialog.swift:~71`). 규칙 POST-005는 유니코드 코드포인트 기준이라 불일치(5장 참고).
- 수정은 오늘 본인 게시물만, 삭제는 본인 게시물만. 제목 없으면 "무제".
- 문구: 삭제 "게시물 삭제" / "게시물을 삭제하시겠어요?" / "삭제"; 수정 "게시물 제목 수정" / "제목을 입력해 주세요." / "취소" / "저장" / "저장 중..."; 토스트 "제목을 수정했어요".
- 오류: "게시물을 찾을 수 없어요", "네트워크 연결을 확인해 주세요", "게시물 정보를 불러오지 못했어요", "게시물을 불러오지 못했어요", "게시물을 삭제하지 못했어요", "수정할 수 없는 상태이거나 주제 참여 기간이 끝났어요", "게시물 제목을 수정하지 못했어요".
- 날짜 라벨 "M월 d일의 주제"(KST). 핀치 줌 최대 4배, 뒤로가기 스와이프 임계값(edge 24, min 12, full 300, close 120), 줌 애니메이션 0.3초/0.7초.

### 2.6 AI 리뷰 (`A/Features/AIReview`, `Feed/FeedAIReviewViewModel.swift`)
- API: `GET posts/{id}/ai-review`, `POST posts/{id}/ai-review`. 상태 NONE / PROCESSING / COMPLETED / FAILED, `canRequestAgain`. 결과: `overallScore`, `criteria[{key,label,score}]`, `distinctivePerspective`, `feedback{summary,strength,weakness,suggestion}`. 점수가 0~10 밖이면 응답 무효.
- 진입은 GET만. POST는 사용자의 명시적 요청 시에만. POST 실패 후 자동 재시도 없음(응답 유실 시 GET으로 확인).
- 피드 폴링 3초(`FeedAIReviewViewModel.swift:~88`), 300초 데드라인. 요청은 오늘 게시물만, 과거는 완료 결과만 표시. 409는 피드에서 GET으로 재조회.
- 문구: "AI 상태 확인중", "AI 요청중", "AI 분석중", "AI 피드백 보기", "AI 피드백 재요청", "AI 피드백 실패", "AI 피드백 받기", "AI 상태 다시 확인", "이 사진은 더 이상 AI 피드백을 요청할 수 없어요.", "AI 피드백은 오늘 올린 사진만 재요청할 수 있어요.", "AI 피드백을 확인할 수 없는 게시물이에요.", "이용이 제한되어 AI 피드백을 요청할 수 없어요.", "AI 피드백을 불러오지 못했어요. 잠시 후 다시 확인해 주세요.", "로그인이 필요합니다."
- 시작 시트: "AI 피드백을 시작할까요?", "결과가 나오기까지 몇 분 정도 소요될 수 있어요", "앱을 나가도 분석은 계속되니 걱정마세요", "분석이 끝나면 알림으로 알려드릴게요", "분석 시작하기". 배지 "작가님의 해석이 돋보이는 작품이에요". 결과 섹션 "좋았던 점", "아쉬운 점", "다음엔 이렇게".

### 2.7 기록 (Record, `A/Features/Record`)
- API: `GET posts/calendar?year=&month=`, `GET posts/calendar/months`.
- 응답 검증: 월이 요청과 일치, 날짜가 해당 월 범위, 날짜 중복 없음, 썸네일 비어있지 않음. 월 단위 캐시, 현재 월은 월 목록에 항상 포함.
- 상태 APPROVED / PENDING / REJECTED / unknown. 승인 사진에서 "피드에서 보기", "전시 보러가기". PENDING은 "사진 반영 중" + 툴팁 "사진을 반영하고 있어요.\n표시되기까지 조금 시간이 걸릴 수도 있어요!".
- 달력 이미지 저장("이미지로 저장"): 사진 추가 전용 권한. 토스트 "달력을 이미지로 저장했어요", "이미지 저장에 실패했어요", "이미지 저장 권한이 필요해요".
- 오류: "로그인이 필요해요"(버튼 "로그인 하기"), "조회할 수 없는 연월이에요", "기록을 불러오지 못했어요"(버튼 "다시 시도"). 요일 헤더 일월화수목금토, 날짜 선택 제목 "날짜 선택".

### 2.8 사진 업로드 (`A/Features/PhotoUpload`, `Data/PhotoUpload/PhotoUploadAPIRepository.swift`)
1. 진입 게이트 `GET posts/today` (isPosted, postId, moderationStatus, topicDate). `isBlockingEntry`는 VALIDATING / PENDING / APPROVED만. 결과: 401 → 로그인 화면, 403 → "이용이 정지되어 게시물을 작성할 수 없어요.", 404 → "지금 참여할 수 있는 주제가 없어요.", 이미 작성 → "이미 이 주제에 게시물을 작성했어요.", 기타 → "게시물 작성 여부를 확인하지 못했어요. 다시 시도해 주세요.".
2. `GET topics?date=<topicDate>` (응답 date가 요청과 같아야 함).
3. 이미지 선택 즉시 준비 시작: `POST posts/uploads` → `uploadId, uploadUrl, expiresInSeconds, contentType(image/webp 필수), maxBytes`. 이후 WebP 인코딩.
4. 제출 시 업로드 URL 만료(expiresIn - 5초 여유)면 정책 재발급, maxBytes 초과 시 재인코딩.
5. `PUT {uploadUrl}` 이미지, Content-Type은 정책값.
6. `POST posts` body `{topicId, photoUploadId, title}`.
- 이미지 처리: 긴 변 4096 다운샘플(2의 거듭제곱 샘플링, EXIF 적용), 품질 사다리 [0.9, 0.8, 0.6, 0.4], WebP method 0, 최대 3회 0.85배 축소 재시도, RIFF/WEBP 헤더 검증. 편집 결과는 JPEG q1.0으로 변환한 뒤 WebP 재인코딩(이중 손실).
- 캡션 최대 10자, grapheme 기준(`PhotoUploadViewModel.swift:~95`).
- 게시물 생성 오류는 errorCode가 아니라 서버 한글 메시지 문자열 일치로 분기(`PhotoUploadAPIRepository.swift:~179,202`): "이미 해당 주제에 게시물을 작성했습니다." / "현재 게시물을 작성할 수 없는 주제입니다." (백엔드 `PostCommandService.java:263,291` 확인).
- 실패 문구: "로그인이 필요해요.", "네트워크 연결을 확인해 주세요.", "사진을 준비하지 못했어요. 다시 시도해 주세요.", "사진을 업로드하지 못했어요. 다시 시도해 주세요.", "전시를 완료하지 못했어요. 다시 시도해 주세요.", "이미 이 주제에 전시한 사진이 있어요.", "주제가 변경되어 전시할 수 없어요.", "주제를 불러오지 못했어요. 다시 시도해 주세요."
- UI: 제목/버튼 "전시하기" / "전시 중...", "작품 제목은 선택이에요.", "주제 ‘…’에 맞는 한 장", "앨범에서 고르거나 지금 찍어요".
- 성공 화면: "‘주제’을/를 기록했어요."(받침에 따라 조사 선택), "검수를 기다리고 있어요. 피드 표시까지 시간이 조금 걸릴 수도 있어요!" / "사진을 확인하고 있어요. 피드 표시까지 시간이 조금 걸릴 수도 있어요!", 버튼 "확인했어요.".
- 카메라/앨범: 앨범은 PHPicker(권한 불필요, 단일 이미지). 카메라는 열기 전에 사진 추가 전용 권한을 먼저 요청하고, 거부 시 알림 "촬영 사진 저장 권한"(설정 열기 / 저장 없이 촬영 / 취소). 촬영본은 앨범에 저장(저장 실패 토스트는 업로드 계속 가능 안내). 카메라 권한 자체의 명시 처리는 없음 [추정: 시스템 프롬프트에 의존]. 카메라 불가 기기에서는 버튼 숨김.

### 2.9 사진 편집 (PhotoEdit, 클라이언트 전용, Mantis)
- 도구: 조정 / 필터 / 자르기·회전.
- 필터: 원본, 선명(채도 1.25, 대비 1.08), 크롬, 페이드, 흑백, 누아르.
- 비율: 원본, 자유, 1:1, 4:5, 5:4, 3:4, 4:3, 9:16, 16:9.
- 조정: 노출(±1.5 EV), 대비, 하이라이트, 그림자, 블랙 포인트(범위 0.3), 채도, 따뜻함(gain 0.25), 자동 보정(강도 0~1).
- 프리뷰 긴 변 1600, 썸네일 긴 변 240, 원본 긴 변 최대 4096. 렌더 실패 알림 "사진을 편집하지 못했어요. 다시 시도해 주세요.".

### 2.10 알림 (`A/Features/Notification`, `Core/Push`)
- API: `GET notifications?page=&pageSize=20`, `GET notifications/unread-status`(`hasUnread`), `GET notifications/{id}`(title, body, originalImageUrl, rejectionReason), `PATCH notifications/{id}/read`, `PATCH notifications/read-all`(클라이언트 메서드만 있고 UI 미사용).
- 문구: 로딩 "알림을 불러오는 중이에요", 빈 상태 "아직 알림이 없어요" / "승인이나 반려 소식이 생기면 여기에 모아둘게요", 실패 "알림을 불러오지 못했어요", 새로고침 실패 "알림을 새로고침하지 못했어요. 다시 시도해 주세요.", 다음 페이지 실패 "다음 알림을 불러오지 못했어요. 다시 시도해 주세요.", 상세 없음 "더 이상 확인할 수 없는 알림이에요", 섹션 "반려 사유".
- 날짜 포맷은 기기 로컬 시간대(KST 아님, `NotificationScreen.swift:~244`).
- 푸시 기기 등록: `PUT push-devices/current` body `{fcmToken}`. JWT에 `session_id` 클레임이 있어야 하며 없으면 먼저 refresh. 401이면 refresh 1회 후 1회 재시도. 실패해도 로그아웃하지 않음. 로그인 시점과 FCM 토큰 변경 시 실행(`PushDeviceRegistrar`).
- APNs 토큰은 수동 전달(`FirebaseAppDelegateProxyEnabled=false`, 시뮬레이터는 sandbox 타입).
- 알림 권한 (홈 최초 진입, 인증 사용자만, @AppStorage `notifications.permissionSettingsGuidanceShown`): notDetermined이면 시스템 권한 요청 후 세 설정을 결과값으로 PATCH. 그 외에는 앱 알림 "알림을 허용하시겠어요?"(거부/허용, 본문 "오늘 주제와 게시물 승인 반려 소식을 알려드려요."). 실패 문구: "알림 권한을 요청하지 못했어요. 기기 설정에서 확인해 주세요.", "알림 설정을 저장하지 못했어요. 앱 설정에서 다시 시도해 주세요." 요청 옵션 `[.alert, .badge, .sound]`.
- 설정 화면: `GET /notification-settings`, `PATCH /notification-settings`(변경 필드만 전송, 204). 필드 `topicPushEnabled`, `moderationPushEnabled`, `aiReviewPushEnabled`. 토글 라벨 "오늘 주제 알림", "게시물 승인·반려 알림", "AI 피드백 완료 알림". 낙관적 갱신, 실패 시 해당 필드만 롤백 + 토스트 "알림 설정을 저장하지 못했어요. 다시 시도해 주세요.", 로드 실패 "알림 설정을 불러오지 못했어요. 다시 시도해 주세요.". OS 권한이 거부 상태에서 토글을 켜면 시스템 알림 설정으로 이동.
- 레거시: 과거 로컬 일일 리마인더(`daily-topic-reminder`)를 정리하는 코드가 있음(iOS 전용).

### 2.11 설정 (`A/Features/Settings`)
- 행: 앱 설정, 계정, 피드백, 정보 및 약관, 개인정보처리방침, 이용약관, 버전정보, 피드백 보내기, 로그아웃, 회원탈퇴, 로그인(게스트).
- 사인 카드: `GET users/me/signature`(썸네일 URL). 변경: `POST users/me/signature/uploads` → `PUT` PNG → `PUT users/me/signature` body `{signatureOriginalUploadId}`(응답 `signatureOriginalImageUrl`). 변경 후 토스트 "사인 반영까지 시간이 좀 걸릴 수 있어요!".
- 사인 오류: "사인 이미지가 1MB를 초과했어요.", "네트워크 연결을 확인해 주세요.", "사용할 수 없는 사인이에요. 다시 그려주세요."(400/403), "사인 업로드를 찾을 수 없어요. 다시 시도해 주세요."(404), "사인을 저장하지 못했어요. 다시 시도해 주세요.", 로드 실패 "사인을 불러오지 못했어요. 다시 시도해 주세요.".
- 확인창: "정말 로그아웃 하시겠습니까?", "정말 회원탈퇴 하시겠습니까?". 실패 토스트 "요청을 처리하지 못했어요. 다시 시도해 주세요.".
- 약관/개인정보: Notion URL을 WKWebView 시트로 표시(허용 호스트 notion.com / notion.so / notion.site, https만; 그 외는 외부 브라우저). 오류 "문서를 불러오지 못했어요".

### 2.12 피드백 (`A/Features/Feedback`)
- API: `POST feedbacks` body `{content}`. 트림 후 유니코드 스칼라 기준 1~1000자(`FeedbackAPIClient.swift:~38`).
- 문구: 안내 "찰캌을 사용하며\n느낀 점을 알려주세요.", 플레이스홀더 "내용을 입력해 주세요.", 버튼 "보내기" / "보내는 중...", 검증 "피드백은 1자 이상 1000자 이하로 입력해 주세요.", 실패 "피드백을 보내지 못했어요. 다시 시도해 주세요.", 성공 토스트 "피드백을 보내주셔서 감사해요.". 400은 서버 메시지 표시, 401은 재인증.

### 2.13 KST 처리
- 대부분 Asia/Seoul 고정(주제 날짜 `yyyy-MM-dd`, "M월 d일의 주제", 주간 기록 일~토, 전시 firstTopicDate). 예외: 알림 시각은 기기 로컬(2.10).
- ISO8601 파서는 소수초 유무 모두 허용.

### 2.14 이미지 로딩/캐시
- `RemoteImageCache`: NSCache 비용 한도 64 MiB, 최대 너비 1320px. WebP 디코딩에 SDWebImageWebPCoder 사용.

### 2.15 분석 이벤트 (Firebase Analytics)
- `screen_view`(자동 리포팅은 꺼져 있고 수동 전송): login, terms, onboarding_signature, onboarding_signature_preview, home, display, record, settings, feed, notifications, notification_detail, issue, photo_upload, photo_upload_success, feedback, privacy_policy, terms_of_service.
- 커스텀 이벤트 `bottom_navigation_selected`, 파라미터 `destination`.
- `FirebaseAutomaticScreenReportingEnabled=false`.

### 2.16 권한 요약
| 권한 | 용도 | 비고 |
|---|---|---|
| 카메라 (`NSCameraUsageDescription`) | 촬영 | 거부 처리 명시 없음 [추정] |
| 사진 추가 (`NSPhotoLibraryAddUsageDescription`) | 촬영본/달력 저장 | 카메라 전에 선요청 |
| 알림 | 푸시 | 2.10 참고 |
| 앨범 읽기 | 불필요 | PHPicker |

## 3. 공통 인프라

### 3.1 네트워크 계층 (`A/Core/Auth/AuthenticatedHTTPClient.swift`)
- `URLSession.shared` 기본 타임아웃(App Store 조회만 3초). 오프라인 감지 모니터 없음, `URLError`를 `.network` 오류로 매핑. https 강제, 비 https 리다이렉트 차단.
- Bearer 토큰 전송. 게스트(토큰 없음)는 Authorization 생략.
- 401 처리(`data(for:)` ~87): 사용 가능한 토큰이 있고 errorCode가 `UNAUTHORIZED`일 때만 refresh. 동시 401은 `TokenRefreshCoordinator` 액터(~249)로 1회 refresh 공유. 그 사이 토큰이 갱신됐다면 새 토큰으로 재시도.
- refresh: `POST auth/refresh` body `{refreshToken}` → `accessToken, expiresIn, refreshToken, refreshTokenExpiresIn`.
- `REAUTHENTICATION_REQUIRED`면 세션 삭제 + `authSessionDidRequireReauthentication` 알림 → ContentView가 `showLogin()`.

### 3.2 토큰 저장 (`A/Data/Auth/APIAuthRepository.swift:~529`)
- Keychain 서비스 `stonefive.chalkak`, 계정 `user-id`, `access-token`, `expires-at-epoch-seconds`, `refresh-token`, `refresh-token-expires-at-epoch-seconds`.
- 게스트 플래그는 UserDefaults. 인증 세션 = userId + 미만료 refresh token.

### 3.3 errorCode → 메시지/동작
iOS는 실제로 errorCode 분기를 3개만 사용하고, 나머지는 HTTP 상태와 엔드포인트별 한글 문구로 처리한다. 새 플랫폼은 서버 errorCode 표를 별도로 작성해야 한다 (`docs/business-rules`, 백엔드 참고).

| errorCode / 상태 | iOS 동작 | 근거 |
|---|---|---|
| `UNAUTHORIZED` (401) | refresh 1회 후 재시도 | AuthenticatedHTTPClient |
| `REAUTHENTICATION_REQUIRED` | 세션 삭제, 로그인 화면 | AuthenticatedHTTPClient |
| `SIGNATURE_PROCESSING_PENDING` | 가입 재시도 최대 10회, 1초 간격 | APIAuthRepository |
| 401 (일반) | 화면별: 로그인 화면 복귀 또는 "로그인이 필요해요." | 각 Repository |
| 403 | 업로드 진입 "이용이 정지되어...", AI "이용이 제한되어...", 사인 "사용할 수 없는 사인이에요" | PhotoUpload, AIReview, Settings |
| 404 | 알림 "더 이상 확인할 수 없는 알림이에요", 게시물 "게시물을 찾을 수 없어요", 업로드 진입 "지금 참여할 수 있는 주제가 없어요.", 사인 업로드 404 | 각 화면 |
| 409 | AI 리뷰 요청 충돌 시 GET 재조회(피드만), 게시물 생성은 메시지 문자열로 분기 | FeedAIReviewViewModel, PhotoUploadAPIRepository |
| 400 | 피드백은 서버 메시지 표시, 사인/제목 수정은 화면별 문구 | Feedback, Settings, Feed |
| URLError | "네트워크 연결을 확인해 주세요." 계열 | 공통 |

### 3.4 빌드 설정 키 (값은 기재하지 않음)
- Info.plist 키: `API_BASE_URL`, `GOOGLE_IOS_CLIENT_ID`, `GOOGLE_SERVER_CLIENT_ID`, `GOOGLE_REVERSED_CLIENT_ID`, `KAKAO_NATIVE_APP_KEY`. `App.xcconfig`가 git에서 제외된 `Secrets.xcconfig`를 include.
- URL 스킴: `kakao$(KAKAO_NATIVE_APP_KEY)`, 구글 reversed client id. Firebase 설정 plist(파일명만).
- Entitlements: `aps-environment`(현재 development), Sign in with Apple.
- 기본 base URL: API 클라이언트 다수가 개발 서버 URL을 코드에 폴백으로 하드코딩(`PhotoUploadAPIConfiguration.development`, `ContentView.swift:~1037,1066,1074`). `APIAuthRepository`는 폴백 없이 "API 설정을 확인해 주세요." 구성 오류.

### 3.5 디자인 시스템 (참고)
- 색: background 0xF7F6F3, textPrimary 0x2B2724, error 0xBA1A1A.
- 간격: xs 4 / sm 8 / md 12 / lg 16 / xl 24 / xxl 40 / screenHorizontal 25.
- 폰트: Pretendard(regular, semibold, bold), Continuous(브랜드), GriunXHangeulBanguri(손글씨).
- 모서리: small 7 / button 12 / input 14 / photoCard 12 / large 16 / xlarge 18.

### 3.6 디버그 실행 인자 (DEBUG 한정)
`-test-home-preview`, `-test-photo-upload-entry`, `-test-feedback-entry`, `-show-onboarding*`, `-test-home-hero-state`, `-test-home-banner-state`.

## 4. 기존 테스트

### 4.1 파일별 개수 요약 (총 약 425개 단위 + UI 24개)
AIReviewAPIClientTests 11, APIAuthRepositoryTests 3, AppVersionGateTests 7, AuthenticatedHTTPClientTests 7, BannerAPIClientTests 8, BottomBarIconTests 1, ChalkakToastTests 1, DisplayFeatureTests 35, FeedAIReviewRenderingTests 2, FeedAIReviewTests 9, FeedAPIClientTests 3, FeedFeatureTests 19, FeedZoomRenderingTests 10, FeedbackFeatureTests 11, HomeAIReviewTests 16, HomeFeatureTests 24, IssueWebNavigationPolicyTests 5, LegacyDailyReminderCleanupTests 2, LoginViewModelTests 4, NotificationInboxTests 14, NotificationSettingsTests 31, OnboardingFeatureTests 9, PhotoEditFeatureTests 41, PhotoUploadFeatureTests 33, PushNotificationTests 23, RecordFeatureTests 18, RemoteImageCacheTests 3, SettingsScreenTests 20, TodayFeatureTests 15, TodayImagePipelineTests 1, WaitUntilTests 4, chalkakTests.swift 11. UI 테스트: HomeScreenUITests 9, chalkakUITests 14, LaunchTests 1.

### 4.2 테스트가 없는 기능
- `KakaoLoginClient`, `GoogleLoginClient`, `AppleLoginClient` (LoginViewModel은 fake로만 검증).
- `AppStoreVersionChecker.check()` 네트워크 경로(파싱과 국가코드만 검증).
- ContentView 라우팅, 게스트 게이트, 푸시 탭 내비게이션 통합.
- 알림 권한 프롬프트 UI(`resolve` 로직만 검증).
- `PhotoLibraryImageSaver`, `LegalDocumentWebView`, `RecordCalendarImageSaver`.
- Feed 화면의 삭제/수정 UI, NotificationDetail 화면 UI.
- Today 기능은 데드 코드(Features/Today 밖 참조 없음)인데도 테스트가 있음.

### 4.3 파일별 테스트 목록 (각 한 줄)
(아래 4.3 절 이하에 자동 생성 목록 첨부. 줄 번호는 각 테스트 파일 기준.)

## 5. iOS 고유 사항, Android와 달라질 수 있는 점, 명백한 버그

### 5.1 명백한 버그/불일치
1. 홈 히어로 `rejected` 상태가 `HomeViewModel`에서 생성되지 않음. `loadHero`에서 REJECTED 기록이 `guard record.status == .approved else { return .error }`(~392)로 떨어져 "사진 상태를 불러오지 못했어요"가 표시됨. 반려 UI는 프리뷰와 UI 테스트에서만 사용.
2. 제목/캡션 길이를 grapheme 기준으로 계산(`FeedTitleEditDialog.swift:~71`, `PhotoUploadViewModel.swift:~95,378`)하나 규칙 POST-005는 코드포인트 기준. 이모지 조합 문자는 클라이언트 통과 후 서버에서 실패할 수 있음. 피드백은 올바르게 unicodeScalars 사용.
3. 게시물 생성 오류를 errorCode가 아니라 서버 한글 메시지 정확 일치로 분기(`PhotoUploadAPIRepository.swift:~179,202`). 서버 문구가 바뀌면 깨짐.
4. 홈 AI 리뷰가 피드와 불일치: 폴링 5초 vs 3초, 용어 "AI 리뷰" vs "AI 피드백", 409 후 GET 재조회 없음, 403 전용 문구 없음. devwiki `feature-map.md`는 3초로 기술.
5. 전시 탭이 게스트를 막지 않음. 게스트가 Feed에서 좋아요를 누르면 서버 401 → "좋아요를 변경하지 못했어요". 홈은 로그인 안내를 띄움. 또한 전시 좋아요는 비낙관적, 피드 좋아요는 낙관적.
6. 알림 시각만 기기 로컬 시간대, 나머지는 KST.
7. `markAllRead` 구현만 있고 UI 미연결. Today 기능은 데드 코드.
8. `APIAuthRepository`만 개발 서버 폴백이 없음(다른 클라이언트는 하드코딩 폴백).
9. `GET posts/today`가 isPosted=true + REJECTED로 오면 `invalidResponse`로 처리되어 일반 실패 문구 표시 [추정: POST-011상 발생하지 않아야 함].
10. 로그아웃 시 푸시 기기 해제 호출이 없음 [추정].
11. 편집 결과를 JPEG q1.0 → WebP로 이중 손실 인코딩.

### 5.2 iOS 전용 동작 (Android와 달라질 수 있음)
- 버전 게이트: iTunes lookup + Storefront 국가 사용(iOS 전용). major/minor만 비교.
- 카메라 전에 사진 추가 권한을 선요청, PHPicker는 권한 불필요. Android는 저장 권한 요구 여부가 다름.
- 푸시: APNs 토큰 수동 전달, FCM 토큰 등록. Android는 알림 채널과 Android 13 `POST_NOTIFICATIONS` 런타임 권한이 별도.
- 서명 PNG 1024x512, 백엔드 제한 1 MiB.
- 홈 AI 폴링 5초, 피드 3초(문서 기준은 3초).
- `firstTopicDate` 2026-09-17 하드코딩 (모든 플랫폼에서 동일 값 필요).
- 레거시 일일 리마인더 정리 코드는 iOS 전용.
- 소셜 로그인 버튼 3종 노출은 App Store 심사 규정(Sign in with Apple) 때문일 수 있음 [추정]. 새 플랫폼은 카카오만, Apple/Google은 보류.
- `aps-environment`가 development로 되어 있음. 배포 서명에서 치환될 것으로 보임 [추정].
- 사용자 앱 로컬라이제이션 없음, 문자열은 코드에 한글로 직접 작성 [추정].

### 5.3 미구현(참고)
- `GET /users/{userId}/posts`(작가 공개 게시물)와 토픽 목록 `GET /topics`는 iOS에 구현이 없음.


#### `AIReviewAPIClientTests.swift`

- L10: 조회와 요청은 같은 게시물 경로와 인증을 사용하며 본문을 보내지 않는다
- L32: 200 응답의 본문 상태와 재요청 여부를 그대로 읽는다
- L46: 완료된 응답의 점수와 피드백 및 시각을 디코딩한다
- L68: 완료 상태에 결과가 없으면 유효하지 않은 응답이다
- L79: 범위를 벗어난 점수는 유효하지 않은 응답이다
- L91: 실패한 응답은 재요청 가능 여부를 서버 값으로 읽는다
- L103: 400 응답의 사용자 안내를 변경하지 않는다
- L116: 접근 제한 HTTP 상태와 메시지를 보존한다
- L128: 알 수 없는 서버 상태는 유효하지 않은 응답이다
- L139: 취소는 통신 오류로 바꾸지 않는다
- L148: Repository는 조회와 요청을 해당 클라이언트 메서드로 전달한다

#### `APIAuthRepositoryTests.swift`

- L8: 안드로이드와 같은 회원가입 API 순서와 요청 규격을 사용한다
- L95: Apple 로그인도 공통 로그인·서명 업로드 API에 rawNonce를 전달한다
- L156: 로그아웃은 로컬 세션을 먼저 삭제하고 리프레시 토큰을 body로 보낸다

#### `AppVersionGateTests.swift`

- L7: "1.2.3" 형식을 major/minor/patch로 파싱(AppVersion)
- L14: "1.1" 처럼 2구성 버전도 허용(patch=0)
- L21: "1", "1.2.3.4", "1.two.3", "1.2.-1" 은 파싱 실패
- L26: 스토어 major/minor가 높으면 강제 업데이트
- L40: patch만 높거나 스토어가 낮으면 업데이트 불필요
- L55: App Store storefront 국가코드로 iTunes lookup URL 구성
- L75: 재조회 실패(unavailable)여도 이미 확인된 강제 업데이트 상태 유지

#### `AuthenticatedHTTPClientTests.swift`

- L7: 토큰 없이 보낸 게스트 요청의 401은 세션을 지우거나 refresh하지 않는다
- L38: 동시 401 응답은 refresh API 하나를 공유하고 새 토큰으로 원 요청을 재시도한다
- L101: 늦게 도착한 재인증 응답은 새 토큰으로 한 번 재시도하고 세션을 지우지 않는다
- L142: 새 토큰 재시도도 재인증 필요면 현재 세션을 지운다
- L181: REAUTHENTICATION_REQUIRED 응답은 세션을 지우고 refresh를 호출하지 않는다
- L210: 늦게 도착한 401은 갱신된 토큰으로 재시도하고 refresh를 반복하지 않는다
- L248: refresh API가 재인증 필요를 응답하면 세션을 삭제한다

#### `BannerAPIClientTests.swift`

- L8: 공개 배너는 기본 페이지를 인증 없이 요청하고 응답 순서와 메타데이터를 유지한다
- L43: 빈 페이지와 지정한 페이지 인자를 그대로 처리한다
- L63: hasNext 필드가 없으면 마지막 페이지로 처리한다
- L74: HTTP 오류는 인증 갱신이나 재요청 없이 반환한다
- L89: 잘못된 JSON과 안전하지 않은 배너 URL은 잘못된 응답으로 처리한다
- L104: 잘못된 썸네일 URL은 배너를 유지하고 이미지 대체 표시를 사용한다
- L123: 연결 실패는 네트워크 오류로 전달한다
- L133: 취소된 요청을 네트워크 오류로 바꾸지 않는다

#### `BottomBarIconTests.swift`

- L7: 모든 탭은 선택 여부에 맞는 에셋을 사용한다

#### `ChalkakToastTests.swift`

- L8: 토스트 위치가 바텀바 유무와 무관하게 화면 기준 유지(렌더링)

#### `DisplayFeatureTests.swift`

- L7: 기본 상태는 로딩이며 날짜 이동을 막는다
- L21: topics의 canonical 날짜로 최신 상태를 확정한다
- L43: 과거 전시는 popular 고정이며 최신으로 돌아오면 기존 정렬을 복원한다
- L70: 정렬 변경 중에는 기존 사진을 유지하고 재선택하면 정렬별 캐시를 즉시 보여준다
- L142: 캐시된 다음 페이지는 첫 페이지 재검증 뒤에도 유지한다
- L185: 랜덤 첫 페이지 재검증은 같은 시드의 꼬리만 유지한다
- L242: 피드 복귀 재검증은 랜덤 시드와 페이지 꼬리를 유지하고 다음 페이지에도 같은 시드를 쓴다
- L289: 이전 날짜 404는 성공 콘텐츠를 복원하고 최초 전시일을 바꾸지 않는다
- L314: 첫 주제 날짜에서는 이전 날짜로 이동하지 않는다
- L337: 고른 날짜로 이동하면 첫 주제 날짜와 오늘 사이로 맞춰 과거 전시를 불러온다
- L365: 지금 날짜를 고르면 다시 불러오지 않는다
- L383: 건너뛴 날짜 404는 성공 콘텐츠를 복원하고 최초 전시일을 바꾸지 않는다
- L405: 네트워크 날짜 실패는 경계를 만들지 않고 성공 콘텐츠를 복원한다
- L427: 초기 실패는 요청 날짜를 유지한 오류 상태가 된다
- L443: 탭 재검증은 기존 전시를 유지하고 성공한 최신 값으로 교체한다
- L490: 탭 재검증 실패는 기존 전시를 유지한다
- L515: 같은 날짜의 지난 전시를 다시 불러오면 보던 추천 카드 페이지를 유지한다
- L546: 다른 날짜로 이동하면 추천 카드 페이지를 처음으로 되돌린다
- L577: 탭 재검증 중에는 다음 페이지를 요청하지 않는다
- L625: 랜덤 다음 페이지는 시드를 재사용하고 ID를 페이지 경계에서 제거한다
- L672: 이전 generation의 느린 응답은 최신 상태를 덮지 않는다
- L697: 좋아요 성공은 서버 응답 count를 목록과 featured에 반영한다
- L727: 좋아요 실패는 현재 상태를 보존하고 실패 이벤트를 낸다
- L750: 진행 중인 같은 사진 좋아요는 중복 요청하지 않는다
- L781: 재검증 응답이 늦게 와도 완료된 좋아요 상태를 덮지 않는다
- L871: 첫 해와 마지막 해는 범위 안의 월만 고를 수 있다
- L879: 첫 달은 첫 주제 날짜부터, 마지막 달은 오늘까지, 그 사이 달은 말일까지 고를 수 있다
- L888: 그 달에 없는 날은 말일로, 범위 밖 날짜는 범위 끝으로 맞춘다
- L904: topics의 canonical 날짜로 posts를 pageSize 20과 요청하고 이미지 4종 및 likeCount를 매핑한다
- L940: random 첫 페이지 재조회도 기존 시드를 posts 요청에 전달한다
- L961: random 다음 페이지는 seed를 전달한다
- L987: 인증 토큰이 있으면 posts 요청에 Authorization을 붙인다
- L1011: 좋아요 등록은 PUT과 Authorization으로 Feed 좋아요 API를 호출한다
- L1031: 좋아요 취소는 DELETE로 Feed 좋아요 API를 호출한다
- L1051: 404와 seed 없는 random 연속 페이지를 구분한다

#### `FeedAIReviewRenderingTests.swift`

- L7: Feed 관련 모델이 Task-local 환경에서도 즉시 해제됨(iOS 26.2 deinit 크래시 회피 회귀)
- L28: AI 리뷰 알림으로 진입하면 AI 피드백 시트가 자동으로 열림(렌더링)

#### `FeedAIReviewTests.swift`

- L7: 피드 진입은 상태만 조회하고 분석 시작은 명시적인 요청에만 수행한다
- L25: 실패 후 재요청은 서버가 허용한 경우만 가능하다
- L40: 실패 버튼과 이유는 재요청 가능 여부와 날짜에 따라 달라진다
- L61: 재진입 시 완료 결과를 GET으로 갱신하고 자동 요청하지 않는다
- L81: 요청 응답을 기다리는 동안 중복 POST를 차단한다
- L104: 화면을 나간 뒤 도착한 GET 응답을 무시한다
- L121: 5분 이후 폴링 GET을 멈추고 재진입 시 GET을 재개한다
- L147: 수동 갱신 이후 도착한 이전 폴링 응답은 완료 결과를 덮어쓰지 않는다
- L186: 이전 날짜는 완료된 결과만 표시하고 새 분석이나 재요청을 허용하지 않는다

#### `FeedAPIClientTests.swift`

- L7: trailing slash가 없는 base URL에서도 상세 요청 경로를 유지한다
- L35: 게시물 제목 수정은 PUT과 정규화된 제목을 전송한다
- L68: 빈 제목 수정은 null을 전송한다

#### `FeedFeatureTests.swift`

- L8: 뒤로 드래그 중 상하 움직임에 섞인 가로 흔들림은 축소 진행도를 바꾸지 않는다
- L26: 느린 가로 드래그와 반대 방향 이동은 계속 반영한다
- L39: 세로 방향으로 손을 떼는 속도는 뒤로가기 완료 거리로 계산하지 않는다
- L51: 기본 상태는 로딩이며 좋아요가 비활성화된다
- L64: 상세 조회 중 완료된 좋아요의 성공 응답을 상세 응답이 덮어쓰지 않는다
- L107: 전시 시드는 상세 확정 전까지 좋아요를 막고, 확정 후 허용한다
- L130: 내 게시물만 삭제 요청을 보내고 완료 상태를 기록한다
- L166: 삭제 실패를 사용자에게 알리고 다시 시도할 수 있다
- L197: 내 게시물 제목 수정은 공백을 제거하고 완료 상태를 반영한다
- L234: 지난 주제의 내 게시물은 제목 수정 요청을 보내지 않는다
- L259: 상세 응답이 늦게 도착해도 조회 중 수정한 제목을 유지한다
- L292: 기록에서 들어온 FeedTarget은 상세 응답 후에도 내 게시물로 유지된다
- L365: 등록이 누락된 그리드 사진도 탭 좌표와 가림 영역을 즉시 전달한다
- L380: 출발 viewport가 없는 기록 사진도 이동 경로에서 잘리지 않는다
- L391: 출발 셀이 사라져도 선택 순간의 전환 좌표가 유지된다
- L404: 화면 영역 측정 전에도 클립 구조를 유지하며 사진 전체를 포함한다
- L411: 전환 클립을 해제한 핀치 사진이 잘리지 않는다
- L422: 그리드 재배치 중 이전 셀이 사라져도 새 출발 위치를 유지한다
- L438: 정사각형에서 세로·가로 사진까지 크롭 경계가 연속적으로 이동한다

#### `FeedZoomRenderingTests.swift`

- L7: (렌더링) 비율 전환 중 사진 레이아웃 크기 고정
- L35: (렌더링) 뒤로가기 스와이프를 잡고 있는 동안 사진·사인 정지
- L39: (렌더링) 스와이프 지오메트리가 컨테이너 원점과 무관
- L116: (렌더링) 짧은/긴/빈 제목의 Feed 제목 행 표시("무제" 등)
- L196: (렌더링) 추천 카드 클립이 비율별로 모서리 유지
- L215: (렌더링) 추천 카드 클립 스케일/마스크 해제
- L231: (렌더링) 핀치 줌 시 손가락 아래 지점 유지
- L244: (렌더링) 닫히는 사진이 헤더·바텀바 뒤에 위치
- L276: (렌더링) 출발 viewport가 바를 제외하되 사진 경계 불변
- L287: (렌더링) 추천 사진이 fit된 이미지 경계 사용

#### `FeedbackFeatureTests.swift`

- L9: 앞뒤 공백을 제외한 내용이 있을 때만 제출할 수 있다
- L19: 내용 길이는 백엔드와 같이 Unicode code point 기준으로 계산한다
- L36: 제출 시 앞뒤 공백을 제거한 내용만 핸들러에 전달한다
- L53: 공백만 있는 내용은 제출 핸들러를 호출하지 않는다
- L69: 인증 만료 오류는 재인증 이벤트로 변환한다
- L84: 400 오류는 서버 메시지를 사용자 메시지 이벤트로 전달한다
- L108: 피드백 제출은 POST, JSON body, 인증 헤더를 사용한다
- L136: 400 응답은 서버 오류 메시지를 포함한 HTTP 오류로 변환한다
- L156: 401 응답은 인증 오류로 변환한다
- L171: 잘못된 내용은 네트워크 요청 전에 거부한다
- L223: 피드백 화면은 iPhone 크기로 렌더링된다

#### `HomeAIReviewTests.swift`

- L7: 홈 복귀 시 같은 게시물의 완료 결과를 재조회 없이 유지한다
- L25: 홈 복귀 시 처리 중 결과를 표시한 채 상태 조회를 재개한다
- L50: 게시물이 달라지면 이전 완료 결과를 지우고 새 결과를 조회한다
- L75: 첫 GET의 NONE 상태로 요청 가능 여부를 결정한다
- L90: POST 응답의 PROCESSING에서 GET 폴링으로 완료된다
- L115: 반복 폴링 실패는 메시지 없이 재시도하고 복구 후 완료된다
- L144: 첫 조회 실패는 오류 메시지를 표시한다
- L157: 폴링 중 404는 메시지 없이 조회 불가 상태로 바꾸고 추가 조회를 막는다
- L178: 실패 리뷰의 재요청은 서버 canRequestAgain 값으로 제한한다
- L195: POST 진행 중 중복 탭은 추가 POST를 보내지 않는다
- L217: 400 메시지를 그대로 유지하며 자동 재요청하지 않는다
- L239: POST 응답 유실은 GET으로 확인하며 POST를 자동 반복하지 않는다
- L258: 5분 제한은 화면 진입 시각부터 계산하며 시간 초과도 PROCESSING이다
- L282: 화면 작업 취소 후 도착한 GET은 상태를 갱신하지 않는다
- L298: 화면 작업 취소 후 별도 POST 작업의 늦은 완료 응답도 무시한다
- L321: 게시물 변경 이후 이전 GET 응답은 새 게시물 상태를 덮어쓰지 않는다

#### `HomeFeatureTests.swift`

- L7: 주는 일요일부터 토요일까지 계산하며 연말 경계를 넘는다
- L23: 서울 자정의 요일은 UTC 전날이 아닌 주제 날짜와 일치한다
- L35: Asia Seoul 기준 날짜 변경은 홈 상태 날짜를 바꾼다
- L65: 인기 섹션은 서버 순서를 유지하며 상위 5개만 노출한다
- L82: 비로그인 사용자는 개인 기록 API를 호출하지 않는다
- L101: PENDING 기록은 상세 API 없이 썸네일과 대기 상태로 표시한다
- L124: APPROVED 상세 조회 실패는 달력 썸네일로 폴백한다
- L148: 달력에 없지만 오늘 업로드가 VALIDATING이면 처리 중으로 표시한다
- L172: 오늘 주제가 없다는 404는 참여 불가 상태로 표시하고 일반 오류와 구분한다
- L188: 오늘 주제 조회 404는 주제와 오늘 인기 섹션을 빈 ready 상태로 둔다
- L205: 랭킹 실패는 다른 섹션 로딩 결과를 유지한다
- L222: 취소된 로딩 결과는 현재 상태를 덮어쓰지 않는다
- L244: 게스트도 최신 배너를 조회하며 랭킹 실패와 독립적으로 표시한다
- L260: 최초 배너 조회 실패는 다른 홈 섹션에 영향을 주지 않는다
- L275: 새로고침 실패는 기존 배너를 유지하며 빈 성공 응답은 기존 배너를 제거한다
- L295: 취소 이후 도착한 배너 응답은 상태를 덮어쓰지 않는다
- L311: 배너는 10개씩 누적하며 마지막 페이지 이후와 로딩 중에는 중복 요청하지 않는다
- L336: 배너 추가 조회 실패 후 같은 페이지를 재시도하고 중복 항목을 제거한다
- L357: hasNext가 false이거나 빈 목록이면 다음 페이지를 요청하지 않는다
- L374: 빈 추가 페이지는 기존 목록을 유지하고 페이지 조회를 종료한다
- L390: 새로고침은 누적 배너를 교체하고 다음 페이지를 2부터 다시 조회한다
- L408: 취소 후 늦게 도착한 추가 배너는 적용하지 않는다
- L426: 새로고침 후 도착한 이전 추가 배너는 새 목록을 덮어쓰지 않는다
- L526: 홈에서 인기 더보기로 진입하면 첫 페이지를 popular 정렬로 요청한다

#### `IssueWebNavigationPolicyTests.swift`

- L10: 최초 이슈만 웹뷰에서 열고 이후 자동 이동과 새 창은 차단한다
- L19: 일반 링크와 새 탭 링크 클릭은 외부로 전달한다
- L27: 같은 문서의 앵커만 웹뷰에서 이동하며 새 탭 앵커는 외부로 전달한다
- L39: 웹 주소가 아닌 링크는 실행하지 않는다
- L45: 하위 프레임은 앱 밖으로 링크를 열지 않는다

#### `LegacyDailyReminderCleanupTests.swift`

- L7: 시간 알림 예약과 표시 기록만 제거하고 다른 알림과 설정은 보존한다
- L28: 이전 예약이 없어도 반복 정리할 수 있다

#### `LoginViewModelTests.swift`

- L7: Google ID 토큰을 백엔드 로그인 요청으로 전달한다
- L25: 신규 사용자는 회원가입 필요 상태가 된다
- L43: 게스트 계속하기가 게스트 접근 허용 상태가 된다
- L59: navigation 완료 후 로그인 상태를 초기화하면 다시 제출할 수 있다

#### `NotificationInboxTests.swift`

- L7: 새로고침과 다음 페이지 조회는 중복 알림을 제거하고 페이지를 이어 붙인다
- L27: 다음 페이지 실패는 기존 목록과 페이지를 유지하고 재시도할 수 있다
- L50: 찾을 수 없는 알림의 읽음 실패는 목록을 새로고침하고 이동을 막는다
- L72: 네트워크 읽음 실패는 읽지 않은 상태를 보존하되 이동은 허용한다
- L93: 이미 읽은 알림의 반복 읽음은 기존 읽은 시각을 유지한다
- L113: 겹친 새로고침은 늦게 끝난 이전 응답을 버리고 다음 페이지 기준을 유지한다
- L191: 목록 조회는 페이지 쿼리를 보내고 UTC 날짜와 null 필드를 디코딩한다
- L257: 미읽음 상태 조회는 unread-status 응답을 반환한다
- L272: 전체 읽음은 read-all로 PATCH 204를 보낸다
- L288: 단건 읽음 404는 notFound로 매핑한다
- L300: 공지 상세는 회원 알림 ID로 조회하며 사진과 반려 사유 없이 본문 전문을 유지한다
- L515: 공지 알림함 항목은 회원별 알림 ID로 공지 상세를 연다
- L530: AI 결과 알림함도 같은 게시물 피드로 연결한다
- L543: AI 결과 알림의 대상이 잘못되면 피드로 이동하지 않는다

#### `NotificationSettingsTests.swift`

- L7: 미결정 사용자는 앱 안내 없이 시스템 권한창만 표시한다
- L14: 이미 허용하거나 거부한 사용자는 앱 안내를 표시한다
- L23: 한 번 안내한 뒤에는 권한 상태와 관계없이 다시 표시하지 않는다
- L34: OS에서 차단한 상태에서 켤 때만 시스템 설정으로 이동한다
- L48: 최초 안내의 허용·거부는 세 설정을 한 요청으로 저장한다
- L71: 최초 안내 선택 저장 실패는 성공으로 처리하지 않는다
- L82: 오늘 주제 알림 변경은 주제 설정만 부분 수정한다
- L96: 승인·반려 알림 변경은 검수 설정만 부분 수정한다
- L110: AI 피드백 알림 변경은 AI 설정만 부분 수정한다
- L128: AI 저장 실패는 성공한 다른 설정을 유지하고 중복 저장을 막는다
- L163: 저장 도중 계정이 바뀌면 이전 계정 설정을 적용하지 않는다
- L180: 같은 항목 저장 중 중복 요청은 한 번만 전송된다
- L199: 주제 저장 중 검수 토글은 비활성화되지 않고 독립적으로 저장된다
- L219: 검수 저장 중 주제 토글은 비활성화되지 않는다
- L235: 저장 실패 시 기존 토글로 복구하고 토스트용 오류를 전달한다
- L250: 저장 응답 전에도 주제 토글을 즉시 반영한다
- L265: 검수 저장 실패는 다른 토글의 성공한 변경을 되돌리지 않는다
- L284: 주제 저장 실패도 검수 토글의 성공한 변경을 유지한다
- L301: 저장 취소는 토글을 복구하되 오류 토스트를 표시하지 않는다
- L318: reset 이후 늦게 끝난 조회 결과는 적용하지 않는다
- L333: reset 이후 늦게 끝난 저장 결과는 이전 계정 상태를 복원하지 않는다
- L348: 재조회 실패 시 오래된 서버 값으로 설정을 변경하지 않는다
- L362: 조회 실패 시 토글을 사용할 수 없고 재시도할 수 있다
- L380: GET은 인증된 notification-settings 경로를 호출한다
- L397: 주제 알림 PATCH는 주제 설정만 보내고 204를 성공 처리한다
- L411: 검수 알림 PATCH는 검수 설정만 보낸다
- L424: AI 피드백 알림 PATCH는 AI 설정만 보낸다
- L438: GET에서 꺼진 AI 설정을 그대로 불러온다
- L447: PATCH는 204 본문 없는 응답을 반환한다
- L455: 401은 인증 만료 오류로 변환한다
- L461: GET에서 필드가 없거나 null이면 invalidResponse다

#### `OnboardingFeatureTests.swift`

- L7: 전체 동의는 필수 약관을 모두 선택한다
- L18: 전체 동의가 선택된 상태에서 다시 누르면 필수 약관을 모두 해제한다
- L32: 필수 약관 중 하나라도 해제되어 있으면 다음으로 진행할 수 없다
- L43: 사인 좌표는 캔버스 영역 안으로 보정된다
- L51: 비어 있는 획은 사인이 있는 상태로 취급하지 않는다
- L58: 포인트가 있는 획은 사인이 있는 상태로 취급한다
- L69: 안드로이드와 동일한 법률 문서 주소를 사용한다
- L81: Notion HTTPS 링크만 문서 시트 안에서 연다
- L99: 회원가입 중 화면이 사라지면 작업을 취소하고 뷰 모델을 해제한다

#### `PhotoEditFeatureTests.swift`

- L13: 만들기만 해서는 렌더링하지 않고, start를 여러 번 불러도 미리보기 원본과 자동 보정값은 한 번만 준비한다
- L34: 완료하면 선택한 필터를 원본 크기로 한 번만 렌더링하고 편집 상태를 함께 전달한다
- L64: 취소하면 원본 크기 렌더링 없이 취소 이벤트만 보낸다
- L83: 자르기를 마치면 잘린 이미지로 미리보기와 썸네일을 다시 만들고 선택한 필터를 다시 적용한다
- L125: 자르기 탭은 필터를 적용한 원본을 보여 주고 이전 자르기 상태를 복원한다
- L159: 비율을 고를 때마다 이전 자르기 영역을 버리고 전체 이미지에서 다시 시작한다
- L194: 반전은 Mantis 화면을 다시 만들지 않고 방향만 기록하며 반전한 원본을 미리 만든다
- L217: 회전하면 돌린 원본으로 새로 시작하고 비율도 함께 돌리며, 준비되기 전에는 지금 화면을 유지한다
- L264: 돌린 원본을 준비하는 동안 반전하면 반전까지 적용한 원본으로 새로 시작한다
- L310: 비율을 고르면 반전까지 적용한 원본으로 새로 시작한다
- L328: 자르기 결과에는 Mantis에 넘긴 이미지 방향과 화면의 최종 방향을 함께 남긴다
- L349: 필터 화면에서 취소하면 들어가기 전 필터로 되돌린다
- L366: 자르기 화면에서 취소하면 회전·비율 변경을 버리고 이전 자르기를 유지한다
- L393: 자동 보정을 켜면 분석한 값이 항목마다 강도만큼 채워지고 미리보기·썸네일·완료 렌더링에 적용된다
- L453: 조정 화면에서 취소하면 들어가기 전 강도와 항목 값으로 되돌리고, 고른 자동 보정을 다시 누르면 끈다
- L480: 자동 보정보다 낮춘 값은 강도를 바꾸거나 자동 보정을 꺼도 그대로이고, 자동 보정 몫으로 되돌리면 다시 자동 보정을 따른다
- L517: 자르기를 마치면 자른 사진으로 자동 보정값을 다시 구한다
- L535: 도구 화면이 열려 있으면 편집 완료와 취소를 받지 않는다
- L551: 고정 비율은 세로·가로 짝을 모두 제공한다
- L575: 자르기 화면은 사진이 보이는 크기에 손잡이 여백만 더한 크기다
- L585: 반전한 상태에서 회전하면 원본 기준 회전 방향이 반대가 된다
- L602: 렌더링에 실패하면 화면을 닫지 않고 실패를 안내한다
- L649: 고른 사진을 줄여 새 편집 상태로 편집 화면에 넘긴다
- L671: 처음 고른 사진의 편집을 취소하면 사진 선택도 취소한다
- L697: 편집을 마치면 편집한 사진을 JPEG로 넘겨 업로드 준비를 시작한다
- L729: 사진을 탭하면 이전 편집 상태로 다시 편집하고 취소하면 이전 결과를 유지한다
- L763: 다시 편집을 마치면 이전 사진의 업로드 준비를 취소하고 새 사진을 준비한다
- L818: 편집 화면 없이 바로 고른 사진은 다시 편집할 수 없다
- L848: 긴 변을 4096 이하로 줄인다
- L860: EXIF 회전 정보가 있는 사진을 방향이 반영된 .up 이미지로 만든다
- L898: 필터를 적용해도 원래 크기를 유지한다
- L908: 미리보기 크기를 지정하면 긴 변을 그 크기로 줄인다
- L918: 흑백 필터는 모든 픽셀의 R, G, B 값을 같게 만든다
- L933: 자동 보정은 대비가 낮고 뜬 사진의 블랙 포인트·대비·노출을 올려 밝기 범위를 넓힌다
- L949: 밝기가 고르게 퍼진 사진은 여러 항목을 조금씩만 바꾸고, 흑백 사진에는 채도를 올리지 않는다
- L971: 채도는 색과 상관없이 같은 기준으로 센다
- L980: 피부색은 밝거나 어두워도 피부색으로 보고 하늘·풀·노을·회색은 아니다
- L990: 피부색 사진은 채도를 올리지 않고 하늘·풀 사진은 올린다. 일부만 피부색이면 그 비율만큼 덜 올린다
- L1012: 톤 곡선은 어떤 조합에서도 0에서 시작해 1로 끝나고 줄어들지 않는다
- L1034: 따뜻함을 올리면 회색 사진의 빨강이 파랑보다 커진다
- L1049: 반시계 방향 회전과 좌우반전을 화면에 보이는 방향대로 적용한다

#### `PhotoUploadFeatureTests.swift`

- L10: 받침이 있는 주제에는 을을 사용한다
- L17: 받침이 없는 주제에는 를를 사용한다
- L24: 주제 끝의 공백은 조사를 결정할 때 무시하고 빈 주제는 를를 사용한다
- L42: 사진이 없으면 전시하기를 비활성화한다
- L47: 사진이 준비 중이거나 실패해도 재시도 가능한 상태를 유지한다
- L58: 사진을 선택하면 이미지 준비 상태와 무관하게 Android처럼 전시하기를 활성화한다
- L65: KST 날짜를 API 및 성공 카드 표시 형식으로 변환한다
- L90: 사진 선택부터 이미지 준비, 게시물 생성까지 전체 상태 흐름을 처리한다
- L124: 촬영 사진은 업로드 전에 한 번 저장하고 전시할 때 중복 저장하지 않는다
- L156: 갤러리에서 선택한 사진은 다시 저장하지 않는다
- L172: 사진 저장 권한 거부나 실패를 안내하고 업로드할 사진은 유지한다
- L197: 업로드 화면 종료 뒤 늦게 끝난 저장 실패를 앱에 알린다
- L227: 빈 사진 데이터는 편집 화면을 띄우지 않고 실패를 안내한다
- L247: 주제 API 인증 만료는 재인증 이벤트로 변환한다
- L263: 제목 입력은 10자까지 허용하고 11자째는 잘라낸다
- L307: 사진 선택/로드 결과가 최신 선택이 아니면 무시(PhotoUploadSelectionLoader)
- L354: 게이트 정리는 대기 중인 요청과 뒤늦게 시작한 요청을 모두 취소한다
- L374: 오늘 게시물 상태가 미작성일 때 참여 주제 날짜와 nil 게시물 정보를 반환한다
- L399: 오늘 게시물 상태가 작성 완료일 때 게시물과 검수 상태를 반환한다
- L415: 미작성 응답에 게시물 정보가 포함되면 invalidResponse가 된다
- L434: 업로드 정책, presigned PUT, 게시물 생성 요청을 Android 계약대로 보낸다
- L492: topics 응답 날짜가 요청 날짜와 다르면 invalidResponse가 된다
- L550: 미작성 상태면 서버가 선택한 참여 주제 날짜로 진입을 허용한다
- L565: 작성 상태와 API 오류를 진입 차단 결과 및 토스트 문구로 변환한다
- L599: 주제 조회 HTTP 오류는 전시 완료 오류가 아닌 주제 조회 오류로 매핑한다
- L658: 업로드 화면은 iPhone 폭에서 Android와 같은 전체 레이아웃으로 렌더링된다
- L679: 선택한 사진의 원본 비율로 이미지 영역을 표시한다
- L714: 큰 사진은 Android와 같은 2의 거듭제곱 배수로 샘플링한다
- L726: 용량 제한을 넘으면 실제 이미지 크기를 줄인다
- L749: 반복 압축 후에도 용량 제한을 충족하지 못하면 실패한다
- L770: 사진을 Android 업로드 계약과 같은 WebP 데이터로 인코딩한다
- L788: 취소된 이미지 인코딩은 결과를 반환하지 않는다
- L813: 압축 도중 취소하면 결과와 관계없이 후속 압축을 중단한다

#### `PushNotificationTests.swift`

- L9: 주제 푸시는 알림 ID 없이 오늘 주제로 이동하며 읽음 ID를 갖지 않는다
- L21: 주제 푸시는 원래 주제나 알림 ID에 화면을 고정하지 않는다
- L33: 승인 푸시는 sourceId의 게시물로 이동한다
- L41: AI 완료·실패 푸시는 게시물 피드로 이동하며 알림 ID는 읽음에 사용한다
- L49: AI 푸시는 유효한 게시물·알림 ID와 POST 종류가 필요하다
- L64: 반려 푸시는 notificationId의 알림 상세로 이동한다
- L71: 공지 푸시는 공지 sourceId가 아닌 회원 알림 notificationId로 상세를 연다
- L80: 알림 ID가 없거나 올바르지 않은 공지는 상세를 열지 않는다
- L89: 알 수 없는 종류·누락된 필드·UUID가 아닌 식별자는 이동하지 않는다
- L119: 로그인 ID가 있는 JWT는 갱신 없이 현재 기기를 등록한다
- L140: 로그인 ID가 없는 이전 JWT는 먼저 갱신한 뒤 새 토큰으로 등록한다
- L163: 갱신한 JWT에도 로그인 ID가 없으면 등록을 보내지 않고 로그인도 유지한다
- L181: 만료된 액세스 토큰의 401은 갱신 후 한 번 다시 등록한다
- L206: 등록이 계속 거절돼도 기기 등록 실패만으로 로그인을 해제하지 않는다
- L231: JWT의 session_id 유무를 구분한다
- L310: 로그인하지 않은 상태에서는 FCM 토큰이 있어도 등록하지 않는다
- L325: 토큰이 바뀌면 마지막 토큰으로 다시 등록한다
- L341: 전달받은 토큰이 없으면 현재 FCM 토큰을 조회해 등록한다
- L355: FCM 토큰이 준비되지 않았으면 등록을 건너뛴다
- L372: 상세를 불러오면 사진과 반려 사유를 보여준다
- L389: 찾을 수 없는 알림은 이전 정보를 대신 보여주지 않는다
- L401: 그 밖의 실패는 다시 시도할 수 있는 상태로 둔다
- L506: 주제 푸시 클릭을 보관하고 한 번만 소비한다

#### `RecordFeatureTests.swift`

- L8: 탭 재검증은 기존 기록을 유지하고 성공한 최신 값으로 교체한다
- L40: 탭 재검증 실패는 기존 기록을 유지한다
- L63: 현재 달은 월 목록 응답에 없어도 활성 연월에 포함한다
- L86: 고른 달로 이동하고, 기록 없는 달이나 지금 달은 다시 불러오지 않는다
- L111: 연도를 바꾸면 그 해의 기록 달 중 가장 가까운 달을 고른다
- L124: 현재 달의 마지막 게시물을 지워도 현재 달은 활성 연월에 남는다
- L146: 홈에서 선택한 이전 월 날짜를 최신 사진보다 우선 선택하고 재검증에도 유지한다
- L168: 주간 기록의 선택 날짜가 삭제됐다면 다른 날짜의 사진을 대신 열지 않는다
- L181: 주간 기록 조회 실패 후 재시도에도 요청 날짜를 선택한다
- L200: 화면을 벗어나 첫 조회가 취소되면 오류 대신 로딩으로 남고 다시 나타날 때 불러온다
- L229: 기록을 본 뒤 주간 기록에서 열면 같은 뷰모델로 그 달과 날짜를 연다
- L252: 본 적 있는 달을 주간 기록에서 열면 응답 전에도 캐시한 기록에서 고른 날짜를 보여준다
- L279: 주간 기록에서 열어 불러오는 중이면 화면이 나타나도 같은 요청을 다시 보내지 않는다
- L304: 본 적 있는 달로 돌아오면 응답 전에도 캐시한 기록을 보여주고 최신 값으로 교체한다
- L333: 캐시한 달의 재조회가 실패하면 캐시한 기록을 유지하고 토스트를 띄운다
- L356: 처음 가는 달은 기존 기록을 비우고 로딩한다
- L383: 삭제한 게시물은 캐시한 달로 돌아와도 다시 보이지 않는다
- L407: 캐시를 보여주는 동안 사용자가 고른 날짜는 최신 값으로 교체돼도 유지한다

#### `RemoteImageCacheTests.swift`

- L7: 최대 폭보다 넓은 이미지는 비율을 유지한 채 최대 폭으로 줄여서 디코딩한다
- L17: 최대 폭보다 좁은 이미지는 원래 크기로 디코딩한다
- L27: 같은 URL이라도 최대 폭이 다르면 따로 디코딩해 캐시한다

#### `SettingsScreenTests.swift`

- L8: 로그아웃과 회원탈퇴 다이얼로그 문구 및 강조 방식을 구분한다
- L19: 회원과 게스트 설정 화면은 iPhone 크기로 렌더링된다
- L44: 로그인 사용자는 서버에서 서명 썸네일을 불러온다
- L59: 설정에 다시 진입하면 기존 사인을 유지하면서 최신 사인을 조회한다
- L90: 사인 재조회가 실패하면 기존 사인을 유지한다
- L111: 비회원은 서명 API를 호출하지 않는다
- L128: 서명 조회 실패 후 다시 로드할 수 있다
- L154: 회원탈퇴가 성공하면 로그아웃 이벤트를 보낸다
- L176: 계정 작업 실패는 로그인 상태를 유지한다
- L194: 사인 변경 전에 시작된 조회 결과는 변경 성공 후 반영하지 않는다
- L234: 사인 변경이 실패하면 진행 중이던 조회 결과를 반영한다
- L257: 서명 변경 성공 시 설정 카드 이미지를 즉시 갱신한다
- L277: 서명 조회는 안드와 같은 경로와 인증 헤더를 사용한다
- L297: 회원탈퇴는 body 없이 DELETE하고 204를 성공 처리한다
- L314: 401 응답을 인증 만료로 구분한다
- L325: URLSession 취소 오류를 CancellationError로 전달한다
- L336: 서명 변경은 발급, PNG 업로드, 적용 요청을 순서대로 수행한다
- L381: 1MB를 넘는 서명 이미지는 네트워크 요청 전에 거부한다
- L424: 설정에서 만든 사인은 투명 배경과 흰색 선으로 저장된다
- L471: 설정 약관은 회원가입과 같은 Notion 문서를 사용한다

#### `TodayFeatureTests.swift`

- L10: 기본 Today 상태는 로딩으로 시작한다
- L19: 초기 에러는 사용자에게 보여줄 문구를 제공한다
- L25: 좋아요 가능 여부의 기본값은 활성화 상태다
- L35: 콘텐츠 Today 화면은 iPhone 폭에서 렌더링된다
- L55: 새로고침은 실패한 사진 이미지를 다시 요청한다
- L114: 바텀바 선택 액션은 선택한 항목을 보존한다
- L124: 오늘 탭 재선택은 최상단 이동 요청을 발생시킨다
- L173: 비로그인 사용자가 좋아요를 누르면 게스트 안내 이벤트를 발행한다
- L191: 같은 사진의 좋아요 요청은 진행 중에 중복 실행하지 않는다
- L221: 새로고침은 랜덤 정렬 결과로 콘텐츠를 교체한다
- L246: 취소된 새로고침은 기존 콘텐츠를 유지하고 오류 토스트를 표시하지 않는다
- L264: 취소된 재시도는 이전 오류 상태를 복원한다
- L283: 끝 임계값 도달 시 다음 페이지를 한 번 추가한다
- L365: Today API는 주제의 기준 날짜로 게시물을 조회하고 응답을 화면 상태로 변환한다
- L402: 좋아요 API는 토큰과 HTTP 메서드를 전달한다

#### `TodayImagePipelineTests.swift`

- L8: 같은 홈 이미지를 동시에 요청하면 한 번만 다운로드하고 비율을 함께 반환한다

#### `WaitUntilTests.swift`

- L5: 이미 만족한 조건은 대기 시간이 없어도 성공한다
- L10: 100회 양보보다 늦게 완료되는 작업도 제한 시간 안에 기다린다
- L24: 충족되지 않는 조건은 제한 시간 후 호출 위치에 실패를 기록하고 중단한다
- L42: 취소된 대기는 시간 초과까지 반복하지 않고 취소를 전파한다

#### `chalkakTests.swift`

- L8: 문자 수보다 짧은 입력은 유지한다
- L13: 문자 수 제한을 초과한 입력을 자른다
- L18: 이모지와 조합 문자를 하나의 문자로 계산한다
- L25: 0 이하의 제한은 빈 문자열을 반환한다
- L31: code point 기준은 이모지의 scalar 수를 그대로 센다
- L38: code point 기준은 서버 검증과 같은 단위로 입력을 제한한다
- L47: 명시한 높이를 테두리와 배경에 반영한다
- L69: 입력 중 최대 글자 수를 초과한 문자는 화면에 남기지 않는다
- L147: Android와 동일한 spacing 토큰을 제공한다
- L161: Android와 동일한 shape 토큰을 제공한다
- L174: 테마가 색상·타이포그래피·spacing·shape를 함께 제공한다

#### `HomeScreenUITests.swift`

- L5: (UI) 승인된 사진에서 AI 피드백 흐름(홈)
- L10: (UI) 평면(비 Liquid Glass) 디자인에서의 AI 피드백 흐름
- L69: (UI) 홈 섹션 구성과 게스트의 사진 탭 시 로그인 안내
- L89: (UI) 탭 왕복 후 홈 스크롤 위치 유지
- L112: (UI) ISSUE 배너 탭 → 웹 화면 → 뒤로가면 홈
- L135: (UI) 배너가 비었거나 실패하면 ISSUE 섹션 숨김
- L149: (UI) ISSUE 2페이지 로드 후 마지막 페이지에서 중단
- L175: (UI) 평면 디자인 뒤로 버튼 터치 영역 전체 반응
- L192: (UI) 홈 히어로 상태(empty/loading/processing/error/no-open-topic/rejected/pending)와 재제출 진입

#### `chalkakUITests.swift`

- L26: (UI) 바텀바 스크럽 제스처: 손 뗀 위치 탭 선택, 탭 건너뛰기 가능
- L58: (UI) 선택 안 된 탭에서 스크럽 시작 가능
- L74: (UI) 같은 탭 내 스크럽은 선택 유지, "추가" 위에서 떼면 업로드 열림
- L95: (UI) 축소(compact) 바텀바 스크럽 후 확장
- L130: (UI) Xcode 템플릿 기본 예제
- L141: (UI) 약관 "보기" 버튼이 각각 해당 법률 문서 시트를 연다
- L168: (UI) 게스트가 + 버튼 누르면 로그인 필요 토스트
- L195: (UI) 게스트 설정 화면의 피드백/계정 섹션 분리
- L238: (UI) 회원이 설정에서 + → 업로드 화면 → 닫으면 설정으로 복귀
- L259: (UI) 설정에 서버 알림 토글 3개가 있고 OS 권한 행은 없음
- L279: (UI) 피드백 전체화면이 닫기 버튼/아래 스와이프로 닫힘
- L317: (UI) 입력창 드래그 시 작성 중 내용 보존
- L348: (UI) 홈 알림 아이콘 → 알림 목록 → 뒤로 홈
- L369: (UI) 앱 실행 성능 측정

#### `chalkakUITestsLaunchTests.swift`

- L21: (UI) 실행 스크린샷 템플릿