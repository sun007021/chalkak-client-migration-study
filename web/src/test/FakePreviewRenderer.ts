import type { PhotoEdit } from '../features/upload/editModel';
import type { DecodedImage } from '../features/upload/imagePorts';
import type { PreviewFrame, PreviewRenderer } from '../features/upload/editor/editorPorts';
import { raceAbort } from './abortable';
import { deferred } from './deferred';
import type { Deferred } from './deferred';

export class FakePreviewFrame implements PreviewFrame {
  releases = 0;
  constructor(
    readonly src: string,
    readonly width: number,
    readonly height: number,
  ) {}
  get released(): boolean {
    return this.releases > 0;
  }
  release(): void {
    this.releases += 1;
  }
}

export interface PreviewCall {
  image: DecodedImage;
  edit: PhotoEdit;
  maxLongEdge: number;
  /** 요청이 끝났을 때 abort되어 있었는가. */
  aborted: () => boolean;
}

/** 미리보기·썸네일 렌더 Fake. 호출 기록, 실패, 지연(hold)을 조절한다. src는 `preview:<번호>`(번호는 1부터). */
export class FakePreviewRenderer implements PreviewRenderer {
  readonly calls: PreviewCall[] = [];
  readonly frames: FakePreviewFrame[] = [];
  /** 조건에 맞는 호출을 실패시킨다. 기본: 실패 없음. */
  failWhen: ((call: PreviewCall) => boolean) | null = null;
  private gate: Deferred<void> | null = null;

  /** release 전까지 이후 모든 렌더를 붙잡는다. */
  hold(): Deferred<void> {
    this.gate = deferred<void>();
    return this.gate;
  }

  /** 미리보기(maxLongEdge가 작은 썸네일 제외) 호출만. */
  previews(thumbnailMaxEdge: number): PreviewCall[] {
    return this.calls.filter((c) => c.maxLongEdge > thumbnailMaxEdge);
  }

  async render(image: DecodedImage, edit: PhotoEdit, options: { maxLongEdge: number }, signal: AbortSignal): Promise<PreviewFrame> {
    const call: PreviewCall = { image, edit, maxLongEdge: options.maxLongEdge, aborted: () => signal.aborted };
    this.calls.push(call);
    if (this.gate) await raceAbort(this.gate.promise, signal);
    else if (signal.aborted) throw new DOMException('The operation was aborted.', 'AbortError');
    if (this.failWhen?.(call)) throw new Error('preview render failed');
    const scale = Math.min(1, options.maxLongEdge / Math.max(image.width, image.height));
    const frame = new FakePreviewFrame(`preview:${this.frames.length + 1}`, Math.max(1, Math.round(image.width * scale)), Math.max(1, Math.round(image.height * scale)));
    this.frames.push(frame);
    return frame;
  }
}
