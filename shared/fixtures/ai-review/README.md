# ai-review fixture 메모

- 모든 경로는 내 오늘 게시물 `22222222-2222-4222-8222-222222222201`의 `/api/v1/posts/<id>/ai-review`.
- 기준 시각 03:00:00Z. 처리 중 `requestedAt`은 02:59:50Z, 완료는 02:58:00Z → 02:58:21Z.
- `ai-review-get__503-retry-after`: 게이트웨이형 HTML 본문(`_raw`) + `Retry-After: 1` 헤더.
- `ai-review-post__timeout`: `_fault: timeout`, `delayMs: 20000`(status 없음).
- 새 `_kind` 없음.
