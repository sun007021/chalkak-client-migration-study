import type { ApiClient } from '../../core/http/ApiClient';
import { asObject, nonNegInt, oneOf, str } from '../decode';

/** POST /posts/uploads 응답. maxBytes는 64비트 정수일 수 있어 숫자 그대로 보존한다(TC-UPL-024). */
export type UploadPolicy = {
  uploadId: string;
  uploadUrl: string;
  expiresInSeconds: number;
  contentType: string;
  maxBytes: number;
};

export type CreatePostInput = {
  topicId: string;
  /** 정책의 uploadId. */
  photoUploadId: string;
  /** 앞뒤 공백을 제거한 값, 없으면 null. */
  title: string | null;
};

export type CreatedPost = {
  postId: string;
  moderationStatus: 'VALIDATING' | 'PENDING';
};

export type PostCreationRepositoryDeps = { api: ApiClient };

const CREATED_STATUS: readonly CreatedPost['moderationStatus'][] = ['VALIDATING', 'PENDING'];

function decodeUploadPolicy(raw: unknown): UploadPolicy {
  const o = asObject(raw, 'upload policy');
  return {
    uploadId: str(o, 'uploadId'),
    uploadUrl: str(o, 'uploadUrl'),
    expiresInSeconds: nonNegInt(o, 'expiresInSeconds'),
    contentType: str(o, 'contentType'),
    maxBytes: nonNegInt(o, 'maxBytes'),
  };
}

function decodeCreatedPost(raw: unknown): CreatedPost {
  const o = asObject(raw, 'created post');
  return {
    postId: str(o, 'postId'),
    moderationStatus: oneOf(o, 'moderationStatus', CREATED_STATUS),
  };
}

/** 게시물 생성 API(정책 발급, presigned PUT, 생성). 실패는 ApiError 하위 클래스를 그대로 던진다(문구 변환은 mapUploadError). */
export class PostCreationRepository {
  constructor(private readonly deps: PostCreationRepositoryDeps) {}

  /** POST /posts/uploads (본문 없음, 인증 필수, 멱등 발급이라 자동 재시도 대상). */
  requestUploadPolicy(signal?: AbortSignal): Promise<UploadPolicy> {
    return this.deps.api.requestJson(
      { method: 'POST', path: '/posts/uploads', signal },
      decodeUploadPolicy,
    );
  }

  /** PUT {uploadUrl}: 인증 헤더 없이 Content-Type은 정책 값 그대로, 본문은 WebP 바이트. */
  uploadPhoto(policy: UploadPolicy, bytes: Uint8Array, signal?: AbortSignal): Promise<void> {
    return this.deps.api.uploadToPresignedUrl({
      url: policy.uploadUrl,
      contentType: policy.contentType,
      body: bytes,
      signal,
    });
  }

  /** POST /posts {topicId, photoUploadId, title}. 자동 재시도 없음. 201의 moderationStatus는 VALIDATING·PENDING만 받는다. */
  create(input: CreatePostInput, signal?: AbortSignal): Promise<CreatedPost> {
    return this.deps.api.requestJson(
      {
        method: 'POST',
        path: '/posts',
        body: { topicId: input.topicId, photoUploadId: input.photoUploadId, title: input.title },
        signal,
      },
      decodeCreatedPost,
    );
  }
}
