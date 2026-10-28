import {
  CancelledError,
  HttpError,
  InvalidResponseError,
  NetworkError,
} from '../../core/http/ApiError';
import { t } from '../../shared/copy';
import type { PostCreationRepository, UploadPolicy } from '../../data/post/PostCreationRepository';
import type { TodayModerationStatus } from '../../data/post/PostModels';
import type { PostRepository } from '../../data/post/PostRepository';
import type { KstDate } from '../../core/time/KstDate';
import { mapUploadError, type UploadStage } from './mapUploadError';
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

/** PUT은 끝났지만 POST /posts의 결과를 확정하지 못한 업로드(같은 uploadId로 다시 제출한다, REQ-UPL-050). */
type PendingCreate = { policy: UploadPolicy; issuedAtMs: number; bytes: Uint8Array };

/**
 * 제출 순서(REQ-UPL-040): 준비 완료 대기 -> URL 만료 확인 -> PUT -> POST /posts.
 * POST /posts는 자동 재시도하지 않는다. 응답을 못 받거나(타임아웃·끊김)·201 본문이 계약을 어기면 GET /posts/today로 복구하고(D-07),
 * 400/404 BUSINESS_ERROR는 message가 아니라 GET /posts/today로 판정한다(D-02). 오류 분기는 errorCode·HTTP 상태·호출 API로만 한다.
 *
 * 재제출(REQ-UPL-050): PUT이 끝난 뒤 POST 결과를 확정하지 못했으면 임시 파일은 지우되(REQ-UPL-048) WebP 바이트는 메모리에만 들고 있다가,
 * 다음 제출에서 URL이 아직 유효하면 같은 URL로 PUT을 다시 보내고, 만료됐으면(이미 올라간 객체가 있으므로) PUT 없이 같은 uploadId로 POST한다(TC-UPL-072).
 */
export class UploadSubmitter {
  private pending: PendingCreate | null = null;

  constructor(private readonly deps: UploadSubmitterDeps) {}

  async submit(input: SubmitInput, signal?: AbortSignal): Promise<SubmitOutcome> {
    const { preparation } = this.deps;
    try {
      let upload = this.pending;
      if (!upload) {
        let prepared;
        try {
          prepared = await preparation.ready(signal);
        } catch (error) {
          return this.failure('policy', error, signal);
        }
        const bytes = await preparation.readBytes(prepared);
        upload = { policy: prepared.policy, issuedAtMs: prepared.issuedAtMs, bytes };
        const failure = await this.put(upload, signal);
        if (failure) return failure;
        // 올린 뒤에는 임시 파일이 필요 없다. 정책도 다시 쓰지 않는다.
        preparation.invalidate();
        this.pending = upload;
      } else if (preparation.isUrlLive(upload)) {
        const failure = await this.put(upload, signal);
        if (failure) return failure;
      }
      return await this.create(upload, input, signal);
    } catch (error) {
      return this.failure('create', error, signal);
    }
  }

  private async put(upload: PendingCreate, signal?: AbortSignal): Promise<SubmitOutcome | null> {
    try {
      await this.deps.repository.uploadPhoto(upload.policy, upload.bytes, signal);
      return null;
    } catch (error) {
      // 거절된 정책은 버리고 다음 제출은 정책 발급부터 다시 한다(REQ-UPL-059).
      this.pending = null;
      this.deps.preparation.invalidate();
      return this.failure('put', error, signal);
    }
  }

  private async create(
    upload: PendingCreate,
    input: SubmitInput,
    signal?: AbortSignal,
  ): Promise<SubmitOutcome> {
    const { repository } = this.deps;
    // POST를 보내기 전에만 취소한다. 요청이 나간 뒤에는 서버에 만들어졌을 수 있어 끝까지 기다리고(홈 갱신을 위해 결과를 알린다),
    // 복구 확인(GET /posts/today)도 취소하지 않는다.
    if (signal?.aborted) return { kind: 'cancelled' };
    try {
      const created = await repository.create({
        topicId: input.topicId,
        photoUploadId: upload.policy.uploadId,
        title: input.title,
      });
      this.finish();
      return {
        kind: 'success',
        postId: created.postId,
        moderationStatus: created.moderationStatus,
      };
    } catch (error) {
      if (error instanceof CancelledError) return { kind: 'cancelled' };
      // 응답을 못 받았거나 본문이 계약을 어겼다: 서버에는 만들어졌을 수 있다(D-07).
      if (error instanceof NetworkError || error instanceof InvalidResponseError) {
        const failedText =
          error instanceof NetworkError ? t('upload.error.network') : t('upload.error.create');
        return this.recover(failedText);
      }
      if (error instanceof HttpError && (error.status === 400 || error.status === 404)) {
        if (error.errorCode === 'BUSINESS_ERROR') return this.judge(error, input);
      }
      return this.failure('create', error);
    }
  }

  /** D-07: GET /posts/today로 이미 만들어졌는지 확인한다. */
  private async recover(notPostedMessage: string): Promise<SubmitOutcome> {
    try {
      const today = await this.deps.posts.getToday();
      if (today.isPosted) {
        this.finish();
        return { kind: 'success', postId: today.postId, moderationStatus: today.moderationStatus };
      }
      return { kind: 'failed', message: notPostedMessage };
    } catch (error) {
      const failure = mapUploadError('create', error);
      if (failure.kind !== 'message') return failure;
      return { kind: 'failed', message: t('upload.error.network') };
    }
  }

  /** D-02: 400/404 BUSINESS_ERROR는 서버 message가 아니라 today로 판정한다. */
  private async judge(error: HttpError, input: SubmitInput): Promise<SubmitOutcome> {
    let today;
    try {
      today = await this.deps.posts.getToday();
    } catch (todayError) {
      if (todayError instanceof HttpError && todayError.status === 404) {
        this.finish();
        return { kind: 'failed', message: t('upload.error.topic-changed') };
      }
      const failure = mapUploadError('create', todayError);
      if (failure.kind !== 'message') return failure;
      // 판정 조회가 실패한 경우의 문구는 정해져 있지 않다(upload-edit.md 확인 필요): 입력을 유지하고 일반 실패 문구를 보인다.
      return { kind: 'failed', message: t('upload.error.create') };
    }
    this.finish();
    if (today.isPosted) return { kind: 'failed', message: t('upload.error.duplicate') };
    if (today.topicDate.toString() !== input.topicDate.toString()) {
      return { kind: 'failed', message: t('upload.error.topic-changed') };
    }
    return { kind: 'failed', message: error.serverMessage ?? t('upload.error.create') };
  }

  /** 끝났거나 확정적으로 거절됐다: 들고 있던 바이트와 정책을 버리고 다음 제출은 처음부터 준비한다. */
  private finish(): void {
    this.pending = null;
    this.deps.preparation.invalidate();
  }

  private failure(stage: UploadStage, error: unknown, signal?: AbortSignal): SubmitOutcome {
    if (signal?.aborted) return { kind: 'cancelled' };
    const mapped = mapUploadError(stage, error);
    return mapped.kind === 'message' ? { kind: 'failed', message: mapped.message } : mapped;
  }
}
