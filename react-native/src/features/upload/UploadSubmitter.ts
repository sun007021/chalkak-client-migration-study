import type { PostCreationRepository } from '../../data/post/PostCreationRepository';
import type { TodayModerationStatus } from '../../data/post/PostModels';
import type { PostRepository } from '../../data/post/PostRepository';
import type { KstDate } from '../../core/time/KstDate';
import type { UploadPreparation } from './UploadPreparation';

export type SubmitInput = {
  /** 게이트 통과 때 고정한 주제(시계로 다시 계산하지 않는다, REQ-UPL-008). */
  topicId: string;
  topicDate: KstDate;
  title: string | null;
};

export type SubmitOutcome =
  /** 201 또는 응답 유실·계약 위반 복구에서 isPosted=true를 확인했다. 상태는 응답(복구면 today)의 값. */
  | { kind: 'success'; postId: string; moderationStatus: TodayModerationStatus }
  /** 입력은 유지하고 message를 보여 준다. */
  | { kind: 'failed'; message: string }
  | { kind: 'login-required' }
  | { kind: 'session-expired' }
  | { kind: 'cancelled' };

export type UploadSubmitterDeps = {
  repository: PostCreationRepository;
  posts: Pick<PostRepository, 'getToday'>;
  preparation: UploadPreparation;
};

/**
 * 제출 순서(REQ-UPL-040): 준비 완료 대기 -> URL 만료 확인 -> PUT -> POST /posts.
 * POST /posts는 자동 재시도하지 않는다. 응답을 못 받거나(타임아웃·끊김)·201 본문이 계약을 어기면 GET /posts/today로 복구하고(D-07),
 * 400 BUSINESS_ERROR는 message가 아니라 GET /posts/today로 판정한다(D-02). 오류 분기는 errorCode·HTTP 상태·호출 API로만 한다.
 */
export class UploadSubmitter {
  constructor(private readonly deps: UploadSubmitterDeps) {
    void this.deps;
  }

  submit(input: SubmitInput, signal?: AbortSignal): Promise<SubmitOutcome> {
    void input;
    void signal;
    throw new Error('not implemented');
  }
}
