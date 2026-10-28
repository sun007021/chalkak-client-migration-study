import type { LocalFiles } from '../../core/media/LocalFiles';
import type { MonotonicClock } from '../../core/media/MonotonicClock';
import { Observable } from '../../core/state/Observable';
import type { PostCreationRepository, UploadPolicy } from '../../data/post/PostCreationRepository';
import type { EncodedImage } from '../photo-edit/ImageEngine';
import type { PhotoEdit } from '../photo-edit/PhotoEdit';
import type { PostImageEncoder } from './PostImageEncoder';

export type PreparationInput = { sourceUri: string; edit: PhotoEdit };

export type PreparationState =
  | { phase: 'idle' }
  | { phase: 'issuing' }
  | { phase: 'encoding' }
  | { phase: 'ready' }
  /** error는 원인 그대로(ApiError, SizeLimitExceededError ...). 문구 변환은 mapUploadError. */
  | { phase: 'failed'; error: unknown };

/** 제출할 준비가 끝난 사진: 정책(uploadUrl, uploadId, maxBytes)과 그 maxBytes 이하의 WebP 파일. */
export type PreparedUpload = { policy: UploadPolicy; file: EncodedImage };

export type UploadPreparationDeps = {
  repository: PostCreationRepository;
  encoder: PostImageEncoder;
  files: LocalFiles;
  monotonic: MonotonicClock;
};

/**
 * 편집을 마치는 즉시 백그라운드에서 정책 발급과 WebP 인코딩을 하고(S3 전송은 하지 않는다), 제출 때 만료를 확인한다.
 * 사진·편집값이 바뀌면 이전 작업을 취소하고 임시 파일을 지운다. 늦게 끝난 이전 작업은 현재 상태를 덮지 않는다(세대 번호).
 */
export class UploadPreparation extends Observable<PreparationState> {
  constructor(private readonly deps: UploadPreparationDeps) {
    super(initialPreparationState());
    void this.deps;
  }

  /** 새 사진·편집값으로 준비를 시작한다. 지금 입력과 같으면(같은 사진, 같은 편집값) 아무것도 하지 않는다. */
  start(input: PreparationInput): void {
    void input;
    throw new Error('not implemented');
  }

  /**
   * 제출할 수 있는 상태가 될 때까지 기다린다. 이미 준비됐으면 URL 만료(발급 시각 + expiresInSeconds - 5초, 단조 시계)를 확인해
   * 만료면 새 정책을 받고(새 maxBytes가 파일보다 작을 때만 원본에서 다시 인코딩) 돌려준다.
   * 실패한 상태이거나 invalidate 뒤에는 정책 발급부터 다시 한다. 입력이 없으면 reject.
   */
  ready(signal?: AbortSignal): Promise<PreparedUpload> {
    void signal;
    throw new Error('not implemented');
  }

  /** 정책과 파일을 버리고(파일 삭제) 입력은 유지한다: 다음 ready()가 처음부터 다시 한다(REQ-UPL-054, 059). */
  invalidate(): void {
    throw new Error('not implemented');
  }

  /** 진행 중 작업을 취소하고 입력·정책·파일을 모두 버린다(파일 삭제). 사진 교체·성공·세션 만료 때 쓴다. */
  cancel(): void {
    throw new Error('not implemented');
  }

  override dispose(): void {
    throw new Error('not implemented');
  }
}

function initialPreparationState(): PreparationState {
  throw new Error('not implemented');
}
