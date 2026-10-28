/** 카메라 버튼을 보일지(REQ-UPL-013). 웹은 `<input type="file" accept="image/*" capture>`로 카메라를 대신한다. 컨테이너가 주입하고 화면 테스트는 Fake를 쓴다. */
export interface CameraCaptureSupport {
  supported(): boolean;
}

export interface CameraCaptureEnv {
  /** `'capture' in document.createElement('input')`. */
  hasCaptureAttribute: boolean;
  /** navigator.maxTouchPoints. */
  maxTouchPoints: number;
  /** matchMedia('(pointer: coarse)').matches. */
  coarsePointer: boolean;
}

/**
 * 카메라 입력을 쓸 수 있는가: capture 속성을 지원하고 터치 기기(maxTouchPoints > 0 또는 거친 포인터)일 때만 true.
 * 데스크톱 브라우저는 capture를 무시하고 파일 선택창만 열기 때문에 capture 속성이 있어도 false다(카메라 버튼 숨김).
 */
export function detectCameraCapture(_env: CameraCaptureEnv): boolean {
  throw new Error('not implemented');
}

/** 브라우저 환경에서 detectCameraCapture를 부르는 기본 구현. */
export class BrowserCameraCaptureSupport implements CameraCaptureSupport {
  supported(): boolean {
    throw new Error('not implemented');
  }
}
