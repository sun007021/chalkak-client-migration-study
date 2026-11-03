import { POST_IMAGE_CONTENT_TYPE, POST_IMAGE_MAX_LONG_EDGE } from '../../constants';
import { throwIfAborted } from '../../core/abort';
import { ApiError, isAbandoned, NetworkError } from '../../core/net/errors';
import type { Clock } from '../../core/time/Clock';
import { MonotonicDeadline } from '../../core/time/MonotonicDeadline';
import { isIdentityEdit } from './editModel';
import type { PhotoEdit } from './editModel';
import type { DecodedImage, EditRenderer, ImageDecoder, WebpCompressor } from './imagePorts';
import { fitLongEdge } from './imageSizing';
import type { Size } from './imageSizing';
import { encodePostImage } from './postImageEncoder';
import type { UploadPolicy, UploadRepository } from './UploadRepository';

export type PrepareFailureKind =
  /** 연결 실패·타임아웃(자동 재시도 뒤에도) */
  | 'network'
  /** 403(정지 회원). 재요청하지 않는다 */
  | 'forbidden'
  /** 401 갱신 실패·재인증 필요(로그인 화면은 세션 이벤트가 연다) */
  | 'unauthorized'
  /** 그 밖: 정책 오류(5xx, 계약 위반, contentType이 image/webp가 아님), 디코드 실패, 크기 초과, WebP 인코딩 불가 */
  | 'prepare';

export class PrepareError extends Error {
  readonly name = 'PrepareError';
  constructor(
    readonly kind: PrepareFailureKind,
    readonly cause?: unknown,
  ) {
    super(`prepare failed: ${kind}`);
  }
}

/** 정책 발급 + WebP 인코딩이 끝난 업로드 준비물. */
export interface PreparedUpload {
  policy: UploadPolicy;
  /** 정책 maxBytes 이하의 image/webp. */
  file: Blob;
  /** file을 그린 크기. */
  size: Size;
  /** 정책 응답을 받은 시각부터 센다(인코딩이 끝난 시각이 아니다). 수명 expiresInSeconds, 안전 여유 5초. */
  deadline: MonotonicDeadline;
}

/** PUT이 거절돼 정책만 버렸을 때 다시 쓸 수 있는 인코딩 결과(REQ-UPL-059). */
export interface ReusableFile {
  file: Blob;
  size: Size;
}

export interface PhotoInput {
  photo: Blob;
  edit: PhotoEdit;
}

export interface PhotoPreparerDeps {
  repository: UploadRepository;
  decoder: ImageDecoder;
  compressor: WebpCompressor;
  renderer: EditRenderer;
  clock: Clock;
}

/**
 * 업로드 사전 준비(REQ-UPL-025~033, 041~042). 화면과 무관한 비동기 작업이라 ViewModel이 세대(세션)별로 한 번에 하나만 돌린다.
 * 실패는 모두 PrepareError(kind)로, 취소(signal abort)는 AbortError 그대로 던진다. 디코드한 이미지는 쓰고 나면(성공·실패·취소 모두) release한다.
 */
export class PhotoPreparer {
  constructor(protected readonly deps: PhotoPreparerDeps) {}

  /**
   * 선택한 사진이 읽을 수 있는 이미지인지 확인하고 보이는 방향의 크기를 돌려준다(decoder.probe: 전체 해상도 디코드 없음, 네트워크 요청 없음).
   * 크기는 긴 변 POST_IMAGE_MAX_LONG_EDGE 이하로 맞춘다. 0바이트·손상·지원하지 않는 형식은 PrepareError('prepare').
   */
  async inspect(photo: Blob, signal: AbortSignal): Promise<Size> {
    try {
      const natural = await this.deps.decoder.probe(photo, signal);
      throwIfAborted(signal);
      return fitLongEdge(natural, POST_IMAGE_MAX_LONG_EDGE);
    } catch (error) {
      throw classifyLocalFailure(error);
    }
  }

