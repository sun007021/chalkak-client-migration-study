# common fixtures

- 오류·본문 이상 케이스는 아무 API에나 적용되는 일반 시나리오다. `_routes.json`의 path는 대표 엔드포인트일 뿐이며(예: `GET /api/v1/notifications/unread-status`, `GET /api/v1/posts/today`) 같은 경로를 다른 영역 fixture도 쓸 수 있으므로 mock 서버는 시나리오(fixture 이름)로 선택해야 한다.
- 429/503은 게이트웨이가 만든다고 보고 본문을 `text/plain`으로 둔다(서버 코드에 429 없음, 추정).
- `error__service-unavailable-503-bad-retry-after`는 `Retry-After: -1`만 담는다. 비숫자·과거 날짜·매우 큰 값은 테스트가 헤더를 바꿔 변형한다.
- `presigned-put__ok`: S3 PUT 응답 200 + `ETag`. 업로드 ID는 `55555555-5555-4555-8555-555555555501`(영역별: 가입 사인 `...12`, 사인 변경 `...21`).
