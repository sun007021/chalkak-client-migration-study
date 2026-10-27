# 찰캌 사용자 API 계약 · 비즈니스 규칙 (클라이언트 5종 공통 기준)

> 원본: `woowacourse-teams/2026-Chalkak` main(2026-10-27) 읽기 전용 분석. 경로는 원본 레포 기준이다. 정리·결정은 [`../spec/`](../spec/)가 우선한다.

작성 기준: 2026-10-27, 레포 `main`. 읽기 전용 분석 결과이며 레포는 수정하지 않았다.
범위: 사용자 API(`/api/v1/**`, admin·internal 제외). 소셜 로그인은 **카카오만** 범위, Apple/Google은 **보류**(서버는 지원하므로 표 하단에 차이만 표기).

표기: `[규칙 ID]` = `docs/business-rules/rules/*.md`, `[G:xxx]` = `docs/business-rules/guides/xxx.md`, `[코드:경로]` = `backend/src/main/java/com/chalkak/backend/` 기준 상대경로, `[OpenAPI]` = 개발서버 `/v3/api-docs`(WebFetch로 경로·메서드 목록과 일부 설명만 확인. 스키마 상세는 확인 못함), `[추정]` = 근거 없는 추측.
비밀값(키, 시크릿)은 적지 않았다.

---

## 0. 공통 규약

| 항목 | 내용 | 근거 |
| --- | --- | --- |
| Base | `/api/v1`. 사용자 API 26개 경로(OpenAPI와 서버 컨트롤러 일치 확인) | [OpenAPI], 컨트롤러 11개 |
| 인증 헤더 | `Authorization: Bearer <accessToken>` (JWT, `scope=USER`, `sub`=회원 UUID, `session_id` 클레임 포함) | [코드:auth/infrastructure/infra/token/access/JwtAccessTokenProvider.java], [코드:config/SecurityConfig.java] |
| 오류 바디 | `{ "errorCode": string, "message": string }`. `message`는 한국어 사용자용 문구 | [코드:exception/ErrorResponse.java] |
| 오류 상태 매핑 | NotFound→404, Unauthorized→401, Forbidden→403, Business→400, 그 외→500 | [코드:exception/DomainErrorHttpMapper.java] |
| 필터 단계 401/403 | 토큰 형식·서명·만료 오류는 컨트롤러 전에 `401 UNAUTHORIZED "유효하지 않은 인증 정보입니다."` + `WWW-Authenticate: Bearer`. 권한 부족은 `403 FORBIDDEN "접근 권한이 없습니다."` | [코드:auth/api/support/UnauthorizedEntryPoint.java], ForbiddenAccessDeniedHandler.java |
| 입력 검증 실패 | Bean Validation·JSON 오류·타입 불일치·필수 파라미터 누락 모두 `400 BUSINESS_ERROR`. 제약에 적은 문구가 `message`로 그대로 옴. 타입 불일치는 `필드명: 요청 값의 형식이 올바르지 않습니다.` | [코드:exception/GlobalExceptionHandler.java] |
| 잘못된 UUID 경로값 | `400 BUSINESS_ERROR "ID 형식이 올바르지 않습니다."` (소문자 정규형 UUID만 허용으로 보임) | [코드:common/util/CanonicalUuidParser.java] |
| 없는 경로 | `404 BUSINESS_ERROR "요청한 API를 찾을 수 없습니다."` | GlobalExceptionHandler |
| 예기치 못한 오류 | `500 INTERNAL_ERROR "서버에서 요청을 처리하지 못했습니다."` | 같음 |
| 본문 크기 초과 | 413 + `BUSINESS_ERROR`는 **내부 콜백 전용**. 사용자 API에서는 나오지 않음 | CallbackBodySizeLimitFilter.java |
| 시각 형식 | `Instant`는 UTC ISO-8601(예: `2026-10-20T05:00:00Z`), `LocalDate`는 `yyyy-MM-dd`. ID는 모두 UUID 문자열 | DTO, [G:ai-review] |
| 날짜 기준 | 주제 날짜·미래 날짜 판정은 KST(`Asia/Seoul`) | TOPIC-002, TOPIC-005, [코드:post/service/PostQueryService.java:41,335] |
| CORS | `cors(withDefaults)`. 웹 클라이언트 허용 오리진 설정은 이 분석에서 미확인 | SecurityConfig.java → 7절 확인 목록 |

### 0.1 회원 상태가 API에 미치는 영향 (코드의 3가지 인가 수준)

| 수준 | 어노테이션 | 의미 | 해당 API |
| --- | --- | --- | --- |
| 이용 가능 | `@RequiresUsableUser` | 탈퇴 회원 → 401 `UNAUTHORIZED`, **BANNED → 403 `FORBIDDEN` "차단된 회원입니다."** | 게시물 업로드 발급·생성·수정, `GET /posts/today`, 좋아요 등록, 사인 업로드 발급·교체, AI 리뷰 요청 |
| 존재 확인 | `@RequiresExistingUser` | 탈퇴 회원만 401. 정지 회원 허용 | 게시물 삭제·상세·캘린더, 작성자 사진 목록, 탈퇴, 사인 조회, 알림 전체, 알림 설정, 푸시 기기 등록, 피드백, 좋아요 취소, AI 리뷰 조회 |
| 비로그인 허용 | (경로 규칙) | 토큰 없음 허용. **관리자 토큰은 거절** | `GET /posts`(목록만), `GET /topics`, `GET /banners`, `/auth/**` |

근거: [코드:auth/api/support/RequiresUsableUser.java, RequiresExistingUser.java, UsableUserPolicy.java], SecurityConfig.java, USER-002.
- 정지 여부는 **토큰이 아니라 매 요청 DB 조회**로 판정한다. 정지돼도 기존 액세스 토큰은 계속 유효하고 쓰기 요청만 403이 된다. 클라이언트가 정지 상태를 로컬에 캐시하면 안 된다.
- 비로그인 허용 경로는 정확히 `GET /api/v1/posts`, `GET /api/v1/topics`뿐이다. `GET /posts/{id}`, `/posts/today`, `/posts/calendar`는 토큰 없으면 401(SecurityConfig 주석).
- 토큰을 보낸 비로그인 허용 API에서 **만료된 토큰**을 보내면 익명으로 처리되지 않고 401이 날 수 있다(BANNER-006은 "유효하지 않으면 401"로 명시. 피드/주제는 [추정] 동일). 클라이언트는 401 → refresh → 재시도 흐름을 공개 API에도 적용해야 한다.

---

## 1. 사용자 API 전체 표

공통 열 의미: 인증 = 필수(●)/선택(○)/불필요(–), 정지 = 정지 회원 허용 여부. 페이징은 **전부 오프셋(page/pageSize)** 이고 커서 방식은 없다(POST-012 "커서 입력·응답은 제공하지 않는다").

### 1.1 인증 `/auth` (모두 인증 불필요)

| 메서드 경로 | 요청 필드 (타입·필수·검증) | 응답 | 관련 규칙 |
| --- | --- | --- | --- |
| POST `/auth/social-login` | `provider` enum(`KAKAO`,`GOOGLE`,`APPLE`) 필수 · `idToken` string 필수 NotBlank · `rawNonce` string 필수 NotBlank · `authorizationCode` string nullable (**APPLE일 때만 필수, 다른 제공자가 보내면 400**) | 200. `status`: `LOGIN_SUCCESS` \| `SIGN_UP_REQUIRED`. `LOGIN_SUCCESS`일 때만 `userId`, `accessToken`, `expiresIn`(초), `refreshToken`, `refreshTokenExpiresIn`(초). `SIGN_UP_REQUIRED`는 나머지 필드가 **생략**(NON_NULL) | USER-001, USER-002, USER-005 |
| POST `/auth/social-signup/signature/uploads` | `provider`, `idToken`, `rawNonce` (위와 동일, 모두 필수). `authorizationCode` 없음 | 200. `uploadId` UUID, `uploadUrl`(S3 presigned PUT), `expiresInSeconds`(300), `signupToken`(5분 유효 JWT) | SIGN-001, SIGN-002 |
| POST `/auth/social-signup` | `signupToken` string 필수 NotBlank | 200. `userId`, `accessToken`, `expiresIn`, `refreshToken`, `refreshTokenExpiresIn` (모두 non-null) | USER-001, SIGN-001 |
| POST `/auth/refresh` | `refreshToken` string 필수 NotBlank | 200. `accessToken`, `expiresIn`, `refreshToken`(회전됨, 교체 필수), `refreshTokenExpiresIn` | [G:push-device-registration] |
| POST `/auth/logout` | `refreshToken` string 필수 NotBlank (액세스 토큰 불필요) | 204. 알 수 없는/폐기된 토큰도 204 | NOTIFICATION-005 |

