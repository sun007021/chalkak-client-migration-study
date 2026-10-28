import { base64ToBytes } from '../../core/encoding/base64';
import { Observable } from '../../core/state/Observable';
import type { CalendarImageInput, CalendarImageRenderer, RenderedImage } from './CalendarImage';

/** 화면 밖에 그려 둔 달력 뷰를 캡처해 달라는 요청 하나. 호스트(CalendarImageCaptureHost)가 처리한다. */
export type CaptureRequest = {
  input: CalendarImageInput;
  /** 달력 뷰를 PNG(base64)로 캡처한 결과를 돌려준다. 호스트가 뷰를 그리고 이미지 로딩을 기다린 뒤 부른다. */
  succeed(pngBase64: string): void;
  fail(error: unknown): void;
};

export type CalendarCaptureState = { request: CaptureRequest | null };

/**
 * 달력 뷰를 `react-native-view-shot`으로 캡처해 PNG로 만든다(REQ-REC-037).
 * 이 클래스는 뷰를 직접 갖지 않는다: 요청을 상태로 내놓으면 화면 안에 마운트된 호스트가 뷰를 그려 캡처한다.
 * 호스트가 없으면(기록 화면 밖) 기다리지 않고 바로 실패한다. 요청은 한 번에 하나씩 처리한다.
 */
export class ViewShotCalendarImageRenderer
  extends Observable<CalendarCaptureState>
  implements CalendarImageRenderer
{
  private hosts = 0;
  private queue: Promise<unknown> = Promise.resolve();

  constructor() {
    super({ request: null });
  }

  /** 호스트가 마운트됐다. 해제 함수를 돌려준다(StrictMode의 이중 effect에도 안전하게 횟수로 센다). */
  attachHost(): () => void {
    this.hosts += 1;
    let attached = true;
    return () => {
      if (!attached) return;
      attached = false;
      this.hosts -= 1;
      // 진행 중인 요청을 처리할 호스트가 없어졌다.
      const { request } = this.getSnapshot();
      if (this.hosts === 0 && request) request.fail(new Error('calendar capture host detached'));
    };
  }

  render(input: CalendarImageInput): Promise<RenderedImage> {
    const run = this.queue.then(() => this.capture(input));
    this.queue = run.catch(() => undefined);
    return run;
  }

  private capture(input: CalendarImageInput): Promise<RenderedImage> {
    if (this.hosts === 0) return Promise.reject(new Error('no calendar capture host'));
    return new Promise<RenderedImage>((resolve, reject) => {
      const finish = () => this.setState({ request: null });
      const request: CaptureRequest = {
        input,
        succeed: (pngBase64) => {
          finish();
          try {
            const bytes = base64ToBytes(pngBase64);
            resolve({ bytes, ...readPngSize(bytes) });
          } catch (error) {
            reject(error);
          }
        },
        fail: (error) => {
          finish();
          reject(error);
        },
      };
      this.setState({ request });
    });
  }
}

/** PNG IHDR에서 가로·세로를 읽는다(시그니처 8바이트 + 길이 4 + "IHDR" 4 뒤 big-endian 4바이트씩). 읽을 수 없으면 0. */
export function readPngSize(bytes: Uint8Array): { width: number; height: number } {
  if (bytes.length < 24) return { width: 0, height: 0 };
  const u32 = (offset: number) =>
    ((bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]) >>>
    0;
  return { width: u32(16), height: u32(20) };
}
