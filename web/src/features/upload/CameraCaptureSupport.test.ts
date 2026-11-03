import { detectCameraCapture } from './CameraCaptureSupport';

describe('detectCameraCapture (REQ-UPL-013, TC-UPL-015)', () => {
  it('TC-UPL-015 capture 속성을 지원하는 터치 기기에서는 카메라 버튼을 보인다', () => {
    expect(detectCameraCapture({ hasCaptureAttribute: true, maxTouchPoints: 5, coarsePointer: true })).toBe(true);
  });

  it('TC-UPL-015 데스크톱(터치 없음, 마우스 포인터)은 capture 속성이 있어도 카메라 버튼을 숨긴다', () => {
    expect(detectCameraCapture({ hasCaptureAttribute: true, maxTouchPoints: 0, coarsePointer: false })).toBe(false);
  });

  it('TC-UPL-015 capture 속성을 지원하지 않으면 터치 기기여도 숨긴다', () => {
    expect(detectCameraCapture({ hasCaptureAttribute: false, maxTouchPoints: 5, coarsePointer: true })).toBe(false);
  });
});