  /**
   * 1) POST /posts/uploads로 정책 발급  2) 정책 contentType이 image/webp가 아니면 디코드·인코딩 없이 PrepareError('prepare')
   * 3) 디코드(EXIF 반영, 긴 변 4096 이하)  4) 편집값이 isIdentityEdit이 아니면 renderer.render로 다시 그림(편집하지 않은 사진은 renderer를 부르지 않는다)
   * 5) encodePostImage(maxBytes = 정책 maxBytes)  6) PreparedUpload(deadline은 2번 이전, 정책 응답을 받은 직후 시작).
   * S3 PUT은 하지 않는다. 정책 발급 오류 분류: NetworkError → network, ApiError 403 → forbidden, ApiError 401 → unauthorized, 그 밖 → prepare.
   */
  async prepare(input: PhotoInput, signal: AbortSignal, reuse?: ReusableFile): Promise<PreparedUpload> {
    const { policy, deadline } = await this.issuePolicy(signal);
    // reuse: 같은 사진·편집값으로 이미 만든 파일이 새 정책 maxBytes 이하면 디코드·인코딩을 다시 하지 않는다.
    if (reuse && policy.maxBytes >= reuse.file.size) return { policy, file: reuse.file, size: reuse.size, deadline };
    const { file, size } = await this.encode(input, policy.maxBytes, signal);
    return { policy, file, size, deadline };
  }

  /**
   * 제출 직전 확인(REQ-UPL-041, 042). prepared.deadline이 만료(발급 후 expiresInSeconds - 5초, 단조 시계, 정확히 경계는 만료)가 아니면 prepared를 그대로 돌려준다.
   * 만료면 새 정책(새 uploadId)을 발급한다: contentType이 image/webp가 아니면 PrepareError('prepare'); 새 maxBytes >= file.size면 file을 재사용하고,
   * 더 작으면 input(원본·저장해 둔 편집값)으로 디코드 → 편집 → 인코딩을 다시 한다. 새 deadline은 새 정책 응답 시각부터.
   */
  async ensureFresh(prepared: PreparedUpload, input: PhotoInput, signal: AbortSignal): Promise<PreparedUpload> {
    if (!prepared.deadline.isExpired()) return prepared;
    const { policy, deadline } = await this.issuePolicy(signal);
    if (policy.maxBytes >= prepared.file.size) return { policy, file: prepared.file, size: prepared.size, deadline };
    const { file, size } = await this.encode(input, policy.maxBytes, signal);
    return { policy, file, size, deadline };
  }

  /** 정책 발급. 단조 시계 deadline은 응답을 받은 직후에 시작한다. contentType이 image/webp가 아니면 이미지를 읽지 않고 실패한다. */
  private async issuePolicy(signal: AbortSignal): Promise<{ policy: UploadPolicy; deadline: MonotonicDeadline }> {
    let policy: UploadPolicy;
    try {
      policy = await this.deps.repository.issuePolicy(signal);
    } catch (error) {
      throw classifyPolicyFailure(error);
    }
    const deadline = new MonotonicDeadline(this.deps.clock, policy.expiresInSeconds * 1000);
    throwIfAborted(signal);
    if (policy.contentType !== POST_IMAGE_CONTENT_TYPE) throw new PrepareError('prepare', new Error(`unsupported contentType: ${policy.contentType}`));
    return { policy, deadline };
  }

  /** 디코드 → (편집) → WebP 인코딩. 디코드한 이미지는 어떤 경우에도 놓는다. */
  private async encode(input: PhotoInput, maxBytes: number, signal: AbortSignal): Promise<{ file: Blob; size: Size }> {
    const owned: DecodedImage[] = [];
    try {
      const decoded = await this.deps.decoder.decode(input.photo, { maxLongEdge: POST_IMAGE_MAX_LONG_EDGE }, signal);
      owned.push(decoded);
      throwIfAborted(signal);
      let image = decoded;
      if (!isIdentityEdit(input.edit)) {
        image = await this.deps.renderer.render(decoded, input.edit, signal);
        if (image !== decoded) owned.push(image);
        throwIfAborted(signal);
      }
      const encoded = await encodePostImage({ image, compressor: this.deps.compressor, maxBytes, signal });
      return { file: encoded.blob, size: { width: encoded.width, height: encoded.height } };
    } catch (error) {
      throw classifyLocalFailure(error);
    } finally {
      for (const image of owned) image.release();
    }
  }
}

/** PrepareError는 그대로, 그 밖의 오류는 prepare로 감싼다. */
export function toPrepareError(error: unknown): PrepareError {
  return error instanceof PrepareError ? error : new PrepareError('prepare', error);
}

/** 디코드·편집·인코딩 실패: 취소는 그대로, 그 밖은 모두 prepare. */
function classifyLocalFailure(error: unknown): unknown {
  return isAbandoned(error) ? error : toPrepareError(error);
}

function classifyPolicyFailure(error: unknown): unknown {
  if (isAbandoned(error)) return error;
  if (error instanceof NetworkError) return new PrepareError('network', error);
  if (error instanceof ApiError && error.status === 403) return new PrepareError('forbidden', error);
  if (error instanceof ApiError && error.status === 401) return new PrepareError('unauthorized', error);
  return new PrepareError('prepare', error);
}
