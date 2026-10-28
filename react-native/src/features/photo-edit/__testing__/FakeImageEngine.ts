import { CancelledError } from '../../../core/http/ApiError';
import type { FakeLocalFiles } from '../../../core/media/__testing__/FakeLocalFiles';
import type {
  AnalysisSampleRequest,
  EncodedImage,
  ImageEngine,
  WebpEncodeRequest,
} from '../ImageEngine';
import { ImageDecodeError } from '../ImageErrors';
import type { ImageFile, RgbaImage, Size } from '../ImageTypes';

export type EngineMethod = 'readBounds' | 'prepareEditable' | 'samplePixels' | 'encodeWebp';

export type EngineCall =
  | { method: 'readBounds'; uri: string; signal?: AbortSignal }
  | { method: 'prepareEditable'; uri: string; maxLongEdge: number; signal?: AbortSignal }
  | { method: 'samplePixels'; request: AnalysisSampleRequest; signal?: AbortSignal }
  | { method: 'encodeWebp'; request: WebpEncodeRequest; signal?: AbortSignal };

export type Hold = { release: () => void; fail: (error: Error) => void };

const DEFAULT_SIZE: Size = { width: 1600, height: 1200 };

/** 긴 변이 max를 넘을 때만 비율대로 줄인다(Fake 내부용. 구현의 limitLongEdge에 기대지 않는다). */
export function shrinkToLongEdge(size: Size, max: number): Size {
  const long = Math.max(size.width, size.height);
  if (long <= max) return size;
  const scale = max / long;
  return { width: Math.floor(size.width * scale), height: Math.floor(size.height * scale) };
}

/**
 * 가짜 이미지 엔진. 호출 기록을 남기고, 호출을 붙잡아 두거나(hold) 실패시킬 수 있다.
 * 인코딩 결과 크기는 `sizeFor(request)`가 정한다(품질별 크기 표를 흉내 낸다).
 */
export class FakeImageEngine implements ImageEngine {
  readonly calls: EngineCall[] = [];
  /** uri별 표시 크기(없으면 1600x1200). Error면 그 uri는 읽을 수 없다. */
  readonly sizes = new Map<string, Size | Error>();
  /** 인코딩 결과 바이트 수. 기본 100KB. */
  sizeFor: (request: WebpEncodeRequest) => number = () => 100_000;
  /** 자동 보정 분석 표본. 기본 null(분석 불가). */
  sample: (request: AnalysisSampleRequest) => RgbaImage | null = () => null;
  private counter = 0;
  private readonly gates = new Map<EngineMethod, Promise<void>[]>();
  private readonly failures = new Map<EngineMethod, Error[]>();

  constructor(private readonly files: FakeLocalFiles) {}

  /** 해당 메서드의 다음 호출을 붙잡는다. release로 풀거나 fail로 실패시킨다. */
  holdNext(method: EngineMethod): Hold {
    let release!: () => void;
    let fail!: (error: Error) => void;
    const gate = new Promise<void>((resolve, reject) => {
      release = resolve;
      fail = reject;
    });
    gate.catch(() => undefined);
    this.gates.set(method, [...(this.gates.get(method) ?? []), gate]);
    return { release, fail };
  }

  failNext(method: EngineMethod, error: Error): void {
    this.failures.set(method, [...(this.failures.get(method) ?? []), error]);
  }

  callsOf(method: EngineMethod): EngineCall[] {
    return this.calls.filter((c) => c.method === method);
  }

  get sampleRequests(): AnalysisSampleRequest[] {
    return this.calls.flatMap((c) => (c.method === 'samplePixels' ? [c.request] : []));
  }

  get encodeRequests(): WebpEncodeRequest[] {
    return this.calls.flatMap((c) => (c.method === 'encodeWebp' ? [c.request] : []));
  }

  private async enter(method: EngineMethod, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) throw new CancelledError('aborted');
    const failure = this.failures.get(method)?.shift();
    if (failure) throw failure;
    const gate = this.gates.get(method)?.shift();
    if (gate) {
      await new Promise<void>((resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new CancelledError('aborted')), {
          once: true,
        });
        gate.then(resolve, reject);
      });
    }
    if (signal?.aborted) throw new CancelledError('aborted');
  }

  async readBounds(uri: string, signal?: AbortSignal): Promise<Size> {
    this.calls.push({ method: 'readBounds', uri, signal });
    await this.enter('readBounds', signal);
    const size = this.sizes.get(uri) ?? DEFAULT_SIZE;
    if (size instanceof Error) throw size;
    return size;
  }

  async prepareEditable(
    uri: string,
    maxLongEdge: number,
    signal?: AbortSignal,
  ): Promise<ImageFile> {
    this.calls.push({ method: 'prepareEditable', uri, maxLongEdge, signal });
    await this.enter('prepareEditable', signal);
    const size = this.sizes.get(uri) ?? DEFAULT_SIZE;
    if (size instanceof Error) throw new ImageDecodeError();
    return { uri: `${uri}#editable`, ...shrinkToLongEdge(size, maxLongEdge) };
  }

  async samplePixels(
    request: AnalysisSampleRequest,
    signal?: AbortSignal,
  ): Promise<RgbaImage | null> {
    this.calls.push({ method: 'samplePixels', request, signal });
    await this.enter('samplePixels', signal);
    return this.sample(request);
  }

  async encodeWebp(request: WebpEncodeRequest, signal?: AbortSignal): Promise<EncodedImage> {
    this.calls.push({ method: 'encodeWebp', request, signal });
    await this.enter('encodeWebp', signal);
    this.counter += 1;
    const uri = `file:///cache/post-${this.counter}.webp`;
    const byteLength = this.sizeFor(request);
    this.files.put(uri, new Uint8Array([0x52, 0x49, 0x46, 0x46, this.counter, request.quality]));
    return { uri, byteLength, ...outputSize(request) };
  }
}

function outputSize(request: WebpEncodeRequest): Size {
  const { targetSize, edit } = request;
  if (!edit) return targetSize;
  const odd = edit.quarterTurns % 2 === 1;
  const rotated = odd ? { width: targetSize.height, height: targetSize.width } : targetSize;
  return {
    width: Math.round(rotated.width * edit.crop.width),
    height: Math.round(rotated.height * edit.crop.height),
  };
}
