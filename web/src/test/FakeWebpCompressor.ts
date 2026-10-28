import type { DecodedImage, WebpCompressor } from '../features/upload/imagePorts';
import { WebpUnsupportedError } from '../features/upload/imagePorts';
import type { Size } from '../features/upload/imageSizing';
import type { Clock } from '../core/time/Clock';
import { raceAbort } from './abortable';
import { deferred } from './deferred';
import type { Deferred } from './deferred';
import { pngBytes, webpBytes } from './webpBytes';

export interface CompressCall {
  image: DecodedImage;
  width: number;
  height: number;
  quality: number;
  signal: AbortSignal;
}

export type CompressorMode =
  /** RIFF/WEBP 정지 이미지(type image/webp) */
  | 'webp'
  /** canvas.toBlob이 WebP를 못 만들 때 조용히 돌려주는 PNG(type image/png) */
  | 'png'
  /** 바이트는 PNG인데 type만 image/webp */
  | 'png-bytes-typed-webp'
  /** WebpUnsupportedError를 던진다 */
  | 'unsupported';

/** 품질·크기별 결과 바이트 수를 정하는 가짜 WebP 압축기(사다리 로직을 결정적으로 검증). */
export class FakeWebpCompressor implements WebpCompressor {
  readonly calls: CompressCall[] = [];
  readonly results: Blob[] = [];
  /** 결과 바이트 수(>= 24). 기본 20_000. index는 0부터 센 호출 순번. */
  bytesFor: (call: CompressCall, index: number) => number = () => 20_000;
  mode: CompressorMode = 'webp';
  /** 압축 하나에 걸리는 가짜 시간(ms). 0이면 즉시. */
  durationMs = 0;
  /** true면 abort를 무시하고 끝까지 진행한다(늦게 끝난 이전 작업 재현). */
  ignoreAbort = false;
  private readonly queue: Deferred<void>[] = [];

  constructor(private readonly clock?: Clock) {}

  /** 아직 시작하지 않은 다음 compress 호출을 release될 때까지 붙잡는다(여러 번 부르면 호출 순서대로 하나씩). */
  hold(): Deferred<void> {
    const gate = deferred<void>();
    this.queue.push(gate);
    return gate;
  }

  get compressCount(): number {
    return this.calls.length;
  }

  /** 시도한 (가로, 세로, 품질) 목록. */
  attempts(): [number, number, number][] {
    return this.calls.map((c) => [c.width, c.height, c.quality]);
  }

  async compress(image: DecodedImage, size: Size, quality: number, signal: AbortSignal): Promise<Blob> {
    if (signal.aborted && !this.ignoreAbort) throw new DOMException('The operation was aborted.', 'AbortError');
    const call: CompressCall = { image, width: size.width, height: size.height, quality, signal };
    const index = this.calls.length;
    this.calls.push(call);
    if (this.mode === 'unsupported') throw new WebpUnsupportedError('no webp encoder');
    const gate = this.queue.shift();
    if (gate) await (this.ignoreAbort ? gate.promise : raceAbort(gate.promise, signal));
    if (this.durationMs > 0 && this.clock) await (this.ignoreAbort ? this.clock.sleep(this.durationMs) : this.clock.sleep(this.durationMs, signal));
    const bytes = this.bytesFor(call, index);
    const blob =
      this.mode === 'png'
        ? new Blob([pngBytes(bytes)], { type: 'image/png' })
        : this.mode === 'png-bytes-typed-webp'
          ? new Blob([pngBytes(bytes)], { type: 'image/webp' })
          : new Blob([webpBytes(bytes)], { type: 'image/webp' });
    this.results.push(blob);
    return blob;
  }
}
