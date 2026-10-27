import { SIGNATURE_MAX_BYTES, SIGNATURE_PNG_SIZE } from '../../shared/constants';
import { SignatureEncoder, SignatureTooLargeError } from './SignatureEncoder';
import { CANVAS } from './__testing__/draw';
import { FakeSignatureRasterizer } from './__testing__/FakeSignatureRasterizer';

const strokes = [
  [
    { x: 10, y: 10 },
    { x: 100, y: 80 },
  ],
];

function setup(size = 100) {
  const rasterizer = new FakeSignatureRasterizer().setSize(size);
  return { rasterizer, encoder: new SignatureEncoder(rasterizer) };
}

describe('SignatureEncoder', () => {
  it('REQ-SIGN-006 래스터라이저에 1024x512, 획 두께 14로 정규화한 획을 넘긴다', async () => {
    const { rasterizer, encoder } = setup();
    await encoder.encode(strokes, CANVAS);
    expect(rasterizer.requests).toHaveLength(1);
    const request = rasterizer.requests[0];
    expect(request.width).toBe(SIGNATURE_PNG_SIZE.width);
    expect(request.height).toBe(SIGNATURE_PNG_SIZE.height);
    expect(request.strokeWidth).toBe(SIGNATURE_PNG_SIZE.strokeWidth);
    // 캔버스 좌표가 아니라 PNG 좌표(패딩 안쪽)로 바뀌어 있다.
    for (const p of request.strokes.flat()) {
      expect(p.x).toBeGreaterThanOrEqual(SIGNATURE_PNG_SIZE.padding - 1e-6);
      expect(p.x).toBeLessThanOrEqual(SIGNATURE_PNG_SIZE.width - SIGNATURE_PNG_SIZE.padding + 1e-6);
    }
  });

  it('TC-SIGN-014 인코딩 결과가 정확히 1,048,576B이면 허용한다', async () => {
    const { encoder } = setup(SIGNATURE_MAX_BYTES);
    const bytes = await encoder.encode(strokes, CANVAS);
    expect(bytes.byteLength).toBe(1_048_576);
  });

  it('TC-SIGN-015 1,048,577B이면 SignatureTooLargeError', async () => {
    const { encoder } = setup(SIGNATURE_MAX_BYTES + 1);
    await expect(encoder.encode(strokes, CANVAS)).rejects.toBeInstanceOf(SignatureTooLargeError);
  });

  it('REQ-SIGN-003 획이 없으면 래스터라이저를 부르지 않고 거부한다', async () => {
    const { rasterizer, encoder } = setup();
    await expect(encoder.encode([], CANVAS)).rejects.toThrow();
    await expect(encoder.encode([[]], CANVAS)).rejects.toThrow();
    expect(rasterizer.requests).toHaveLength(0);
  });

  it('래스터라이저 실패는 그대로 전달한다(SignatureTooLargeError로 바꾸지 않는다)', async () => {
    const rasterizer = new FakeSignatureRasterizer().failWith(new Error('skia boom'));
    await expect(new SignatureEncoder(rasterizer).encode(strokes, CANVAS)).rejects.toThrow(
      'skia boom',
    );
  });
});

describe('SignatureEncoder: 비유한 좌표', () => {
  it('유한한 좌표가 없으면 래스터라이저를 부르지 않고 거부한다', async () => {
    const rasterizer = new FakeSignatureRasterizer();
    await expect(
      new SignatureEncoder(rasterizer).encode([[{ x: NaN, y: 1 }]], CANVAS),
    ).rejects.toThrow();
    expect(rasterizer.requests).toHaveLength(0);
  });
});
