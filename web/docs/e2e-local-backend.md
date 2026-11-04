# Web E2E 결과: 로컬 백엔드 (2026-11-04)

로컬 Rust 백엔드(`https://api.127.0.0.1.sslip.io/api/v1/`, 가짜 OIDC 모드)에 붙여 Chromium(Playwright, headless)으로 확인한 결과다. 사용자 결정에 따라 로그인은 하네스 키로 서명한 가짜 카카오 id_token으로 받은 세션을 `/dev/session`에 주입했고, 백엔드와 Web 스펙의 차이는 고치지 않고 기록만 한다.

## 연결 방법

- `web/.env.local`(gitignore 대상)
  - `PROXY_TARGET=https://api.127.0.0.1.sslip.io`
  - `VITE_API_BASE_URL`: 비움. 백엔드 CORS가 `/api/v1/admin/**`에만 열려 있으므로 같은 출처 프록시가 필수다.
  - `UPLOAD_PROXY_ALLOWED_HOSTS=<로컬 S3 호스트>`: dev 업로드 프록시는 amazonaws.com과 loopback만 기본 허용한다.
- `NODE_EXTRA_CA_CERTS`: 로컬 Caddy 루트 CA를 지정한다. Vite 프록시가 `secure: true`라서 필요하다.
- 카카오 웹 로그인은 이번에 확인하지 않았다. 확인하려면 다음이 필요하다.
  - 백엔드가 REST 키 aud를 받아야 한다. 지금은 aud를 하나만 허용하므로 그동안 네이티브 카카오 로그인이 막힌다.
  - `--real-oidc`로 다시 띄워야 한다.
  - 카카오 콘솔에 Web 도메인과 redirect `/login/kakao-callback`을 등록해야 한다.

## 결과

A는 백엔드 응답 그대로 돌린 결과이고, B는 백엔드에 없는 스펙 필드만 브라우저에서 채워 넣고 돌린 결과다.

| 흐름 | A | B |
|---|---|---|
| 세션 주입 → 회원 홈 | 통과 | 통과 |
| 홈 히어로·벨 | 통과 | 통과 |
| 홈 오늘 인기 | 실패: 백엔드 1 | 통과 |
| 홈 ISSUE 배너 | 실패: 백엔드 3 | 실패: 백엔드 3 |
| 새로고침 후 세션 복원 | 통과 | 통과 |
| 업로드(선택 → 편집 → 제출 → 성공) | 통과 | 통과 |
| 전시 목록 | 실패: 백엔드 1 | 통과 |
| 전시 상세·좋아요 | 막힘: 백엔드 2 | 통과 |
| 기록 달력 | 썸네일 깨짐(클라이언트, 수정함) | 같음 |
| 알림함 | 통과 | 통과 |
| 알림 상세 → 게시물 | 실패: 백엔드 2 | 통과 |
| 설정 사인 카드 | 통과 | 통과 |
| 설정 푸시 스위치 | 실패: 백엔드 4 | 통과 |
| 피드백 보내기 | 통과 | 통과 |
| AI 리뷰 | 막힘: 백엔드 5 | 막힘: 백엔드 5 |
| 로그아웃 | 통과 | 통과 |

## 클라이언트 수정

- **기록 화면 썸네일이 깨졌다.** 표시용 `<img>`가 `crossOrigin="anonymous"`라서, CORS 헤더를 주지 않는 이미지 CDN에서는 깨진다. 표시용 이미지에서 이 속성을 뺐다.
- **남은 문제: 달력 이미지 저장.** 저장(canvas)은 여전히 CORS로 이미지를 읽는다. CDN에 CORS가 없으면 썸네일 없이 날짜만 그려진다. CDN에 CORS를 추가할지 정해야 한다(아래 6).

## 백엔드·인프라 차이 (로컬 Rust 백엔드)

1. 게시물 목록 `posts[].authorId`가 없다. REQ-DISP-034를 따른 Web 디코더에서는 필수 필드다.
2. 게시물 상세 `authorId`가 없다.
3. `/api/v1/banners` 라우트가 없다.
4. `GET /notification-settings`에 `aiReviewPushEnabled`가 없다.
5. `/posts/{id}/ai-review`(GET·POST)가 없다.
6. 이미지 CDN이 `Access-Control-Allow-Origin`을 주지 않는다. 로컬 CDN과 팀 dev CloudFront가 모두 그렇다.

## 관찰 (버그 아님)

새로고침 직후에는 access token이 메모리에 없다(TC-AUTH-060). 그래서 첫 요청 몇 건이 401을 받고, refresh를 한 번 한 뒤 재시도해서 회복한다. 기능 문제는 없다.