근거: [코드:auth/api/v1/controller/AuthController.java, dto/**], AuthApiDocs.java.

### 1.2 회원·사인 `/users`

| 메서드 경로 | 인증/정지 | 요청 | 응답 | 규칙 |
| --- | --- | --- | --- | --- |
| DELETE `/users/me` | ● / 정지 허용 | 본문 없음 | 204 | USER-003~006 |
| GET `/users/me/signature` | ● / 허용 | – | 200 `{signatureOriginalImageUrl, signatureThumbnailImageUrl}`. 처리 실패·시간 초과면 `400 SIGNATURE_REGISTRATION_REQUIRED` | SIGN-004, SIGN-005 |
| POST `/users/me/signature/uploads` | ● / **불가(403)** | 본문 없음 | 200 `{uploadId, uploadUrl, expiresInSeconds}` (**contentType·maxBytes 필드 없음**, 아래 3.2 참고) | SIGN-002, SIGN-003 |
| PUT `/users/me/signature` | ● / **불가** | `signatureOriginalUploadId` UUID 필수 | 200 `{signatureOriginalImageUrl}` (**교체 완료 전에는 기존 사인 URL**) | SIGN-003, SIGN-004 |
| GET `/users/{userId}/posts` | ● / 허용 | 쿼리 `page` int ≥1 기본1 · `pageSize` int 1~100 기본20 (위반 시 400 "조회 조건이 올바르지 않습니다.") | 200 `{currentPage, pageSize, hasNext, posts[]}`. posts[]: `id`, `originalImageUrl`, `thumbnailImageUrl`(nullable), `topic{id,title,topicDate}`, `likeCount`(long), `isLiked`(bool). 오프셋 | POST-012, LIKE-004 |

근거: [코드:user/api/v1/controller/UserController.java], [G:author-public-posts]. 작성자가 없거나 탈퇴면 `404 BUSINESS_ERROR "작성자를 찾을 수 없습니다."`.

### 1.3 게시물 `/posts`

| 메서드 경로 | 인증/정지 | 요청 | 응답 | 규칙 |
| --- | --- | --- | --- | --- |
| POST `/posts/uploads` | ● / 불가 | 본문 없음 | 200 `{uploadId, uploadUrl, expiresInSeconds(300), contentType("image/webp"), maxBytes(5242880)}` | POST-001, POST-004 |
| POST `/posts` | ● / 불가 | `topicId` UUID 필수 · `photoUploadId` UUID 필수 · `title` string nullable (strip 후 code point ≤10, 공백만/빈값/null → 제목 없음) | **201** `{postId, moderationStatus: VALIDATING\|PENDING}` | POST-001~006 |
| PUT `/posts/{postId}` | ● / 불가 | `title` string, **키 필수**(null 허용=제목 삭제). 규칙 동일 | 200 `{postId, title(nullable)}` | (규칙 문서 없음 → 6절) |
| DELETE `/posts/{postId}` | ● / 허용 | – | 204 (이미 삭제된 것도 성공) | POST-010, LIKE-005 |
| GET `/posts` | ○ / – | 쿼리 `topicDate` yyyy-MM-dd **필수** · `sort` `recent`\|`popular`\|`random` 기본`recent`(대소문자 구분 소문자) · `randomSeed` `[A-Za-z0-9_-]{1,64}` · `page` ≥1 기본1 · `pageSize` 1~100 기본20 | 200 `{currentPage, pageSize, hasNext, randomSeed(nullable), posts[]}`. posts[]: `id`, `authorId`, `originalImageUrl`, `thumbnailImageUrl`(nullable), `signatureOriginalImageUrl`, `signatureThumbnailImageUrl`(nullable), `title`(nullable), `submittedAt`, `likeCount`, `isLiked`, `isMine`. 오프셋 | POST-007, POST-008, SIGN-005 |
| GET `/posts/today` | ● / 불가 | – | 200 `{topicDate, isPosted, postId(nullable), moderationStatus(nullable: VALIDATING\|PENDING\|APPROVED)}` | POST-011 |
| GET `/posts/calendar` | ● / 허용 | 쿼리 `year` int 1~9999 필수 · `month` 1~12 필수 | 200 `{year, month, posts[{topicDate, postId, thumbnailImageUrl, status: PENDING\|APPROVED}]}` | POST-009 |
| GET `/posts/calendar/months` | ● / 허용 | – | 200 `{months:[{year,month}]}` 최신순, 없으면 `[]` | POST-009 |
| GET `/posts/{postId}` | ● / 허용 | – | 200 `{id, authorId, topic{id,title,topicDate}, originalImageUrl, thumbnailImageUrl(nullable), signatureOriginalImageUrl, title, likeCount, isLiked}` | POST-007, POST-008 |
| PUT `/posts/{postId}/likes` | ● / **불가** | 본문 없음 | 200 `{postId, likeCount, isLiked:true}` (멱등) | LIKE-001~004 |
| DELETE `/posts/{postId}/likes` | ● / 허용 | – | 200 `{postId, likeCount, isLiked:false}` (멱등) | LIKE-001, LIKE-003 |
| POST `/posts/{postId}/ai-review` | ● / **불가** | 본문 없음 | 202(접수·재요청·진행 중) 또는 200(완료 상태 그대로). 바디는 아래 AI 리뷰 응답 | AIREVIEW-001, 002 |
| GET `/posts/{postId}/ai-review` | ● / 허용 | – | 200 AI 리뷰 응답 | AIREVIEW-003, 005 |

AI 리뷰 응답: `{status: NONE\|PROCESSING\|COMPLETED\|FAILED, requestedAt(nullable), completedAt(nullable), result(nullable), canRequestAgain(bool)}`. `result` = `{overallScore(double 0~10, 소수1자리), criteria[{key,label,score}], distinctivePerspective(bool), feedback{summary(≤60), strength(≤150), weakness(≤150), suggestion(≤150)}}`. 근거: [G:ai-review], [코드:aireview/api/v1/dto/response/PostAiReviewResponse.java].

근거 일반: [코드:post/api/v1/controller/PostController.java, dto/**, docs/PostApiDocs.java], [코드:like/**], [코드:aireview/**].

### 1.4 주제 · 배너 · 피드백

| 메서드 경로 | 인증 | 요청 | 응답 | 규칙 |
| --- | --- | --- | --- | --- |
| GET `/topics` | – (비로그인 허용) | 쿼리 `date` yyyy-MM-dd **필수** | 200 `{id, title, topicDate, startsAt(Instant), endsAt(Instant), phase: BEFORE_OPEN\|OPEN\|CLOSED}`. 없으면 404 `BUSINESS_ERROR "주제를 찾을 수 없습니다."`, 미래 날짜 400 `"미래의 주제는 조회할 수 없습니다."` | TOPIC-001~005 |
| GET `/banners` | ○ (USER·ADMIN 토큰 또는 없음) | 쿼리 `page` ≥1 기본1 · `pageSize` 1~100 기본20 · offset `(page-1)*pageSize` ≤ 2,147,483,647 (위반 400 "조회 조건이 올바르지 않습니다.") | 200 `{currentPage, pageSize, hasNext, banners[{id,title,subtitle,webViewUrl,thumbnailUrl,createdAt}]}` 등록 시각 내림차순. 오프셋 | BANNER-006 |
| POST `/feedbacks` | ● / 허용 | `content` string 필수. strip 후 1~1000 code point | **201** `{feedbackId, createdAt}` | FEEDBACK-001, 002 |

### 1.5 알림 · 푸시 `/notifications`, `/notification-settings`, `/push-devices` (전부 ● / 정지 허용)

| 메서드 경로 | 요청 | 응답 | 규칙 |
| --- | --- | --- | --- |
| GET `/notifications` | `page` ≥1 기본1 · `pageSize` 1~100 기본20 | 200 `{currentPage, pageSize, hasNext, notifications[{id, type, sourceType(nullable), sourceId(nullable), title, body, thumbnailImageUrl(nullable), readAt(nullable), createdAt}]}` 최신순, 오프셋 | NOTIFICATION-002 |
| GET `/notifications/{notificationId}` | – | 200 `{id, type, title, body, originalImageUrl(nullable), rejectionReason(nullable), readAt, createdAt}`. 조회만으로 읽음 처리 안 함 | NOTIFICATION-002, 003 |
| GET `/notifications/unread-status` | – | 200 `{hasUnread}` | NOTIFICATION-003 |
| PATCH `/notifications/{notificationId}/read` | 본문 없음 | 204. 없음/남의 것/삭제/30일 경과 → 404 | NOTIFICATION-003, 004 |
| PATCH `/notifications/read-all` | 본문 없음 | 204 | NOTIFICATION-003 |
| GET `/notification-settings` | – | 200 `{topicPushEnabled, moderationPushEnabled, aiReviewPushEnabled}` (최초 모두 true) | NOTIFICATION-006 |
| PATCH `/notification-settings` | 3개 Boolean 모두 nullable. 생략/null=유지. **셋 다 없으면 400 "변경할 푸시 수신 설정을 하나 이상 입력해주세요."** | 204 | NOTIFICATION-006 |
| PUT `/push-devices/current` | `fcmToken` string 필수 NotBlank | 204. 응답에 토큰 없음 | NOTIFICATION-005, [G:push-device-registration] |

`type` enum: `POST_APPROVED`, `POST_REJECTED`, `TOPIC`, `AI_REVIEW_COMPLETED`, `AI_REVIEW_FAILED`, `NOTICE`, `REMINDER`. `sourceType` enum: `POST`, `TOPIC`, `NOTICE`, `REMINDER`. 알 수 없는 값이 오면 앱이 깨지지 않게 처리해야 한다([G:notification-inbox]). 근거: [코드:notification/domain/NotificationType.java, NotificationSourceType.java].

### 1.6 제공자별 차이 (참고)

- 카카오: `authorizationCode` **보내면 400**(null이어야 함). nonce 필수.
- Apple/Google: 보류. Apple은 `authorizationCode` 필수이며 가입 직전 로그인(`social-login`)으로 임시 인증 정보를 먼저 만들어야 업로드 발급이 가능([코드:auth/api/v1/docs/AuthApiDocs.java]).

---

## 2. 인증 흐름

### 2.1 카카오 로그인 → social-login → 미가입 시 signup

```
1) 클라: rawNonce = 임의 랜덤 문자열 생성(원본 보관)
2) 클라: Kakao SDK(OIDC)에 nonce = SHA-256(rawNonce) 소문자 hex 를 전달 → idToken 수신
3) POST /auth/social-login {provider:"KAKAO", idToken, rawNonce}      (authorizationCode 보내지 않음)
   ├ status=LOGIN_SUCCESS → 토큰 4종 저장, 끝
   └ status=SIGN_UP_REQUIRED → 가입 화면
4) [약관 동의 화면]  ← API 필드 없음(6절 참고)
5) 사인 PNG 준비 후  POST /auth/social-signup/signature/uploads {provider, idToken, rawNonce}
   → {uploadId, uploadUrl, expiresInSeconds:300, signupToken}
6) PUT uploadUrl  (Content-Type: image/png, 본문 = PNG 바이트, 300초 이내, ≤1MiB)
7) POST /auth/social-signup {signupToken}   (signupToken 5분 유효)
   ├ 200 → 로그인 완료(토큰 4종)
   ├ 400 SIGNATURE_PROCESSING_PENDING → 같은 signupToken으로 잠시 후 재요청
   └ 그 외 오류 → 아래 오류표
```

- nonce 검증: 서버는 `SHA-256(rawNonce)` 소문자 hex 와 ID Token의 `nonce` 클레임을 비교한다. 불일치 → 401 `UNAUTHORIZED`. [코드:auth/infrastructure/infra/oidc/OidcIdTokenVerifier.java:85-98]
- ID Token은 매 호출(`social-login`, 업로드 발급)마다 서버가 검증한다. 5)에서 ID Token이 만료됐거나 SDK에서 다시 받은 토큰이면 새 토큰 + 같은 `rawNonce`가 필요하다. 단 nonce는 SDK 요청 때 쓴 값과 같아야 하므로 **로그인 시도 1회 동안 rawNonce와 idToken 쌍을 유지**한다. [추정: 카카오 ID Token 유효시간 내에 가입을 끝내야 함. 유효시간은 코드에 없음]
- 가입 시 서버 동작:
  - 이미 가입된 소셜 계정으로 업로드 발급 → 400 `BUSINESS_ERROR "이미 가입된 소셜 계정입니다."` (이 경우 클라는 social-login을 다시 호출)
  - 정지된 계정 → 403 `FORBIDDEN "차단된 소셜 계정입니다."`
  - `signup` 중복 호출: 이미 가입 완료된 같은 소셜 계정이면 **기존 회원 결과를 그대로 200 반환**(멱등, USER-001 예외), 단 정지 회원이면 403, 탈퇴 회원이면 400 "이미 가입된 소셜 계정입니다."
  - signupToken 재사용(최초 성공 후 jti 소진) → 400 `BUSINESS_ERROR "이미 사용된 회원가입 토큰입니다."`. 가입 트랜잭션이 실패했다면 소진 기록도 롤백되어 같은 토큰으로 재시도 가능.
  - 업로드 파일 없음 → 404 `BUSINESS_ERROR "업로드한 사인 이미지를 찾을 수 없습니다."`
  - 처리 미완료 → 400 `SIGNATURE_PROCESSING_PENDING "사인 이미지 처리 중입니다."`
  - 타입/용량 위반 → 400 `BUSINESS_ERROR "사용할 수 없는 사인 이미지입니다."`
  - signupToken 위조/만료 → 401 (코드 `UNAUTHORIZED`로 추정. AuthApiDocs는 401만 명시)
  근거: [코드:auth/service/signup/SocialSignupService.java].
- 가입 직후 응답에 토큰 4종이 포함되므로 별도 로그인 호출은 필요 없다.

### 2.2 토큰 형식·만료

| 토큰 | 형식 | 수명 | 근거 |
| --- | --- | --- | --- |
| 액세스 | JWT(HS 서명), 클레임 `sub`=userId, `scope`=USER, `session_id`=로그인 세션 UUID. 응답 `expiresIn`(초)을 기준으로 만료 판단 | 배포 예시 설정 15분(응답 예시 `900`). **환경변수 값이라 코드에 고정값 없음** → 클라는 하드코딩하지 말고 `expiresIn` 사용 | AccessTokenProperties, `backend/deploy/examples/application.*.env.example` |
| 리프레시 | 불투명 랜덤 문자열(서버엔 해시만 저장) | 비활동 만료: 마지막 발급(회전)으로부터 예시 30일(응답 예시 `2592000`), 회전 시마다 연장. **절대 만료: 최초 로그인 시점 + 예시 90일, 연장 불가**(비활동 만료 시각이 절대 만료를 넘으면 절대 만료로 잘림). 응답 `refreshTokenExpiresIn` 사용 | RefreshTokenPolicy.java, application.prod.env.example |
| signupToken | JWT, aud 별도(`chalkak-social-signup`) | 5분 | application.yml `social-signup-token.expiration: 5m` |

운영/개발 서버의 실제 값은 환경변수라 다를 수 있다 → 7절 확인 목록.

### 2.3 갱신(refresh) · 회전 · 재사용 감지

- 요청: `POST /auth/refresh {refreshToken}` (액세스 토큰 불필요). 성공 시 새 액세스 + **새 리프레시**를 받고 이전 리프레시는 즉시 사용 불가.
- 서버 판정(모두 같은 응답 `401 REAUTHENTICATION_REQUIRED "다시 로그인해 주세요."`): 알 수 없는 토큰 / 이미 폐기된 세션 / **이미 회전된 토큰을 다시 제시(재사용 감지)** / 비활동·절대 만료. 재사용·만료 감지 시 **해당 로그인 세션(계보)이 통째로 폐기**되고 푸시 기기 행도 삭제된다(응답은 401이지만 폐기는 커밋됨). [코드:auth/service/token/RefreshTokenService.java], NOTIFICATION-005.
- **클라이언트 필수 동작** ([G:push-device-registration], devwiki `common/networking-errors-retry`):
  1. 401 `UNAUTHORIZED` 수신 → refresh 1회 → 성공하면 원 요청 1회 재전송.
  2. refresh 요청은 **동시에 한 건만** 실행(single-flight). 같은 리프레시 토큰을 두 번 보내면 두 번째가 "재사용"으로 판정되어 세션이 폐기된다.
  3. refresh 응답의 **액세스·리프레시 둘 다 저장**(원자적으로). 저장 전 앱이 죽는 경우를 대비해 새 리프레시를 받은 즉시 영속화.
  4. refresh 요청은 자동 재시도하지 않는다(타임아웃 시 응답 유실 가능성이 있어 두 번 보내면 재사용 판정 위험). 네트워크/5xx 오류만으로 로그아웃하지 않는다. `401 REAUTHENTICATION_REQUIRED`일 때만 토큰 폐기 + 로그인 화면.
  5. refresh 자체의 400(본문 비어 있음)은 클라이언트 버그.
  [추정] 응답 유실로 클라가 새 리프레시를 못 받은 경우 서버는 복구 수단이 없다(유예 구간 없음). 코드에서 grace window 를 찾지 못함 → 7절.
- `session_id`가 없는 구버전 JWT는 푸시 기기 등록에서 `401 REAUTHENTICATION_REQUIRED`가 난다. 이 경우 refresh로 새 JWT를 받은 뒤 재등록([G:push-device-registration] 2~3항). 신규 구현은 항상 `session_id`가 있으므로 해당 없음.

### 2.4 로그아웃

- `POST /auth/logout {refreshToken}`: 해당 **세션 하나만** 폐기 + 그 세션의 푸시 기기 행 삭제. 다른 기기는 유지. 만료·회전·폐기·알 수 없는 토큰 모두 204.
- 클라: 호출 후(성공/실패 무관하게 로컬 토큰을 지우는 것이 안전. 네트워크 실패 시 앱 처리는 규칙이 정하지 않음 → [G:push-device-registration] "새로 정하지 않는다", 7절) 로컬 토큰·캐시 삭제. FCM 토큰 별도 해제 API 없음.

### 2.5 회원 탈퇴

- `DELETE /users/me` (액세스 토큰, 정지 회원도 가능). 204.
- 서버: 소셜 연결 삭제(정지 회원은 유지), **모든 세션 RT 폐기**, 모든 푸시 기기 삭제, 회원 논리 삭제·이메일/사인 참조 대체 (USER-003~005). 이후 같은 토큰으로 인증 API → 401 `UNAUTHORIZED`.
- 같은 소셜 계정은 **새 회원으로 재가입 가능**(정상 회원). 정지 상태로 탈퇴하면 로그인 403 + 재가입 차단(`FORBIDDEN "탈퇴한 차단 소셜 계정입니다."`).
- 이미 탈퇴한 계정으로 재호출 → 401(탈퇴 회원은 인가 단계에서 거절).
- 탈퇴 후 비로그인 공개 피드는 계속 조회 가능([G:push-device-registration]).
- 클라: 204 후 로컬 토큰·캐시 삭제, 카카오 SDK 연결 해제(unlink)는 **서버가 하지 않음**: [추정] 서버의 `SocialConnectionRevoker`는 Apple만 폐기 → 카카오 측 앱 연결 해제 필요 여부는 7절.

### 2.6 정지(BANNED) 회원

| 상황 | 동작 | 근거 |
| --- | --- | --- |
| 로그인 | 탈퇴하지 않은 정지 회원은 **로그인 성공(`LOGIN_SUCCESS`)** | USER-002, ExistingSocialAccountLoginProcessor |
| 쓰기(게시물 업로드·작성·수정, 사인 업로드·교체, 좋아요 등록, AI 리뷰 요청) | `403 FORBIDDEN "차단된 회원입니다."` | UsableUserPolicy |
| 허용 | 모든 조회(본인 AI 리뷰 포함), 본인 게시물 삭제, 좋아요 취소, 탈퇴, 피드백, 알림, 알림 설정, 기기 등록 | USER-002 |
| `GET /posts/today` | **403**(정지 회원 불가). 작성 진입 화면에서 정지 안내를 먼저 처리해야 함 | PostController `@RequiresUsableUser` |
| 정지 후 탈퇴한 소셜 계정 | 로그인 `403`, 가입 시도도 `403` | USER-005 |

주의: 정지 여부를 알려주는 전용 API/필드가 없다. 클라는 403 `FORBIDDEN` + 메시지로만 알 수 있다 → 7절.

---

## 3. 업로드 흐름 2종

### 3.1 게시물 사진 (WebP)

```
1) POST /posts/uploads                      → {uploadId, uploadUrl, expiresInSeconds:300, contentType:"image/webp", maxBytes:5242880}
2) PUT uploadUrl  (헤더 Content-Type = 응답 contentType 와 정확히 일치, 바디 = WebP 바이트)   ※ 인증 헤더 붙이지 않음
3) POST /posts {topicId, photoUploadId=uploadId, title?}  → 201 {postId, moderationStatus}
4) 이후 상태는 푸시·알림함·GET /posts/today·캘린더로 확인
```

| 항목 | 값 | 근거 |
| --- | --- | --- |
| 형식 | WebP 정지 이미지만. 움직이는 WebP 거절(`ANIMATED_IMAGE`) | POST-004, PostImageUpload.java 거절 사유 |
| 크기 | ≤ 5 MiB(5,242,880B). **presigned PUT은 크기를 강제하지 못한다**(Content-Type만 서명). 초과분은 업로드 후 처리 단계에서 거절 → **클라가 전송 전에 검사**해야 함 | S3PostImageUploadIssuer.java 주석, POST-004 |
| 업로드 URL 만료 | 발급 후 300초(5분). 만료 후 PUT은 S3 오류 → 1)부터 다시 | S3PostImageUploadIssuer |
| 업로드 ID 사용 기한 | 발급 후 1시간 안에 `POST /posts`(claim) 해야 함. 초과 시 400 `"사진 업로드 유효 시간이 지났습니다."` | PostImageUpload.CLAIM_TTL, POST-004 |
| 1회성 | 업로드 ID 하나는 게시물 하나에만. 재사용 400 `"이미 사용된 사진입니다."` | PostCommandService |
| 소유 | 남의 uploadId·없는 uploadId → 404 `BUSINESS_ERROR "업로드한 사진을 찾을 수 없습니다."` (존재 여부 비노출) | PostCommandService |
| PUT 안 하고 POST /posts | 스테이징 객체가 없으면 404 `"업로드한 사진을 찾을 수 없습니다."` | PostCommandService |
| 처리 | S3 업로드 후 서버(Lambda)가 원본·썸네일 처리 → 콜백. 정상은 수 초(주석). 처리 대기 한도는 환경변수 `POST_IMAGE_PROCESSING_TIMEOUT`(배포 예시 `7m`) | PostProcessingPolicy, env.example |
| 처리 거절 사유 문구 | `UNSUPPORTED_FORMAT` "WebP 이미지만 업로드할 수 있습니다." / `CORRUPTED_IMAGE` / `ANIMATED_IMAGE` / `TOO_LARGE` / `TOO_MANY_PIXELS` / `MISSING_OBJECT` / `PROCESSING_ERROR` / 기본 "처리할 수 없는 사진입니다. 다시 업로드해 주세요." — 이 문구는 **거절된 업로드로 `POST /posts` 했을 때 400 message**로만 노출된다 | PostImageUpload.java:41-54 |
| 해상도 상한 | `TOO_MANY_PIXELS` 존재하나 **수치 미확인**(Lambda 쪽). 7절 |  |

게시물 상태 전이(응답/조회로 보이는 것):

| 시점 | 결과 | 비고 |
| --- | --- | --- |
| `POST /posts` 시 업로드 이미 처리됨(READY) | `PENDING` 즉시 | 응답 `moderationStatus=PENDING` |
| 처리 전 | `VALIDATING` | 피드·상세에 안 보임(작성자 포함, POST-007) |
| 처리 성공 콜백 | `VALIDATING → PENDING` | 이후 관리자 검수 |
| 처리 실패 콜백 | `VALIDATING → REJECTED` | **알림이 생성되지 않음**(NOTIFICATION-001은 관리자 승인·반려만). 앱은 `GET /posts/today`·캘린더로만 간접 확인 → 7절 |
| 처리 대기 한도 초과 | 그대로 `VALIDATING`이지만 **같은 주제로 다시 `POST /posts` 하면 서버가 `REJECTED` 로 전환하고 새로 작성 허용**. `GET /posts/today`도 이 경우 `isPosted=false` | POST-006, PostQueryService.blocksNewPost |

### 3.2 사인 PNG

```
(가입 중)  POST /auth/social-signup/signature/uploads → PUT → POST /auth/social-signup        (2.1 참고)
(교체)     POST /users/me/signature/uploads → {uploadId, uploadUrl, expiresInSeconds:300}
           PUT uploadUrl (Content-Type: image/png)
           PUT /users/me/signature {signatureOriginalUploadId}
           → 200 {signatureOriginalImageUrl}  ← 처리 중에는 "기존" 사인 URL
           GET /users/me/signature 로 교체 반영 여부 확인(URL 값 변경 비교)
```

| 항목 | 값 | 근거 |
| --- | --- | --- |
| 형식·크기 | PNG(`image/png`), ≤ 1 MiB(1,048,576B). **응답에 contentType·maxBytes가 없으므로 클라이언트가 상수로 가짐** | SIGN-002, S3SignatureImageUploadIssuer, 응답 DTO |
| 해상도·비율·알파 | 확정 규칙 없음 → 클라 임의 제한 금지, 7절 | SIGN-002 예외 |
| 서버 검증 시점 | 크기·타입은 **교체/가입 완료 호출 시** 저장소 메타데이터로 확인, 위반 400 `BUSINESS_ERROR "사용할 수 없는 사인 이미지입니다."` (PUT 시점에는 크기 강제 없음) | SignatureImagePolicy, UserService |
| URL 만료 | 300초 | S3SignatureImageUploadIssuer |
| 가입 시 | 처리 완료까지 `SIGNATURE_PROCESSING_PENDING`(400) 반복 → 같은 `signupToken` 재요청(토큰 5분 이내) | AuthApiDocs |
| 교체 중 | 새 사인 처리 성공 전까지 기존 사인 유지. 처리 상태(PROCESSING)를 노출하는 필드 없음 | SIGN-003 |
| 교체 오류 | 처리 실패·시간 초과(이 uploadId) → 400 `SIGNATURE_REUPLOAD_REQUIRED`: **새 uploadId 발급부터 다시**. 업로드 파일 없음 → 404 `BUSINESS_ERROR` | UserService.updateSignature |
| 조회 오류 | 처리 실패·시간 초과 → 400 `SIGNATURE_REGISTRATION_REQUIRED` → 사인 재등록 화면 | UserService.getSignature |
| 특수 | 현재 활성 사인의 uploadId로 PUT → 진행 중 교체 취소, 기존 사인 유지 | SIGN-003 |
| 처리 시간 한도 | 환경변수 `SIGNATURE_PROCESSING_TIMEOUT`(배포 예시 `7m`) | env.example |
| 정지 | 업로드 발급·교체 403, 조회 허용 | SIGN-003 |

사인 상태 머신(서버 내부, API로는 일부만 노출): `없음/ACTIVE` → (PUT) `PROCESSING(uploadId, 시작시각)` → 성공 콜백 `ACTIVE(새 사인)` / 실패 콜백 `FAILED` / 한도 초과 `TIMED-OUT(조회 시 FAILED와 동일 취급)`. [코드:user/domain/SignatureProcessingStatus.java = PROCESSING, FAILED]

---

## 4. 상태 머신

### 4.1 게시물 검수 상태 (`ModerationStatus`: VALIDATING, PENDING, APPROVED, REJECTED)

```
(생성) ──업로드 이미 처리됨──────────────► PENDING
(생성) ──처리 전──► VALIDATING ──처리 성공──► PENDING ──관리자 승인──► APPROVED
                       │                          └──관리자 반려──► REJECTED
                       ├─처리 실패 콜백────────────────────────────► REJECTED
                       └─처리 대기 한도 초과 + 같은 주제 재제출──────► REJECTED
```
근거: POST-006, [코드:post/domain/Post.java, ModerationStatus.java].

| 상태 | 슬롯 점유(POST-003) | 사용자 삭제 | 피드/상세 공개 | 캘린더 | 수정(PUT) |
| --- | --- | --- | --- | --- | --- |
| VALIDATING | O(한도 내) | **X** 400 "이미지 처리 중인 게시물은 삭제할 수 없습니다." | X | X | X |
| PENDING | O | O | X (작성자 본인도 상세 404) | O(본인) | O(참여기간 내) |
| APPROVED | O | O | O | O | O(참여기간 내) |
| REJECTED | X(재제출 가능) | X 400 "검수 거절된 게시물은 삭제할 수 없습니다." | X | X | X |

- 정리: 반려/삭제된 게시물은 슬롯을 비우므로, 참여 기간(OPEN)이 남았다면 같은 주제로 다시 올릴 수 있다.
- 승인·반려 결과는 푸시 + 알림함으로 전달(NOTIFICATION-001). 반려 사유는 알림 상세 `rejectionReason`(≤500자). 반려 상세에 "새로 올리기" 버튼 없음(NOTIFICATION-002).
- 참여 기간이 끝난 뒤에도 이미 생성된 게시물의 이미지 처리·검수는 계속됨(POST-006).
- 삭제된 게시물: 반복 DELETE는 204 유지. 존재하지 않는 게시물 DELETE → 404, 타인 게시물 DELETE → 403 `FORBIDDEN "본인의 게시물만 접근할 수 있습니다."`.

### 4.2 AI 리뷰 상태 (`NONE`, `PROCESSING`, `COMPLETED`, `FAILED`)

```
NONE ──POST──► PROCESSING(202) ──성공──► COMPLETED(200, 종결)
                    │ └─일시 실패는 서버가 자동 재시도(총 3회 시도, 상태는 계속 PROCESSING)
                    └─실패 확정──► FAILED ──POST(canRequestAgain=true)──► PROCESSING(202)
```
근거: AIREVIEW-001~005, [G:ai-review], application.yml `max-claims: 3`.

| 상태 | HTTP | 클라 처리 |
| --- | --- | --- |
| NONE | GET 200 | "AI 피드백 받기" 버튼. **폴링 안 함** |
| PROCESSING | POST 202 / GET 200 | 분석 중 화면 + 폴링 |
| COMPLETED | 200 | 결과 표시, 폴링 중단. 재요청 버튼 없음 |
| FAILED | 200 | 실패 안내(사유 없음). `canRequestAgain==true`일 때만 "다시 요청" |

폴링 계약 ([G:ai-review]):
- 간격 **3초**, 창 **약 5분(300초)**. 창 시작 = `POST`를 보낸 시각 **또는** 화면에 들어와 폴링을 시작한 시각(`requestedAt`은 최초 요청 시각이라 기준으로 쓰지 말 것).
- 5분 후에도 PROCESSING이면 폴링 중단 + "잠시 후 다시 확인해 주세요" 안내. **실패 아님**, 이때 POST 재호출 금지. 화면 재진입 시 GET부터 재시작.
- 화면을 벗어나면 폴링 중단. 분기는 HTTP 코드가 아니라 `status`로.
- POST는 응답 받을 때까지 1회만, 실패 응답 후 자동 재전송 금지(실패 뒤의 POST는 재요청 횟수를 소모).
- 요청 횟수: 게시물당 처음 포함 최대 **3회**. 4번째 POST → 400 `BUSINESS_ERROR "더 이상 AI 리뷰를 다시 요청할 수 없습니다."`. 기능 꺼짐 → 400 `"지금은 AI 리뷰를 요청할 수 없습니다."`. `canRequestAgain`이 없는 구버전 서버 응답은 `false`로 처리.
- 완료/실패 시 푸시(`AI_REVIEW_COMPLETED`/`AI_REVIEW_FAILED`)와 알림함 기록이 생김. 보고 있는 게시물의 AI 리뷰 화면이면 포그라운드 푸시 표시 생략 권장. 조회만으로 알림이 읽음 처리되지 않음.
- 서버 최악 대기: 약 4분 + 배포 지연 ~2분 → 5분 창을 넘을 수 있음(정상).

### 4.3 알림 읽음

- 상태: `readAt == null`(미읽음) → `readAt != null`(읽음). 되돌릴 수 없음. 재요청해도 최초 `readAt` 유지(NOTIFICATION-003).
- 목록·상세 조회는 읽음 처리하지 않음. 읽음은 `PATCH .../{id}/read`(단건) 또는 `PATCH /notifications/read-all`로만.
- 미읽음 점(배지)은 `GET /notifications/unread-status`의 `hasUnread`.
- 노출 기간: 이벤트 발생(`createdAt`)부터 **30일**, 정확히 30일 경계 시각은 표시, 경계 초과 시 목록·상세·미읽음·읽음 대상에서 제외. 읽어도 연장 없음. 삭제된 게시물·공지의 알림도 제외(NOTIFICATION-002~004, [코드:notification/domain/Notification.java:30 `RETENTION=30일`]).
- 만료·삭제 알림의 상세/읽음 → 404 `BUSINESS_ERROR "알림을 찾을 수 없습니다."` → 목록·미읽음 재조회.
- 푸시를 먼저 눌러 상세로 들어가면 `notificationId`로 단건 읽음 호출(TOPIC·REMINDER는 notificationId 없음 → 호출 안 함).

### 4.4 주제 단계 (`TopicPhase`)

`BEFORE_OPEN`(시작 전) → `OPEN`(시작 ≤ now < 종료) → `CLOSED`(종료 ≤ now). `GET /topics?date=`의 `phase`는 요청 시점에 서버가 계산. 게시물 작성은 `OPEN`에서만 가능(POST-002, TOPIC-003).

---

## 5. ErrorCode 전체 표

서버 enum(`exception/ErrorCode.java`): `BUSINESS_ERROR`, `SIGNATURE_REGISTRATION_REQUIRED`, `SIGNATURE_REUPLOAD_REQUIRED`, `SIGNATURE_PROCESSING_PENDING`, `RESOURCE_STATE_CHANGED`, `UNAUTHORIZED`, `REAUTHENTICATION_REQUIRED`, `FORBIDDEN`, `INTERNAL_ERROR`, `USER_METRICS_AGGREGATION_IN_PROGRESS`.

### 5.1 errorCode별

| errorCode | HTTP | 발생 API | 의미 | 클라이언트 동작 | 재시도 |
| --- | --- | --- | --- | --- | --- |
| `UNAUTHORIZED` | 401 | 인증 필요한 모든 API(필터·컨트롤러), 소셜 로그인 ID Token/nonce 오류, signupToken 오류 | 액세스 토큰 없음·만료·위조, 탈퇴한 회원, ID Token 검증 실패 | **인증 API(`/auth/*`) 밖**: refresh → 원 요청 1회 재전송. `/auth/social-*`에서는 "로그인에 실패했습니다. 다시 시도" + 새 ID Token·nonce로 재시도 | refresh 후 1회 |
| `REAUTHENTICATION_REQUIRED` | 401 | `POST /auth/refresh`, `PUT /push-devices/current`(session_id 누락·사용 가능한 RT 없음) | 재로그인 필요. 세션 폐기됨 | 로컬 토큰 삭제 → 로그인 화면(refresh를 다시 호출하지 않음). 푸시 등록에서 받으면: session_id 없는 구 토큰이면 refresh 후 재등록, refresh도 REAUTH면 로그인 | 아니오 |
| `FORBIDDEN` | 403 | 정지 회원의 쓰기 API("차단된 회원입니다."), 타인 게시물 수정/삭제("본인의 게시물만…"), `social-login/social-signup`의 차단 소셜 계정("차단된 소셜 계정입니다./탈퇴한 차단 소셜 계정입니다."), 관리자 토큰으로 사용자 API 호출 | 권한 없음 | 서버 `message` 표시. 정지 안내 UI. 재시도 금지. 정지 회원은 쓰기 버튼 비활성/안내 | 아니오 |
| `BUSINESS_ERROR` | 400 | 거의 모든 API(검증·정책 위반), 404도 이 코드 사용 | 입력/정책 위반 일반 | `message` 그대로 표시(한국어 사용자용). 상세는 5.2 | 아니오 |
| `BUSINESS_ERROR` | 404 | 게시물/주제/알림/작성자/업로드 없음, 공개 조건 미충족 | 리소스 없음(존재 비노출 포함) | "찾을 수 없음" 화면, 목록 재조회/뒤로. 상세 문구는 5.2 | 아니오 |
| `SIGNATURE_PROCESSING_PENDING` | 400 | `POST /auth/social-signup` | 사인 이미지 서버 처리 중 | 스피너 유지, 1~2초 간격으로 **같은 signupToken**으로 재요청. signupToken 5분 만료 전까지. [추정: 간격은 규칙에 없음] | 예 |
| `SIGNATURE_REUPLOAD_REQUIRED` | 400 | `PUT /users/me/signature` | 이 uploadId 처리 실패/시간 초과 | 새 `POST /users/me/signature/uploads`부터 다시 | 새 업로드로 |
| `SIGNATURE_REGISTRATION_REQUIRED` | 400 | `GET /users/me/signature` | 사인 재등록 필요(처리 실패/시간 초과) | 사인 등록 화면으로 유도. 게시물에는 기존 사인이 계속 표시됨(SIGN-004) | 아니오 |
| `RESOURCE_STATE_CHANGED` | 400 | **사용자 API에서는 발생 경로 없음**(코드상 관리자 주제 수정/회원 정지·해제에서만) | 상태 변경됨 | 모르는 코드로 취급되어도 앱이 깨지지 않게 `BUSINESS_ERROR`처럼 처리 | 아니오 |
| `INTERNAL_ERROR` | 500 | 모든 API | 서버 오류 | 일반 오류 문구 + 다시 시도. 멱등 요청(GET/PUT/DELETE/PATCH, 업로드 발급)만 지수 백오프 재시도. `POST /posts`·refresh·피드백·AI 리뷰 POST는 자동 재시도 금지 | 조건부 |
| `USER_METRICS_AGGREGATION_IN_PROGRESS` | 400 | 관리자 분석 API 전용 | 사용자 API에서 발생 안 함 | 무시(모르는 코드 처리만) | – |

devwiki `common/networking-errors-retry` §2.1 재시도 표와 일치시켰다. 단 **`FORBIDDEN`은 네트워킹 문서에 "정지 회원 포함 여부 확인 필요"로 남아 있으나 코드로 확인됨**: 정지 쓰기 요청 = 403 `FORBIDDEN`.
5xx이지만 errorCode가 없는 게이트웨이 응답(HTML 등)은 HTTP 상태로만 분류한다([네트워킹 문서] §1.2). 413은 사용자 API에서 발생하지 않음.

### 5.2 `BUSINESS_ERROR` 세부 메시지 (message는 서버 값 그대로, 분기에 쓰지 말 것 — 분기는 HTTP+API 컨텍스트로)

| API | HTTP | message | 의미/클라 동작 |
| --- | --- | --- | --- |
| `GET /posts` | 400 | "조회 조건이 올바르지 않습니다." | sort 값 오류, page/pageSize/randomSeed 형식, `sort≠random`인데 randomSeed 전달, `sort=random & page>1 & randomSeed 없음`. 클라 버그 |
| `GET /posts` | 400 | "미래 날짜의 게시물은 조회할 수 없습니다." | topicDate > KST 오늘. 날짜 선택 UI 제한 |
| `GET /posts` | 404 | "해당 날짜의 주제를 찾을 수 없습니다." | 그 날 주제 없음 → 빈 상태 화면 |
| `GET /posts/today` | 404 | "참여할 수 있는 주제가 없습니다." | 지금 OPEN인 주제 없음 → 작성 불가 안내 |
| `GET /topics` | 404 / 400 | "주제를 찾을 수 없습니다." / "미래의 주제는 조회할 수 없습니다." | |
| `POST /posts` | 404 | "게시물을 작성할 주제를 찾을 수 없습니다." | topicId 잘못/삭제 |
| `POST /posts` | 400 | "현재 게시물을 작성할 수 없는 주제입니다." | 주제가 OPEN 아님(시작 전/종료) → `/posts/today` 재조회 |
| `POST /posts` | 400 | "이미 해당 주제에 게시물을 작성했습니다." | 중복(응답 유실 후 재시도 포함). `GET /posts/today`로 확인 |
| `POST /posts` | 404 | "업로드한 사진을 찾을 수 없습니다." | 업로드 ID 없음/타인/PUT 누락 → 업로드부터 다시 |
| `POST /posts` | 400 | "이미 사용된 사진입니다." | 업로드 재사용 → 새 업로드 |
| `POST /posts` | 400 | "사진 업로드 유효 시간이 지났습니다." | 1시간 초과 → 새 업로드 |
| `POST /posts` | 400 | 거절 사유 문구 5.x(3.1 표) | 처리 거절된 업로드 → 새 업로드 + 안내 문구 표시 |
| `POST /posts`, `PUT /posts/{id}` | 400 | "제목은 10자 이하여야 합니다." | 입력 제한 |
| `PUT /posts/{id}` | 400 | "현재 상태의 게시물은 수정할 수 없습니다." / "참여 기간이 종료된 게시물은 수정할 수 없습니다." | |
| `DELETE /posts/{id}` | 400 | "이미지 처리 중인 게시물은 삭제할 수 없습니다." / "검수 거절된 게시물은 삭제할 수 없습니다." / "현재 상태의 게시물은 삭제할 수 없습니다." | 삭제 버튼 상태별 숨김 |
| `*/posts/{id}*` | 400 | "ID 형식이 올바르지 않습니다." | 클라 버그 |
| `GET/PUT/DELETE posts/{id}` 등 | 404 | "게시물을 찾을 수 없습니다." | 삭제/비공개/미승인 → 화면 닫고 목록 갱신 |
| `PUT/DELETE /posts/{id}/likes` | 404 | "게시물을 찾을 수 없습니다." | 낙관적 UI 롤백 + 목록 갱신 |
| `GET /users/{id}/posts` | 404 | "작성자를 찾을 수 없습니다." | 탈퇴 작성자 |
| `POST /posts/{id}/ai-review` | 400 / 404 | "지금은 AI 리뷰를 요청할 수 없습니다." / "더 이상 AI 리뷰를 다시 요청할 수 없습니다." / "게시물을 찾을 수 없습니다." | [G:ai-review] |
| `POST /auth/social-signup*` | 400 | "이미 가입된 소셜 계정입니다." / "이미 사용된 회원가입 토큰입니다." / "사용할 수 없는 사인 이미지입니다." | 2.1 참고 |
| `POST /auth/social-signup*` | 400 | Apple 임시 인증 정보 없음/만료 | **Apple 보류** |
| `POST /auth/social-login` | 400 | "Authorization Code는 APPLE 로그인에만 필요합니다." | 카카오에서 authorizationCode 보냈을 때. 클라 버그 |
| `GET /notifications*` / `PATCH` | 404 | "알림을 찾을 수 없습니다." | 5.1 |
| `PATCH /notification-settings` | 400 | "변경할 푸시 수신 설정을 하나 이상 입력해주세요." | |
| `POST /feedbacks` | 400 | `FEEDBACK` 내용 검증 문구("피드백 내용이 필요합니다."/"피드백 내용은 1000자 이하여야 합니다.") | |
| `GET /banners` | 400 | "조회 조건이 올바르지 않습니다." | |
| `PUT /push-devices/current` | 400 | "FCM 토큰이 필요합니다." | 빈 토큰 |

### 5.3 이 서버에 없는 코드 (클라가 가정하지 말 것)

`NOT_FOUND`, `VALIDATION_ERROR`, `RATE_LIMITED`, `CONFLICT` 같은 코드는 **없다**. 404/409/429 계열도 `BUSINESS_ERROR`+HTTP 404 또는 400뿐이다(409 매핑은 TODO 주석, SocialSignupService). 429/Retry-After 사용 여부는 서버 코드에서 확인하지 못함 → 7절.

---

## 6. 날짜·시간대와 경계 규칙 (테스트 케이스)

### 6.1 규칙 요약 (이름 정정)

**"하루 1장"이라는 규칙은 없다.** 실제 규칙은 **"주제당 1장"**(POST-003)이다. 주제는 날짜당 하나(TOPIC-002)지만 참여 기간이 KST 자정 시작·24시간으로 고정돼 있지 않다(TOPIC-003 예외). 따라서 클라가 "오늘 날짜"로 작성 가능 여부를 계산하면 안 되고 **`GET /posts/today`와 `GET /topics`의 `phase/startsAt/endsAt`** 를 사용해야 한다.

### 6.2 테스트 케이스: "입력 → 기대 결과"

가정: 오늘 KST = 2026-10-27, 주제 T는 `startsAt=2026-10-27T00:00+09:00`(=2026-10-26T15:00Z), `endsAt=2026-10-28T00:00+09:00`.

**시간대·주제**

| # | 입력 | 기대 결과 | 근거 |
| --- | --- | --- | --- |
| T1 | `GET /topics?date=2026-10-27` (KST 오늘) | 200, `topicDate=2026-10-27` | TOPIC-005 |
| T2 | `GET /topics?date=2026-10-28` (KST 내일) | 400 BUSINESS_ERROR "미래의 주제는 조회할 수 없습니다." (주제 존재 여부와 무관) | TOPIC-005 |
| T3 | `GET /topics?date=2026-10-26` 그 날 주제 없음 | 404 BUSINESS_ERROR "주제를 찾을 수 없습니다." | TopicService |
| T4 | `GET /topics?date=2026/10/27` | 400 BUSINESS_ERROR "date: 요청 값의 형식이 올바르지 않습니다." | GlobalExceptionHandler |
| T5 | `GET /topics` (date 없음) | 400 "date: 필수 요청 값이 없습니다." | 같음 |
| T6 | UTC 2026-10-26T15:00:00Z 에 기기 시간대가 UTC인 사용자가 "오늘" 계산 | 클라는 **KST 변환 후** 2026-10-27 사용. UTC 날짜 2026-10-26을 보내면 어제 주제를 조회하게 됨 | TOPIC-002 |
| T7 | UTC 2026-10-26T14:59:59Z (KST 23:59:59 10/26)에 `date=2026-10-27` 조회 | 400 미래 날짜 | LocalDate.now(KST) |
| T8 | now = `startsAt` 정각 | phase=`OPEN`(시작 시각 이상) | TOPIC-003 |
| T9 | now = `endsAt` 정각 | phase=`CLOSED`(종료 시각 이상) | TOPIC-003 |
| T10 | now = `endsAt` − 1ms | phase=`OPEN` | TOPIC-003 |
| T11 | 참여 기간이 10/27 20:00 ~ 10/28 20:00 인 주제, now=10/28 01:00 KST | `GET /posts/today` → `topicDate=2026-10-27`(어제 날짜일 수 있음) | TodayPostStatusResponse 설명 |
| T12 | 서로 인접한 두 주제 A.end == B.start, now == 그 시각 | `GET /posts/today`는 B(OPEN). A는 CLOSED | TOPIC-003 |
| T13 | 주제 없는 시간대 | `GET /posts/today` 404 "참여할 수 있는 주제가 없습니다." | POST-011 |

**주제당 1장(POST-003/011)**

| # | 입력 | 기대 결과 |
| --- | --- | --- |
| P1 | 같은 주제에 활성 게시물 없음 → `POST /posts` | 201, `VALIDATING` 또는 `PENDING` |
| P2 | 같은 주제에 `VALIDATING`/`PENDING`/`APPROVED` 보유 후 `POST /posts` | 400 "이미 해당 주제에 게시물을 작성했습니다." |
| P3 | 같은 주제에 `REJECTED`만 보유 후 `POST /posts` (주제 OPEN) | 201 (재제출 허용) |
| P4 | 본인 게시물 삭제(DELETE) 후 같은 주제 `POST /posts` | 201 |
| P5 | 같은 주제에 `VALIDATING`이 처리 한도 초과(예: 7분 초과, 환경값) 상태 후 `POST /posts` | 201, 기존 건은 REJECTED로 전환. `GET /posts/today`도 `isPosted=false` |
| P6 | 같은 주제 `VALIDATING`(한도 이내) → `GET /posts/today` | `isPosted=true, moderationStatus=VALIDATING, postId=…` |
| P7 | 해당 주제에 게시물 없음 → `GET /posts/today` | `isPosted=false, postId=null, moderationStatus=null` |
| P8 | 두 기기에서 동시에 `POST /posts` | 한 건만 201, 나머지 400 "이미 …" (POST-003 동시성) |
| P9 | `POST /posts` 응답 유실 후 재전송 | 400 "이미 …" → 클라는 `GET /posts/today`로 확인해 postId 복구 |
| P10 | 주제가 `CLOSED`/`BEFORE_OPEN` 일 때 `POST /posts` | 400 "현재 게시물을 작성할 수 없는 주제입니다." |
| P11 | 정지 회원 `POST /posts/uploads`, `POST /posts`, `GET /posts/today` | 403 FORBIDDEN "차단된 회원입니다." |
| P12 | 사진 촬영 시각이 과거/앨범 선택 | 서버는 검사 안 함 → 허용 (POST-002) |

**제목(POST-005)**

| # | 입력 title | 기대 결과 |
| --- | --- | --- |
| H1 | 생략 / `null` / `""` / `"   "` | 저장 `null`(제목 없음) |
| H2 | 10자 (예: "가나다라마바사아자차") | 허용 |
| H3 | 11자 | 400 "제목은 10자 이하여야 합니다." |
| H4 | 이모지 10개(UTF-16로는 20) | 허용 (code point 기준) |
| H5 | `" 가나다라마바사아자차 "` (앞뒤 공백 포함 12자, strip 후 10자) | **서버 코드: 허용되고 strip 후 저장.** 규칙 문서는 "앞뒤 공백을 제거하지 않고 길이에 포함"이라 11자 이상이면 400이어야 해 **불일치**(7절) |
| H6 | `PUT /posts/{id}` title 키 누락 | 400 (키 필수, `null`은 허용=삭제) |

**업로드 경계(POST-004, SIGN-002)**

| # | 입력 | 기대 결과 |
| --- | --- | --- |
| U1 | WebP 5,242,880B | 허용(상한 포함) [추정: "최대 5MiB"로 이하 허용] |
| U2 | WebP 5,242,881B | 클라 사전 차단. 서버로 보내면 처리 단계에서 `TOO_LARGE`로 거절 → 이후 `POST /posts`가 400 "더 작은 용량의 이미지를 업로드해 주세요." |
| U3 | JPEG/PNG를 `image/webp`로 PUT | 처리 단계 `UNSUPPORTED_FORMAT` → `POST /posts` 400 "WebP 이미지만 업로드할 수 있습니다." |
| U4 | PUT 시 Content-Type이 `image/webp`와 다름 | S3가 서명 불일치로 거절(403 계열, S3 응답) → 업로드 발급부터 다시 |
| U5 | 발급 후 301초에 PUT | S3 만료 오류 → 새 발급 |
| U6 | 발급 후 59분에 `POST /posts` (PUT은 5분 안에 완료) | 허용 |
| U7 | 발급 후 61분에 `POST /posts` | 400 "사진 업로드 유효 시간이 지났습니다." |
| U8 | 같은 uploadId로 `POST /posts` 2회 | 두 번째 400 "이미 사용된 사진입니다." (또는 중복 주제 메시지) |
| U9 | 사인 PNG 1,048,576B / 1,048,577B | 허용 / 가입·교체 호출 시 400 "사용할 수 없는 사인 이미지입니다." |
| U10 | 사인 JPEG | 400 "사용할 수 없는 사인 이미지입니다." |
| U11 | 가입 중 signupToken 발급 후 5분 1초에 `POST /auth/social-signup` | 401 |
| U12 | 가입 시 PUT 직후 즉시 `social-signup` | 처리 전이면 400 `SIGNATURE_PROCESSING_PENDING` → 같은 토큰 재요청 |

**피드·페이징(POST-008)**

| # | 입력 | 기대 결과 |
| --- | --- | --- |
| F1 | `GET /posts?topicDate=…` (sort 생략) | `recent`, page=1, pageSize=20 |
| F2 | `sort=Recent` (대문자) | 400 "조회 조건이 올바르지 않습니다." (소문자만 허용) |
| F3 | `sort=random`, page=1, seed 없음 | 200, 응답 `randomSeed` 발급 → 다음 페이지에 그대로 전달 |
| F4 | `sort=random&page=2` seed 없음 | 400 |
| F5 | `sort=recent&randomSeed=abc` | 400 |
| F6 | `randomSeed` 65자 또는 `!` 포함 | 400 |
| F7 | `pageSize=0`, `101`, `abc` / `page=0` | 400 |
| F8 | `pageSize=100` | 200 |
| F9 | 마지막 페이지 이후 `page=99` | 200, 빈 `posts`, `hasNext=false`, 요청한 `currentPage/pageSize` 그대로 |
| F10 | 비로그인 `GET /posts` | 200, `isLiked=false, isMine=false`, `authorId`는 제공 |
| F11 | 비로그인 `GET /posts/{id}` | 401 |
| F12 | 비로그인 `GET /posts/calendar` | 401 |
| F13 | 관리자 토큰으로 `GET /posts` | 403 (익명 아님, 사용자 scope 아님) |
| F14 | 미승인(`PENDING`) 게시물 상세(작성자 본인) | 404 "게시물을 찾을 수 없습니다." |
| F15 | 인기순 동점 | 좋아요 수 → 제출 시각 순 (구체적 방향은 [추정] 둘 다 내림차순) |

**캘린더(POST-009)**

| # | 입력 | 기대 결과 |
| --- | --- | --- |
| C1 | `year=2026&month=10` | 해당 월 주제 날짜 기준 본인의 `PENDING`/`APPROVED`만. `REJECTED`/`VALIDATING` 제외 |
| C2 | `month=0`, `13`, `year=0`, `10000`, 누락 | 400 "조회 연월이 올바르지 않습니다." |
| C3 | 승인이 다음 달에 되었지만 주제 날짜가 10월 31일 | 10월에 표시(주제 날짜 기준, 승인·제출 시각 아님) |
| C4 | 기록 없는 달 | 200 `posts:[]` |
| C5 | `calendar/months` 기록 없음 | `months:[]` (현재 달 임의 추가 금지) |
| C6 | `calendar/months` | 연·월 최신순, 중복 없음 |

**좋아요(LIKE)**

| # | 입력 | 기대 결과 |
| --- | --- | --- |
| L1 | 이미 좋아요한 글 PUT | 200, `likeCount` 증가 없음, `isLiked=true` |
| L2 | 좋아요 안 한 글 DELETE | 200, `isLiked=false` |
| L3 | 정지 회원 PUT / DELETE | 403 / 200 |
| L4 | 본인 글 PUT | 200 (허용) |
| L5 | 비공개·삭제 게시물 PUT/DELETE | 404 |

**알림 30일(NOTIFICATION-004)**

| # | 입력 | 기대 결과 |
| --- | --- | --- |
| N1 | `createdAt` + 30일 0초 시점 | 목록·상세·읽음 대상 포함(정확한 경계는 보관) |
| N2 | `createdAt` + 30일 + 1초 | 목록 제외, 상세/단건 읽음 404 |
| N3 | 읽음 처리해도 | 기간 연장 없음 |
| N4 | 이미 읽은 알림 PATCH read | 204, `readAt` 불변 |
| N5 | 삭제된 게시물의 알림 | 목록·미읽음 제외, 상세/읽음 404 |
| N6 | 알림 상세 조회 | 읽음 처리되지 않음 |

**AI 리뷰 폴링**

| # | 입력 | 기대 결과 |
| --- | --- | --- |
| A1 | POST 후 2.9초 | 아직 폴링 요청 보내지 않음 (간격 3초) |
| A2 | 폴링 시작 후 300초 경과, 여전히 PROCESSING | 폴링 중단, "잠시 후 다시 확인" 안내, POST 재호출 금지 |
| A3 | 이전에 FAILED 인 게시물 재요청 후 5분 | 창 기준은 이번 POST 시각(옛 `requestedAt` 아님) |
| A4 | 4번째 POST | 400 "더 이상 AI 리뷰를 다시 요청할 수 없습니다." |
| A5 | 정지 회원 POST / GET | 403 / 200 |
| A6 | 남의 게시물 / 비공개 게시물 | 404 (요청 전 상태 NONE과 구분) |
| A7 | FAILED + `canRequestAgain=false` | 재요청 버튼 숨김 |

**토큰**

| # | 입력 | 기대 결과 |
| --- | --- | --- |
| K1 | 만료된 액세스로 `GET /notifications` | 401 UNAUTHORIZED → refresh → 재전송 성공 |
| K2 | 같은 리프레시를 두 번 refresh | 두 번째 401 REAUTHENTICATION_REQUIRED, 세션 전체 폐기 |
| K3 | refresh 직후 이전 리프레시로 재시도 | 401 REAUTHENTICATION_REQUIRED + 신규 리프레시도 무효(계보 폐기) |
| K4 | 비활동 만료 초과(예: 30일 미접속) 후 refresh | 401 REAUTHENTICATION_REQUIRED |
| K5 | 최초 로그인 후 절대 만료(예: 90일) 도달 직전 정상 회전 | 새 만료 = min(now+비활동, 절대 만료) |
| K6 | 알 수 없는 리프레시로 logout | 204 |
| K7 | 정지 회원의 액세스로 쓰기 API | 403 (토큰은 유효) |
| K8 | 탈퇴 직후 액세스로 아무 API | 401 UNAUTHORIZED, refresh도 401 REAUTHENTICATION_REQUIRED |

**피드백·배너·설정**

| # | 입력 | 기대 결과 |
| --- | --- | --- |
| B1 | `content="   "` | 400 |
| B2 | strip 후 1000 code point / 1001 | 201 / 400 "피드백 내용은 1000자 이하여야 합니다." |
| B3 | 앞뒤 공백 포함 content | 저장은 strip 값(응답엔 content 없음) |
| B4 | 정지 회원 피드백 | 201 |
| B5 | `GET /banners?page=1&pageSize=101` | 400 "조회 조건이 올바르지 않습니다." |
| B6 | `GET /banners` 토큰 없음 | 200 |
| B7 | 만료된 토큰 포함 `GET /banners` | 401 (BANNER-006) |
| S1 | `PATCH /notification-settings {}` 또는 전부 null | 400 |
| S2 | `{"topicPushEnabled":false}` | 204, 나머지 유지 |

---

## 7. 푸시 계약과 기기 등록

### 7.1 FCM 메시지 (notification + data 동시 전송)

`data` 값은 모두 **문자열**. 근거: [G:notification-push-contract].

| `data.type` | `sourceType` | `notificationId` | `sourceId` 의미 | 클릭 시 이동 | 읽음 처리 |
| --- | --- | --- | --- | --- | --- |
| `POST_APPROVED` | `POST` | 있음 | 승인된 게시물 ID | 게시물 상세(`GET /posts/{sourceId}`). 알림 상세 선조회 불필요 | `PATCH /notifications/{notificationId}/read` |
| `POST_REJECTED` | `POST` | 있음 | 게시물 ID | 알림 상세 화면(`GET /notifications/{notificationId}`: 원본 사진 + 반려 사유). "새로 올리기" 버튼 없음 | 단건 읽음 |
| `AI_REVIEW_COMPLETED` | `POST` | 있음 | 게시물 ID(AI 리뷰 ID 아님) | 해당 게시물의 AI 리뷰 화면 → `GET /posts/{sourceId}/ai-review`부터 | 단건 읽음 |
| `AI_REVIEW_FAILED` | `POST` | 있음 | 게시물 ID | 위와 같음. 재요청 버튼은 `canRequestAgain` 기준(푸시 문구로 판단 금지) | 단건 읽음 |
| `NOTICE` | `NOTICE` | 있음 | 공지 ID(= eventId) | 알림 상세(`GET /notifications/{notificationId}`) 공지 제목·본문 | 단건 읽음 |
| `TOPIC` | `TOPIC` | **필드 없음** | 원래 발송 대상 주제 ID(**사용 금지**) | **클릭한 날의 오늘 주제 화면**(원래 sourceId 날짜로 고정하지 않음) | 호출 안 함 |
| `REMINDER` | `REMINDER` | **필드 없음** | 리마인더 ID(식별용) | 앱 메인 화면 | 호출 안 함 |

- `data` 5필드: `eventId`(로그 추적용, 중복 제거용으로 쓰지 않음), `notificationId`, `type`, `sourceType`, `sourceId`. `notification.title/body`는 표시 전용(문구로 분기 금지).
- 푸시에 썸네일·사유·회원ID·토큰 없음. 항상 클릭 후 인증 API로 조회.
- 알 수 없는 `type`/누락 필드/로그아웃 상태/계정 전환 시 이동 UX는 **규칙 미정**([G:notification-push-contract] 5절) → 7절 확인 목록. 임의 화면으로 이동 금지.
- 중복 수신 가능(SQS 재전달). 앱 중복 제거 정책은 규칙에 없음.
- 푸시 발송 시점 제한: 이벤트 후 30분 안에만 새 발송 시작(알림함 30일 보관과 별개). 클릭 시점의 API 결과(404 등)를 따른다.
- 설정 연동: 승인·반려 = `moderationPushEnabled`, 주제·리마인더 = `topicPushEnabled`, AI 리뷰 = `aiReviewPushEnabled`, **공지는 설정 무관 항상 발송**(정지 회원도). 정지 회원도 검수/AI/공지 푸시 수신. 설정은 계정 단위(기기별 아님). OS 알림 권한과 별개 — 서버 설정값은 OS 권한/수신 성공을 의미하지 않음.
- 주제 푸시는 오늘 주제에 `VALIDATING/PENDING/APPROVED` 게시물이 이미 있는 회원에게는 발송되지 않음(서버가 처리, 앱 추가 처리 없음).
- 포그라운드: Android `onMessageReceived`, iOS `willPresent`에서 표시 여부를 앱이 결정. 백그라운드: Android는 SDK가 알림 표시, 클릭은 Intent extras로 `data` 전달(서버는 `click_action` 미지정 → 새 실행·기존 Activity 둘 다 처리). iOS는 APNs `userInfo`에 `data` 필드가 평탄하게 들어옴(`notification/data` 중첩 구조 아님). Flutter/RN/Web은 해당 플러그인(`firebase_messaging`, `@react-native-firebase/messaging` 등)이 위 Android/iOS 메커니즘을 감쌈 [추정: 별도 확인 필요]. **Web 푸시(FCM Web)는 서버에서 Android/APNs 구성만 확인되어 웹 지원 여부 불명** → 7절.

### 7.2 기기 등록 시점 규칙

근거: NOTIFICATION-005, [G:push-device-registration], [코드:notification/service/PushDeviceService.java].

1. **로그인 성공 후 FCM 토큰이 준비되면** `PUT /push-devices/current {fcmToken}` (Bearer 액세스 토큰, 회원/세션은 JWT에서 식별, 본문에 기기 ID·플랫폼 없음). 성공 204.
2. **FCM 토큰이 바뀔 때마다**, 그리고 **인증된 상태로 앱이 재시작될 때마다** 같은 API로 갱신.
3. 회원가입(`social-signup`) 직후에도 로그인 완료이므로 동일하게 등록.
4. `session_id` 없는 구 JWT면 먼저 `POST /auth/refresh` 후 새 JWT로 등록.
5. 등록 실패(네트워크·5xx)가 로그인 상태를 해제하지 않는다. 재시도는 다음 앱 시작/토큰 변경 시. 등록 `401 REAUTHENTICATION_REQUIRED`는 refresh→재시도, refresh도 실패하면 로그인.
6. 같은 FCM 토큰이 다른 로그인 세션에 등록되면 이전 행이 삭제됨(기기에서 계정 전환 시 새 로그인 후 반드시 재등록).
7. 해제용 API 없음: 로그아웃(`/auth/logout`)과 탈퇴(`DELETE /users/me`)가 서버에서 기기 행을 삭제. 클라가 별도 해제 호출하지 않음. 로그아웃 후 재로그인하면 **새 등록 필요**.
8. 정지 회원도 등록 가능. 탈퇴 회원은 불가.
9. OS 알림 권한 요청 시점은 규칙에 없음(각 앱이 결정). 권한 거부여도 토큰 등록은 가능 [추정].

---

## 8. 규칙 문서 ↔ 서버 코드/OpenAPI 불일치, 규칙이 없는 곳 (백엔드 확인 필요 목록)

### 8.1 불일치

| # | 항목 | 규칙/가이드 | 서버 코드/OpenAPI | 영향/권고 |
| --- | --- | --- | --- | --- |
| D1 | 게시물 제목 수정 | POST-010 예외: "현재 게시물 수정 기능은 제공하지 않는다" | `PUT /posts/{postId}` 존재(PENDING·APPROVED, 참여 기간 내, 제목만). OpenAPI에도 존재. feature-map도 "제목 수정·삭제" 기능으로 기재 | 규칙 문서가 낡음 [추정]. 클라가 구현할지 백엔드 확인 필요. 수정 가능 조건(PENDING/APPROVED + 주제 OPEN 기간)이 규칙 ID 없이 코드에만 있음 |
| D2 | 제목 앞뒤 공백 | POST-005: "내용이 있는 제목의 앞뒤 공백은 제거하지 않고 길이에 포함한다" | `PostTitle`이 `strip()` 후 길이 판정·저장 (DTO 설명도 "앞뒤 공백 제거 후 최대 10자") | 클라 길이 카운트는 strip 후 기준으로(코드 기준). 규칙/코드 중 정정 필요 |
| D3 | `GET /posts/{postId}` 인증 | POST-007: 상세는 로그인 필요 (일치). 단 `PostController`는 `@OptionalLoginUser`를 쓰고 `@RequiresExistingUser`로 실질 필수 | 일치 | – (확인 완료) |
| D4 | 알림 type `TOPIC`/`REMINDER` | NOTIFICATION-010/016: 주제·리마인더는 **알림함 기록 없음** | `NotificationType` enum에 `TOPIC`, `REMINDER`가 포함되고 `GET /notifications`의 `type` 설명에 TOPIC 포함 | 알림함 목록에 이 타입이 올 수 있는지 불명. 클라는 알 수 없는/예상 밖 type에 안전하게 대응 |
| D5 | 네트워킹 문서의 `FORBIDDEN` 정의 | devwiki: "정지 회원 포함 여부는 기능별 확인" | 코드로 확인: 정지 쓰기 → 403 FORBIDDEN | devwiki 갱신 권고 |
| D6 | feature-map "소셜 로그인 Apple/Google/Kakao" | 이번 범위 카카오만 | 서버는 3종 지원 | 범위 결정 사항(보류 표기) |
| D7 | 사인 업로드 응답 필드 | SIGN-002: PNG ≤1MiB | 게시물 업로드는 `contentType`/`maxBytes` 제공, 사인 업로드 응답엔 없음 | 클라 상수 사용 — 값 변경 시 앱 동기화 필요 |
| D8 | 정지 회원 `GET /posts/today` | POST-011은 정지 언급 없음 | `@RequiresUsableUser` → 403 | 정지 회원의 작성 진입 안내 필요 |
| D9 | 게시물 삭제 권한 오류 | POST-010 | 타인 게시물 → 403 `FORBIDDEN` (게시물 존재 노출), 없는 게시물 404 | 규칙에 403 문구 없음 |
| D10 | 사인 업로드/교체 문서 | SIGN-003 "정지 회원은 현재 사인 조회 가능" | 일치(GET은 `@RequiresExistingUser`) | – |

### 8.2 규칙이 없거나 불명확 → 백엔드 확인 요청

1. **약관 동의**: AIREVIEW-006은 "회원가입의 필수 약관 동의로 갈음"이라 하나, `social-signup` 계열 API에 약관 동의 필드(버전·시각)가 없다. 약관 동의 기록/버전 관리는 서버가 안 하는가? 약관 문구·URL 출처는? (OpenAPI 스키마 상세는 확인 못함)
2. **카카오 이메일**: `User.create(email)` 에 ID Token 이메일을 쓰는데 카카오 정책(`OidcEmailPolicy`) 어느 쪽인지, 이메일 미동의(null) 시 가입 가능한지 불명. 카카오 개발자 콘솔 동의 항목 `account_email` 필요 여부.
3. **카카오 ID Token 요건**: OIDC 활성화, nonce 지원, 앱 키(audience) 사용. SDK에서 `idToken`을 받는 방법(iOS/Android/Flutter/RN/Web별)과 **Web(JS SDK)에서의 nonce 처리 방식**은 코드로 확인 불가.
4. **토큰 수명 실제값**: 개발/운영 서버의 `ACCESS_TOKEN_EXPIRATION`, `REFRESH_TOKEN_*`는 환경변수. 예시 15분/30일/90일뿐. 응답의 `expiresIn` 사용으로 대체 가능하나 QA 기준값 필요.
5. **refresh 응답 유실 복구**: 네트워크로 새 리프레시를 못 받은 경우 유예(grace) 없음 → 사용자는 재로그인. 이것이 의도인가? 클라 재시도 허용 정책 확인.
6. **`SIGNATURE_PROCESSING_PENDING` 재시도 간격·횟수**, `POST_IMAGE_PROCESSING_TIMEOUT`/`SIGNATURE_PROCESSING_TIMEOUT` 운영값(예시 7분만 확인).
7. **이미지 처리 실패 시 알림 없음**: `VALIDATING → REJECTED`(처리 실패)가 푸시·알림함으로 안 오고 작성자에게는 게시물이 조용히 사라진다. 클라가 이를 감지할 방법은 `GET /posts/today`·캘린더뿐. 의도된 것인가? 또는 `POST /posts` 이후 상태 조회 API 필요?
8. **게시물 이미지 해상도 상한**(`TOO_MANY_PIXELS`)과 허용 WebP 세부 조건 수치. 클라 사전 검증 기준.
9. **정지 상태 노출**: 사용자 본인의 정지 여부를 알 수 있는 API/필드 없음(403 응답으로만). 프로필/정보 API가 필요한가?
10. **카카오 연결 해제(unlink)**: 탈퇴 시 서버가 카카오 연결을 끊는가(Apple만 확인됨). 앱스토어/카카오 정책상 필요 여부.
11. **FCM 토큰 갱신 실패/재시도**: 규칙에 재시도 횟수·간격 없음.
12. **푸시 이동 UX 미정**: 알 수 없는 type, 필드 누락, 로그아웃 상태 클릭, 계정 전환 시 동작(문서 5절이 "앱과 합의 필요"로 남김). 로그아웃 상태에서 푸시 클릭 시 로그인 후 목적지 복귀를 할지 결정 필요.
13. **포그라운드 푸시 표시 정책**: AI 리뷰 화면 보는 중 표시 생략은 "권장"만 있음. 다른 type의 포그라운드 처리 규칙 없음.
14. **웹 푸시(Web FCM)**: 서버 푸시 구성은 Android TTL/APNs만 문서화. 웹 클라이언트의 기기 등록(`PUT /push-devices/current`)·수신 지원 여부 불명 → Web 클라이언트 푸시 범위 결정 필요.
15. **서버 배포 상태**: 푸시 계약 문서는 "실제 AWS·Firebase·기기 수신, 서버 배포 미확인"을 반복 명시. 공지·AI 리뷰·리마인더 푸시 모두 실기기 수신 미확인.
16. **앱 버전 전송**: FEEDBACK-004는 관리자가 "앱 버전"을 본다고 하나, 사용자 API 어디에도 앱 버전을 보내는 필드/헤더가 없다(DB 컬럼 `users.app_version`만 있고 설정 코드 없음). 앱 버전 전송 방법 필요(헤더? 피드백 필드?).
17. **앱 강제 업데이트**: 서버 규칙 없음(feature-map "규칙 없음", 스토어 조회). 5개 클라 공통 정책 필요.
18. **Rate limit / 429 / Retry-After**: 서버 코드에서 확인 못함(규칙·핸들러 없음). 클라는 429/503 방어적으로만 처리.
19. **피드 정렬 세부**: 인기순 동점 정렬 방향, 랜덤 seed 유효 기간·재사용 규칙, 랜덤 중 새 글 추가 시 페이지 중복 허용 여부(오프셋 방식이라 중복/누락 허용이 POST-012에만 명시, 피드에는 명시 없음 → [추정] 동일).
20. **좋아요 수 정합**: 피드에서 낙관적 UI 후 서버 응답 `likeCount`로 덮어쓰는 규칙은 LIKE-004 근거로 [추정].
21. **작성 가능 주제 판정 클라 규칙**: 피드 날짜 선택 UI 범위(가장 오래된 주제 날짜)에 대한 API 없음. 주제가 없는 날은 404이므로 "탐색형" 처리 필요.
22. **게시물 삭제 시 404 재시도**: 네트워킹 문서가 "재시도 중 404를 삭제 완료로 볼지 백엔드 확인"으로 남김. 코드: 이미 삭제한 본인 게시물 재삭제는 **204**(POST-010)이지만 `findByIdForUpdate`가 삭제 후 행을 못 찾을 경우의 404 여부는 코드로 확정 못함.
23. **정지 회원 로그인 안내**: 로그인은 성공하므로 첫 쓰기 시점에서야 403을 만난다. 로그인 직후 정지 안내가 필요한지 정책 미정.

---

## 9. 구현 체크리스트 (5개 클라이언트 공통)

1. 모든 오류는 `{errorCode, message}`로 파싱하고, 알 수 없는 `errorCode`는 `BUSINESS_ERROR`로 폴백.
2. 401 `UNAUTHORIZED` → single-flight refresh → 원 요청 1회 재전송. 401 `REAUTHENTICATION_REQUIRED` → 로그아웃 처리.
3. 새 리프레시 응답을 즉시 영속화, refresh 요청은 자동 재시도 금지.
4. "오늘"은 항상 KST 또는 서버 응답(`/posts/today`, `/topics`의 `phase/startsAt/endsAt`)에서 얻는다.
5. 업로드: presigned PUT에는 인증 헤더를 붙이지 않고, 게시물은 응답 `contentType`을, 사인은 `image/png`를 그대로 사용. 크기는 클라가 사전 검증(5MiB/1MiB).
6. 정지 회원: 쓰기 403 처리와 `GET /posts/today` 403 처리.
7. AI 리뷰: 3초 간격·5분 창·`status` 분기·POST 1회.
8. 푸시: type별 라우팅표(7.1), `TOPIC`/`REMINDER`은 notificationId 없음, 로그아웃/탈퇴 후 푸시 클릭 처리 정책 확정 전까지 [미정].

---

## 부록: 근거 파일 목록

- 규칙: `docs/business-rules/rules/{user,post,topic,sign,like,feedback,banner,notification,ai-review}.md` (admin.md는 관리자 전용, 클라 영향 없음으로 판단)
- 가이드: `docs/business-rules/guides/{ai-review,push-device-registration,notification-push-contract,notification-inbox,author-public-posts}.md`
- 서버: `backend/src/main/java/com/chalkak/backend/{auth,user,post,topic,like,feedback,banner,notification,aireview,exception,config}/**`, `backend/src/main/resources/application.yml`, `backend/deploy/examples/application.*.env.example`(키/시크릿 값은 미기재, 만료 설정 예시만 인용)
- 참고: `devwiki/wiki/chalkak/feature-map.md`, `devwiki/wiki/common/networking-errors-retry.md`
- OpenAPI: `https://chalkak-dev.pysun.kr/v3/api-docs` (WebFetch로 경로·메서드 26개 일치 확인, `PUT /posts/{postId}` 존재 확인. 요청/응답 컴포넌트 스키마는 응답에 없어 확인하지 못했고 서버 코드 DTO를 기준으로 작성)
