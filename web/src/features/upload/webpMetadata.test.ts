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

describe('stripWebpMetadata 방어 (리뷰 4)', () => {
  it('리뷰 4 청크 크기가 남은 입력을 넘으면(잘린 입력) null이다', () => {
    const input = webpFromChunks([{ id: 'VP8X', payload: 10 }, { id: 'ICCP', payload: 100 }, { id: 'VP8 ', payload: 40 }]);
    const truncated = input.slice(0, input.length - 30);
    new DataView(truncated.buffer).setUint32(4, truncated.length - 8, true);
    expect(stripWebpMetadata(truncated)).toBeNull();
  });

  it('리뷰 4 RIFF 선언 크기와 실제 길이가 다르면(뒤에 붙은 바이트) null이다', () => {
    const input = webpFromChunks([{ id: 'VP8X', payload: [0x20, 0, 0, 0, 0, 0, 0, 0, 0, 0] }, { id: 'ICCP', payload: 8 }, { id: 'VP8 ', payload: 20 }]);
    expect(stripWebpMetadata(new Uint8Array([...input, 9, 9, 9, 9]))).toBeNull();
  });

  it('리뷰 4 가운데 청크의 홀수 패딩이 빠지면 null이다', () => {
    const ok = webpFromChunks([{ id: 'VP8X', payload: [0x20, 0, 0, 0, 0, 0, 0, 0, 0, 0] }, { id: 'ICCP', payload: 9 }, { id: 'VP8 ', payload: 20 }]);
    const at = 12 + 18 + 8 + 9; // ICCP 내용 끝(패딩 위치)
    const noPad = new Uint8Array([...ok.slice(0, at), ...ok.slice(at + 1)]);
    new DataView(noPad.buffer).setUint32(4, noPad.length - 8, true);
    expect(stripWebpMetadata(noPad)).toBeNull();
  });

  it('리뷰 4 마지막 청크의 홀수 패딩이 없는 입력은 받아들이고 결과는 검사를 통과한다', () => {
    const input = webpFromChunks([{ id: 'VP8X', payload: [0x20, 0, 0, 0, 0, 0, 0, 0, 0, 0] }, { id: 'ICCP', payload: 8 }, { id: 'VP8 ', payload: 21 }]);
    const noTail = input.slice(0, input.length - 1);
    new DataView(noTail.buffer).setUint32(4, noTail.length - 8, true);
    const out = stripWebpMetadata(noTail)!;
    expect(inspectWebp(out)).toEqual({ ok: true, chunks: ['VP8X', 'VP8 '] });
  });
});
