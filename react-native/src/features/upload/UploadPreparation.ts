import { CancelledError } from '../../core/http/ApiError';
import { abortable } from '../../core/http/abort';
import { POST_IMAGE_CONTENT_TYPE, UPLOAD_URL_SAFETY_MARGIN_MS } from '../../shared/constants';
import type { LocalFiles } from '../../core/media/LocalFiles';
import type { MonotonicClock } from '../../core/media/MonotonicClock';
import { Observable } from '../../core/state/Observable';
import type { PostCreationRepository, UploadPolicy } from '../../data/post/PostCreationRepository';
import type { EncodedImage } from '../photo-edit/ImageEngine';
import { editsEqual, type PhotoEdit } from '../photo-edit/PhotoEdit';
import type { PostImageEncoder } from './PostImageEncoder';
import { UnsupportedContentTypeError } from './UploadErrors';

export type PreparationInput = { sourceUri: string; edit: PhotoEdit };

export type PreparationState =
  | { phase: 'idle' }
  | { phase: 'issuing' }
  | { phase: 'encoding' }
  | { phase: 'ready' }
  /** error는 원인 그대로(ApiError, SizeLimitExceededError ...). 문구 변환은 mapUploadError. */
  | { phase: 'failed'; error: unknown };

/** 제출할 준비가 끝난 사진: 정책(uploadUrl, uploadId, maxBytes)과 그 maxBytes 이하의 WebP 파일. */
export type PreparedUpload = {
  policy: UploadPolicy;
  file: EncodedImage;
  /** 정책을 받은 단조 시각(ms). URL 만료 판정 기준(REQ-UPL-041). */
  issuedAtMs: number;
};

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
  private input: PreparationInput | null = null;
  private prepared: PreparedUpload | null = null;
  private task: Promise<PreparedUpload> | null = null;
  private generation = 0;
  private abort = new AbortController();

  constructor(private readonly deps: UploadPreparationDeps) {
    super(initialPreparationState());
  }

  /** 새 사진·편집값으로 준비를 시작한다. 지금 입력과 같으면(같은 사진, 같은 편집값) 아무것도 하지 않는다. */
  start(input: PreparationInput): void {
    const current = this.input;
    if (current && current.sourceUri === input.sourceUri && editsEqual(current.edit, input.edit)) {
      return;
    }
    this.discardWork();
    this.input = input;
    this.begin();
  }

  /**
   * 제출할 수 있는 상태가 될 때까지 기다린다. 이미 준비됐으면 URL 만료(발급 시각 + expiresInSeconds - 5초, 단조 시계)를 확인해
   * 만료면 새 정책을 받고(새 maxBytes가 파일보다 작을 때만 원본에서 다시 인코딩) 돌려준다.
   * 실패한 상태이거나 invalidate 뒤에는 정책 발급부터 다시 한다. 입력이 없으면 reject.
   * signal은 기다림만 끝내고 준비 작업은 취소하지 않는다.
   */
  async ready(signal?: AbortSignal): Promise<PreparedUpload> {
    if (!this.input) throw new Error('no photo to prepare');
    if (!this.task) {
      if (this.prepared && this.isUrlLive(this.prepared)) return this.prepared;
      this.begin();
    }
    const task = this.task as Promise<PreparedUpload>;
    return signal ? abortable(task, signal) : task;
  }

  /** 정책과 파일을 버리고(파일 삭제) 입력은 유지한다: 다음 ready()가 처음부터 다시 한다(REQ-UPL-054, 059). */
  invalidate(): void {
    this.discardWork();
  }

  /** 진행 중 작업을 취소하고 입력·정책·파일을 모두 버린다(파일 삭제). 사진 교체·성공·세션 만료 때 쓴다. */
  cancel(): void {
    this.discardWork();
    this.input = null;
  }

  override dispose(): void {
    this.cancel();
    super.dispose();
  }

  /** 발급 시각 + expiresInSeconds - 5초가 지나기 전이면 true(단조 시계, REQ-UPL-041). */
  isUrlLive(upload: Pick<PreparedUpload, 'policy' | 'issuedAtMs'>): boolean {
    const lifetimeMs = upload.policy.expiresInSeconds * 1000 - UPLOAD_URL_SAFETY_MARGIN_MS;
    return this.deps.monotonic.nowMs() - upload.issuedAtMs < lifetimeMs;
  }

  /** 준비된 WebP 파일의 바이트(PUT 본문). */
  readBytes(prepared: PreparedUpload): Promise<Uint8Array> {
    return this.deps.files.readBytes(prepared.file.uri);
  }

  /** 진행 중 작업을 취소하고 만든 것을 지운다. 입력은 그대로 둔다. */
  private discardWork(): void {
    this.generation += 1;
    this.abort.abort();
    this.abort = new AbortController();
    this.task = null;
    const old = this.prepared;
    this.prepared = null;
    if (old) void this.deps.files.delete(old.file.uri);
    this.setState({ phase: 'idle' });
  }

  /** 지금 상태에서 필요한 작업(처음부터 또는 만료 갱신)을 시작한다. */
  private begin(): void {
    const generation = this.generation;
    const renew = this.prepared !== null;
    const run = renew ? this.renew(generation) : this.prepareFresh(generation);
    const task: Promise<PreparedUpload> = run.then(
      (prepared) => {
        if (generation === this.generation) {
          this.prepared = prepared;
          this.setState({ phase: 'ready' });
        }
        return prepared;
      },
      (error: unknown) => {
        if (generation === this.generation) this.setState({ phase: 'failed', error });
        throw error;
      },
    );
    this.task = task;
    const clear = () => {
      if (this.task === task) this.task = null;
    };
    task.then(clear, clear);
  }

  private assertCurrent(generation: number): void {
    if (generation !== this.generation) throw new CancelledError('superseded');
  }

  private async issuePolicy(generation: number) {
    this.setPhase(generation, { phase: 'issuing' });
    const policy = await this.deps.repository.requestUploadPolicy(this.abort.signal);
    this.assertCurrent(generation);
    const issuedAtMs = this.deps.monotonic.nowMs();
    if (policy.contentType !== POST_IMAGE_CONTENT_TYPE) {
      throw new UnsupportedContentTypeError(policy.contentType);
    }
    return { policy, issuedAtMs };
  }

  private async encode(generation: number, maxBytes: number): Promise<EncodedImage> {
    const input = this.input as PreparationInput;
    this.setPhase(generation, { phase: 'encoding' });
    const { signal } = this.abort;
    const file = await this.deps.encoder.encode({ ...input, maxBytes }, signal);
    if (generation !== this.generation) {
      await this.deps.files.delete(file.uri);
      throw new CancelledError('superseded');
    }
    return file;
  }

  private async prepareFresh(generation: number): Promise<PreparedUpload> {
    const { policy, issuedAtMs } = await this.issuePolicy(generation);
    const file = await this.encode(generation, policy.maxBytes);
    return { policy, file, issuedAtMs };
  }

  /** 만료된 URL: 새 정책(새 uploadId)을 받고, 새 maxBytes가 파일보다 작을 때만 원본에서 다시 인코딩한다(REQ-UPL-041~042). */
  private async renew(generation: number): Promise<PreparedUpload> {
    const old = this.prepared as PreparedUpload;
    const { policy, issuedAtMs } = await this.issuePolicy(generation);
    if (policy.maxBytes >= old.file.byteLength) {
      return { policy, file: old.file, issuedAtMs };
    }
    const file = await this.encode(generation, policy.maxBytes);
    await this.deps.files.delete(old.file.uri);
    return { policy, file, issuedAtMs };
  }

  private setPhase(generation: number, state: PreparationState): void {
    if (generation === this.generation) this.setState(state);
  }
}

function initialPreparationState(): PreparationState {
  return { phase: 'idle' };
}
