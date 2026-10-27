# 공용 fixture 규약

다섯 클라이언트의 계약(`C`) 테스트, 화면(`W`) 테스트, mock 서버(`E`)가 같은 파일을 읽는다. 플랫폼은 이 파일을 복제하지 않고 상대 경로(`../shared/fixtures/...`)나 빌드 시 복사로 쓴다.

## 1. 파일

- 경로: `shared/fixtures/<영역>/<api>__<상황>.json`. 이름은 [테스트 카탈로그](../../docs/testing/catalog/)의 fixture 열과 **글자 그대로** 같다.
- 영역 폴더: `common`, `auth`, `boot`, `onboarding`, `signature`, `settings`, `feedback`, `anl`, `time`, `home`, `banner`, `display`, `feed`, `like`, `record`, `upload`, `ai-review`, `notification`, `push`.
- 파일 내용은 **서버가 실제로 돌려주는 응답 본문 그대로**다. 상태 코드·메서드·경로는 파일이 아니라 `manifest.json`에 둔다.
- 오류 본문은 `{"errorCode": "...", "message": "..."}`. `message`는 서버 문구를 그대로 쓴다([api-contract](../../docs/reference/api-contract.md)).
- JSON이 아닌 응답은 예약 키로 표현한다. 예약 키는 `_`로 시작하고, 예약 키가 있는 파일은 본문이 아니라 응답 묘사다.

  | 경우 | 파일 내용 |
  | --- | --- |
  | 본문 없음(204 등) | `{"_raw": ""}` |
  | HTML·텍스트·깨진 JSON | `{"_raw": "<html>...", "_contentType": "text/html"}` |
  | 연결 실패·타임아웃(응답 없음) | `{"_fault": "timeout"}` 또는 `{"_fault": "disconnect"}` |
  | 푸시 페이로드(HTTP 응답이 아님) | `{"_kind": "push", "data": {...}, "notification": {"title", "body"}}` (`notification`은 선택, manifest의 `method`는 `PUSH`) |
  | 요청 본문 예시(클라이언트가 보내야 하는 모양) | `{"_kind": "request", "body": {...}}` (manifest의 `method`는 실제 메서드, `status` 생략) |
| HTTP와 무관한 데이터 표(KST 날짜 경계 등) | `{"_kind": "case", "cases": [...]}` (manifest의 `method`는 `NONE`, `path`는 `-`) |
| 보안 저장소 상태(앱 시작 분기) | `{"_kind": "storage", "stored": {...}, "expect": {...}}` (`NONE`) |
| 플랫폼 SDK 응답(Play In-App Update 등) | `{"_kind": "native", "source", "data", "expect"}` (`NONE`) |

## 2. 고정 값

여러 파일이 서로 맞물리도록 아래 값을 쓴다. 테스트의 가짜 시계도 이 시각에서 시작한다.

| 이름 | 값 |
| --- | --- |
| 기준 시각(`FIXTURE_NOW`) | `2026-10-27T03:00:00Z` (KST 2026-10-27 12:00, 화요일) |
| 오늘 주제 날짜 | `2026-10-27` |
| 오늘 주제 ID | `11111111-1111-4111-8111-111111111127` |
| 오늘 주제 제목 | `가을 하늘` |
| 어제 주제 | `11111111-1111-4111-8111-111111111126`, `2026-10-26`, `단풍` |
| 내 userId | `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa` |
| 다른 작성자 userId | `bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb` |
| 내 오늘 게시물 postId | `22222222-2222-4222-8222-222222222201` |
| 다른 사람 게시물 postId | `22222222-2222-4222-8222-2222222222NN` (NN = 02~99) |
| 알림 ID | `33333333-3333-4333-8333-3333333333NN` |
| 배너 ID | `44444444-4444-4444-8444-4444444444NN` |
| 업로드 ID | `55555555-5555-4555-8555-5555555555NN` |
| 푸시 eventId | `66666666-6666-4666-8666-6666666666NN` (공지는 eventId = sourceId) |
| 공지 ID | `77777777-7777-4777-8777-7777777777NN` |
| 세션 ID | `88888888-8888-4888-8888-8888888888NN` |
| 리마인더 ID | `99999999-9999-4999-8999-9999999999NN` |
| 주제 ID(임의 날짜) | `11111111-1111-4111-8111-1111111111DD` (DD = 해당 월의 일, 위 오늘·어제 주제가 이 규칙의 예) |
| 피드백 ID | `12121212-1212-4121-8121-1212121212NN` (`feedback/feedbacks__created` = `...01`) |
| 이미지 URL | `https://cdn.example.test/posts/<postId>/original.webp`, 썸네일 `.../thumbnail.webp` |
| presigned URL | `http://localhost:4010/__upload/<uploadId>?X-Amz-Expires=300` (mock 서버가 PUT을 받는다). mock 서버는 응답 본문의 `http://localhost:4010`을 요청의 `Host` 헤더 값으로 치환해 돌려주므로, Android 에뮬레이터(`10.0.2.2:4010`)에서도 그대로 닿는다 |
| accessToken / refreshToken | `fixture-access-token-1` / `fixture-refresh-token-1` (갱신 후 `-2`) |

UUID는 소문자 정규형만 쓴다. 시각은 UTC ISO-8601(`Z`), 날짜는 `yyyy-MM-dd`.

## 3. manifest

`manifest.json`은 영역별 `<영역>/_routes.json`을 합친 것이다. 직접 고치지 말고 영역 파일을 고친 뒤 `node shared/scripts/build-manifest.mjs`를 돌린다(`validate-fixtures`가 동기화 여부를 검사한다).

```json
{
  "fixture": "home/posts-today__posted-pending.json",
  "method": "GET",
  "path": "/api/v1/posts/today",
  "query": {"date": "2026-10-27"},
  "status": 200,
  "headers": {"Retry-After": "3"},
  "delayMs": 0,
  "tc": ["TC-HOME-012"]
}
```

`query`, `headers`, `delayMs`, `tc`는 선택이다. 경로의 ID 자리는 실제 값으로 적는다(`/api/v1/posts/22222222-...`).

## 4. 영역별 추가 메모

영역 폴더의 `README.md`에 그 영역만의 가정(추가 고정 ID, 추정한 서버 문구 등)을 적었다. 서버 계약에 없어 추정한 값은 그 README에 "추정"으로 표시돼 있다. 같은 method+path를 여러 fixture가 쓰는 것은 정상이다(상황별 응답). mock 서버는 시나리오로 고른다.
