import type { ApiClient } from '../../core/net/ApiClient';
import type { DateString } from '../../core/time/kst';

/** POST /posts/uploads 응답(API §3.1). maxBytes는 서버 값 그대로(64비트 정수일 수 있다). */
export interface UploadPolicy {
  uploadId: string;
  uploadUrl: string;
  expiresInSeconds: number;
  /** 서버 값 그대로. image/webp가 아니면 준비 실패(호출하는 쪽이 확인한다). */
  contentType: string;
  maxBytes: number;
}

/** GET /topics?date= 응답에서 업로드가 쓰는 부분. */
export interface UploadTopic {
  id: string;
  title: string;
  topicDate: DateString;
}

export type CreatedModerationStatus = 'VALIDATING' | 'PENDING';

/** POST /posts 201 응답. */
export interface CreatedPost {
  postId: string;
  moderationStatus: CreatedModerationStatus;
}

/**
 * 업로드가 쓰는 API(api-contract §1.3, §3.1, §4.1). 던지는 것은 ApiClient와 같다(ApiError, NetworkError, InvalidResponseError, 취소는 AbortError).
 * 응답 해석에서 계약 위반이면 InvalidResponseError(필수 필드 누락, 타입 불일치, 요청한 날짜와 다른 topicDate, 알 수 없는 moderationStatus).
 */
export class UploadRepository {
  constructor(protected readonly deps: { api: ApiClient }) {}

  /** GET /topics?date={date}. 응답 topicDate가 요청 date와 다르면 InvalidResponseError. 404 등 오류는 그대로 던진다(null로 바꾸지 않는다). */
  fetchTopic(_date: DateString, _signal?: AbortSignal): Promise<UploadTopic> {
    throw new Error('not implemented');
  }

  /**
   * POST /posts/uploads(본문 없음, Authorization). 멱등 발급이라 D-21 재시도(네트워크 오류·5xx에 0.5s, 1s로 최대 2회)를 탄다.
   * uploadId, uploadUrl, expiresInSeconds, contentType, maxBytes가 모두 있어야 한다(없으면 InvalidResponseError).
   */
  issuePolicy(_signal?: AbortSignal): Promise<UploadPolicy> {
    throw new Error('not implemented');
  }

  /**
   * POST /posts JSON {topicId, photoUploadId, title}. title이 null이면 null을 그대로 보낸다. 자동 재시도 없음(비멱등).
   * 201 본문의 moderationStatus는 VALIDATING 또는 PENDING만 받아들인다(그 밖은 InvalidResponseError, 서버에는 게시물이 생겼을 수 있다).
   */
  createPost(_input: { topicId: string; photoUploadId: string; title: string | null }, _signal?: AbortSignal): Promise<CreatedPost> {
    throw new Error('not implemented');
  }
}
