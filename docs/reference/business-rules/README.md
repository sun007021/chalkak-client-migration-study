# 찰캌 비즈니스 규칙 스냅샷

원본 `woowacourse-teams/2026-Chalkak`의 `docs/business-rules/`를 2026-10-27 `main` 기준으로 복사한 읽기 전용 사본이다. 이 레포에서는 고치지 않는다. 원본이 바뀌면 다시 복사한다.

- `rules/`: 도메인별 현재 규칙. 규칙 ID(`POST-004` 등)는 요구사항·테스트 문서에서 그대로 인용한다.
- `guides/`: 앱의 API 호출 순서와 오류 처리 안내.
- `decisions/`: 정책이 바뀐 이유와 영향(규칙 문서가 링크하므로 함께 복사). Notion 동기화 파일과 템플릿은 복사하지 않았다.

| 도메인 | 문서 |
| --- | --- |
| 회원 | [user.md](rules/user.md) |
| 게시물 | [post.md](rules/post.md) |
| 주제 | [topic.md](rules/topic.md) |
| 사인 | [sign.md](rules/sign.md) |
| 좋아요 | [like.md](rules/like.md) |
| 피드백 | [feedback.md](rules/feedback.md) |
| 배너 | [banner.md](rules/banner.md) |
| 알림함 | [notification.md](rules/notification.md) |
| AI 리뷰 | [ai-review.md](rules/ai-review.md) |
| 관리자(클라이언트 범위 밖) | [admin.md](rules/admin.md) |

규칙 문서와 서버 코드가 다른 곳은 [../api-contract.md §8](../api-contract.md)에 정리돼 있고, 이 레포에서 어떻게 처리할지는 [../../spec/decisions.md](../../spec/decisions.md)에서 정한다.
