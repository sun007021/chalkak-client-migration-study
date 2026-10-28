import { ImageDecodeError } from '../features/upload/imagePorts';
import type { DecodedImage, DecodeOptions, ImageDecoder } from '../features/upload/imagePorts';
import { raceAbort } from './abortable';
import { deferred } from './deferred';
import type { Deferred } from './deferred';

export interface FakeImageOptions {
  name?: string;
  /** 파일 바이트 수. 0이면 비어 있는 사진. */
  bytes?: number;
  /** 보이는 방향(EXIF 반영)의 크기. 기본 4000×3000. */
  width?: number;
  height?: number;
  type?: string;
  /** true면 손상된 이미지(디코드 실패). */
  corrupt?: boolean;
}

interface Meta {
  width: number;
  height: number;
  corrupt: boolean;
}

const META = new WeakMap<Blob, Meta>();

/** 디코드 결과를 정해 둔 가짜 사진 File. FakeImageDecoder가 크기·손상 여부를 이 표에서 읽는다. */
export function imageFile(options: FakeImageOptions = {}): File {
  const file = new File([new Uint8Array(options.bytes ?? 1024)], options.name ?? 'photo.jpg', { type: options.type ?? 'image/jpeg' });
  META.set(file, { width: options.width ?? 4000, height: options.height ?? 3000, corrupt: options.corrupt === true });
  return file;
}

export class FakeDecodedImage implements DecodedImage {
  releases = 0;
  constructor(
    readonly width: number,
    readonly height: number,
    readonly origin: Blob | null = null,
  ) {}
  get released(): boolean {
    return this.releases > 0;
  }
  release(): void {
    this.releases += 1;
  }
}

/** 실제 canvas 없이 imageFile이 정한 크기로 디코드하는 Fake. 긴 변이 options.maxLongEdge를 넘으면 비율을 유지해 줄이고 확대하지 않는다. */
export class FakeImageDecoder implements ImageDecoder {
  readonly calls: { source: Blob; maxLongEdge: number }[] = [];
  readonly images: FakeDecodedImage[] = [];
  /** true면 abort를 무시하고 끝까지 진행한다(취소에 협조하지 않는 구현 — 늦게 끝난 이전 작업 재현). */
  ignoreAbort = false;
  private readonly gates = new Map<Blob, Deferred<void>>();

  /** source의 디코드를 release()될 때까지 붙잡는다. */
  hold(source: Blob): Deferred<void> {
    const gate = deferred<void>();
    this.gates.set(source, gate);
    return gate;
  }

  get decodeCount(): number {
    return this.calls.length;
  }

  async decode(source: Blob, options: DecodeOptions, signal: AbortSignal): Promise<DecodedImage> {
    this.calls.push({ source, maxLongEdge: options.maxLongEdge });
    const gate = this.gates.get(source);
    if (gate) await (this.ignoreAbort ? gate.promise : raceAbort(gate.promise, signal));
    else if (signal.aborted && !this.ignoreAbort) throw new DOMException('The operation was aborted.', 'AbortError');
    const meta = META.get(source) ?? { width: 4000, height: 3000, corrupt: false };
    if (source.size === 0 || meta.corrupt) throw new ImageDecodeError('cannot decode');
    const scale = Math.min(1, options.maxLongEdge / Math.max(meta.width, meta.height));
    const image = new FakeDecodedImage(Math.max(1, Math.round(meta.width * scale)), Math.max(1, Math.round(meta.height * scale)), source);
    this.images.push(image);
    return image;
  }
}
