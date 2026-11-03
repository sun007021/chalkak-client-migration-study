import { webpFromChunks } from '../../test/webpBytes';
import { inspectWebp } from './postImageEncoder';
import { stripWebpMetadata } from './webpMetadata';

describe('stripWebpMetadata (canvas WebP의 ICCP 제거, REQ-UPL-033)', () => {
  it('TC-UPL-033 Chromium canvas 출력 모양(VP8X + ICCP + VP8)에서 ICCP를 빼고 VP8X 플래그를 내리면 검사를 통과한다', () => {
    const vp8x = [0x20, 0, 0, 0, 0, 0, 0, 0, 0, 0]; // ICC 플래그
    const input = webpFromChunks([{ id: 'VP8X', payload: vp8x }, { id: 'ICCP', payload: 456 }, { id: 'VP8 ', payload: 81 }]);
    expect(inspectWebp(input)).toEqual({ ok: false, reason: 'metadata' });
    const out = stripWebpMetadata(input)!;
    expect(inspectWebp(out)).toEqual({ ok: true, chunks: ['VP8X', 'VP8 '] });
    expect(out[20]! & 0x20).toBe(0);
    expect(out.length).toBeLessThan(input.length);
  });

  it('TC-UPL-033 EXIF·XMP도 뺀다', () => {
    const input = webpFromChunks([{ id: 'VP8X', payload: [0x2c, 0, 0, 0, 0, 0, 0, 0, 0, 0] }, { id: 'VP8 ', payload: 20 }, { id: 'EXIF', payload: 7 }, { id: 'XMP ', payload: 8 }]);
    expect(inspectWebp(stripWebpMetadata(input)!)).toEqual({ ok: true, chunks: ['VP8X', 'VP8 '] });
  });

  it('TC-UPL-033 지울 것이 없으면 같은 바이트를 그대로 돌려주고, WebP가 아니면 null이다', () => {
    const clean = webpFromChunks([{ id: 'VP8 ', payload: 20 }]);
    expect(stripWebpMetadata(clean)).toBe(clean);
    expect(stripWebpMetadata(new Uint8Array(40))).toBeNull();
    expect(stripWebpMetadata(new Uint8Array(4))).toBeNull();
  });

  it('TC-UPL-033 이미지 청크의 내용은 그대로다', () => {
    const input = webpFromChunks([{ id: 'VP8X', payload: [0x30, 0, 0, 0, 0, 0, 0, 0, 0, 0] }, { id: 'ICCP', payload: 5 }, { id: 'ALPH', payload: [1, 2, 3, 4] }, { id: 'VP8 ', payload: [9, 8, 7, 6, 5, 4] }]);
    const out = stripWebpMetadata(input)!;
    expect(inspectWebp(out)).toEqual({ ok: true, chunks: ['VP8X', 'ALPH', 'VP8 '] });
    expect(out[20]).toBe(0x10); // 알파 플래그는 유지
    expect(Array.from(out.slice(-6))).toEqual([9, 8, 7, 6, 5, 4]);
  });
});
