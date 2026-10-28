import { SignatureDrawViewModel } from './SignatureDrawViewModel';
import { SignatureEncoder } from './SignatureEncoder';
import { SignaturePadGesture } from './SignaturePadGesture';
import { CANVAS } from './__testing__/draw';
import { FakeSignatureRasterizer } from './__testing__/FakeSignatureRasterizer';

function setup() {
  const vm = new SignatureDrawViewModel({
    canvas: CANVAS,
    encoder: new SignatureEncoder(new FakeSignatureRasterizer()),
    onConfirmed: jest.fn(),
  });
  return { gesture: new SignaturePadGesture(vm) };
}

describe('SignaturePadGesture', () => {
  it('화면 너비를 알면 터치 좌표를 논리 캔버스 크기로 환산한다', () => {
    const { gesture } = setup();
    gesture.setWidth(150); // 300 캔버스를 절반 크기로 그림
    expect(gesture.toCanvas(30, 60)).toEqual({ x: 60, y: 120 });
  });

  it('너비를 모르면 1:1이고, 유한하지 않은 좌표는 버린다', () => {
    const { gesture } = setup();
    expect(gesture.toCanvas(10, 20)).toEqual({ x: 10, y: 20 });
    expect(gesture.toCanvas(NaN, 1)).toBeNull();
  });
});
