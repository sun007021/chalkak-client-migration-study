import { FakeDecodedImage } from '../../test/FakeImageDecoder';
import { FakeWebpCompressor } from '../../test/FakeWebpCompressor';
import { deferred } from '../../test/deferred';
import { settleMore } from '../../test/uploadHarness';
import { track } from '../../test/track';
import { webpBytes, webpFromChunks } from '../../test/webpBytes';
import { NotWebpError, SizeLimitExceededError, WebpUnsupportedError } from './imagePorts';
import type { WebpCompressor } from './imagePorts';
import { encodePostImage, inspectWebp, selectWebpBackend } from './postImageEncoder';

const MAX = 1000;
const signal = () => new AbortController().signal;
const image = (width = 1600, height = 1200) => new FakeDecodedImage(width, height);

/** 품질별 결과 바이트 수 표로 정하는 압축기. 표에 없는 품질은 maxBytes 초과(MAX + 1). */
function laddered(table: Partial<Record<number, number>>) {
  const compressor = new FakeWebpCompressor();
  compressor.bytesFor = (call) => table[call.quality] ?? MAX + 1;
  return compressor;
}

describe('encodePostImage 품질 사다리 (REQ-UPL-030, TC-UPL-037)', () => {
  it.each([
    ['90에서 바로 통과', { 90: 900 }, [90], 90],
    ['90 초과, 80에서 통과', { 90: 1001, 80: 1000 }, [90, 80], 80],
    ['80 초과, 60에서 통과', { 90: 2000, 80: 1500, 60: 900 }, [90, 80, 60], 60],
    ['60 초과, 40에서 통과', { 90: 2000, 80: 1500, 60: 1200, 40: 100 }, [90, 80, 60, 40], 40],
  ] as const)('TC-UPL-037 %s: 첫 번째로 maxBytes 이하가 되는 품질에서 멈춘다', async (_name, table, qualities, chosen) => {
    const compressor = laddered(table);
    const result = await encodePostImage({ image: image(), compressor, maxBytes: MAX, signal: signal() });
    expect(compressor.calls.map((c) => c.quality)).toEqual([...qualities]);
    expect(result.quality).toBe(chosen);
    expect(result.attempts).toBe(qualities.length);
    expect(result.blob).toBe(compressor.results[compressor.results.length - 1]);
    expect(result.blob.size).toBeLessThanOrEqual(MAX);
    expect(result.blob.type).toBe('image/webp');
  });

  it('TC-UPL-037 같은 라운드에서는 크기를 바꾸지 않고 품질만 낮춘다', async () => {
    const compressor = laddered({ 40: 10 });
    await encodePostImage({ image: image(1600, 1200), compressor, maxBytes: MAX, signal: signal() });
    expect(compressor.attempts()).toEqual([
      [1600, 1200, 90],
      [1600, 1200, 80],
      [1600, 1200, 60],
      [1600, 1200, 40],
    ]);
  });
});

describe('encodePostImage 크기 축소 라운드 (REQ-UPL-031, 032, TC-UPL-038, 039, 042)', () => {
  it('TC-UPL-038 모든 품질에서 초과면 0.85배씩 줄여 최대 3번(총 4라운드, 16회) 시도하고 SizeLimitExceededError다', async () => {
    const compressor = laddered({});
    await expect(encodePostImage({ image: image(1600, 1200), compressor, maxBytes: MAX, signal: signal() })).rejects.toBeInstanceOf(SizeLimitExceededError);
    expect(compressor.compressCount).toBe(16);
    const sizes = [
      [1600, 1200],
      [1360, 1020],
      [1156, 867],
      [983, 737],
    ];
    expect(compressor.attempts()).toEqual(sizes.flatMap(([w, h]) => [90, 80, 60, 40].map((q) => [w, h, q])));
  });

  it('TC-UPL-038 중간 라운드에서 성공하면 즉시 끝나고 그 라운드의 크기가 결과 크기다', async () => {
    const compressor = new FakeWebpCompressor();
    // 첫 라운드(1600 너비)는 모두 초과, 둘째 라운드(1360 너비)는 90에서 통과
    compressor.bytesFor = (call) => (call.width === 1600 ? MAX + 1 : 800);
    const result = await encodePostImage({ image: image(1600, 1200), compressor, maxBytes: MAX, signal: signal() });
    expect(compressor.compressCount).toBe(5);
    expect(compressor.calls[4]).toMatchObject({ width: 1360, height: 1020, quality: 90 });
    expect(result).toMatchObject({ width: 1360, height: 1020, quality: 90, attempts: 5 });
  });

  it('TC-UPL-034 긴 변이 4096을 넘는 이미지는 첫 시도부터 4096 이하로 줄인 크기로 압축한다(8000×6000 → 4096×3072)', async () => {
    const compressor = laddered({ 90: 10 });
    const result = await encodePostImage({ image: image(8000, 6000), compressor, maxBytes: MAX, signal: signal() });
    expect(compressor.calls[0]).toMatchObject({ width: 4096, height: 3072 });
    expect(result).toMatchObject({ width: 4096, height: 3072 });
  });

  it('TC-UPL-034 작은 이미지는 확대하지 않는다', async () => {
    const compressor = laddered({ 90: 10 });
    await encodePostImage({ image: image(1000, 500), compressor, maxBytes: MAX, signal: signal() });
    expect(compressor.calls[0]).toMatchObject({ width: 1000, height: 500 });
  });

  it('TC-UPL-039 정확히 maxBytes(5,242,880)는 허용하고 +1바이트는 해당 품질을 실패로 보고 다음 단계로 간다', async () => {
    const exact = new FakeWebpCompressor();
    exact.bytesFor = () => 5_242_880;
    const ok = await encodePostImage({ image: image(), compressor: exact, maxBytes: 5_242_880, signal: signal() });
    expect(ok).toMatchObject({ quality: 90, attempts: 1 });
    expect(ok.blob.size).toBe(5_242_880);

    const over = new FakeWebpCompressor();
    over.bytesFor = (call) => (call.quality === 90 ? 5_242_881 : 5_242_880);
    const next = await encodePostImage({ image: image(), compressor: over, maxBytes: 5_242_880, signal: signal() });
    expect(next).toMatchObject({ quality: 80, attempts: 2 });
  });

  it('TC-UPL-042 불가능한 maxBytes면 SizeLimitExceededError다(maxBytes는 항상 인자로 받은 정책 값)', async () => {
    const compressor = new FakeWebpCompressor();
    compressor.bytesFor = () => 20_000;
    await expect(encodePostImage({ image: image(), compressor, maxBytes: 1_000, signal: signal() })).rejects.toBeInstanceOf(SizeLimitExceededError);
    expect(compressor.compressCount).toBe(16);
  });

  it('TC-UPL-038 인코딩한 입력 이미지는 release하지 않는다(소유자가 놓는다)', async () => {
    const input = image();
    await encodePostImage({ image: input, compressor: laddered({ 90: 10 }), maxBytes: MAX, signal: signal() });
    expect(input.released).toBe(false);
  });
});

describe('encodePostImage WebP만 허용 (REQ-UPL-033, upload-edit.md 플랫폼별 허용 차이)', () => {
  it('TC-UPL-032 압축 결과가 PNG(canvas가 WebP를 못 만들어 돌려준 형식)이면 NotWebpError이고 다른 품질·형식으로 폴백하지 않는다', async () => {
    const compressor = new FakeWebpCompressor();
    compressor.mode = 'png';
    await expect(encodePostImage({ image: image(), compressor, maxBytes: 5_242_880, signal: signal() })).rejects.toBeInstanceOf(NotWebpError);
    expect(compressor.compressCount).toBe(1);
  });

  it('TC-UPL-032 type만 image/webp이고 바이트가 PNG인 결과도 NotWebpError다', async () => {
    const compressor = new FakeWebpCompressor();
    compressor.mode = 'png-bytes-typed-webp';
    await expect(encodePostImage({ image: image(), compressor, maxBytes: 5_242_880, signal: signal() })).rejects.toBeInstanceOf(NotWebpError);
    expect(compressor.compressCount).toBe(1);
  });

  it('TC-UPL-032 압축기가 WebpUnsupportedError를 던지면 그대로 전파하고 다시 시도하지 않는다', async () => {
    const compressor = new FakeWebpCompressor();
    compressor.mode = 'unsupported';
    await expect(encodePostImage({ image: image(), compressor, maxBytes: 5_242_880, signal: signal() })).rejects.toBeInstanceOf(WebpUnsupportedError);
    expect(compressor.compressCount).toBe(1);
  });

  it.each([
    ['움직이는 WebP(ANIM)', ['VP8X', 'ANIM', 'ANMF']],
    ['EXIF 청크', ['VP8X', 'VP8 ', 'EXIF']],
    ['XMP 청크', ['VP8X', 'VP8 ', 'XMP ']],
    ['ICC 프로필 청크', ['VP8X', 'ICCP', 'VP8 ']],
  ])('TC-UPL-033 TC-UPL-043 %s가 든 결과는 NotWebpError다', async (_name, ids) => {
    const bytes = webpFromChunks(ids.map((id) => ({ id, payload: id === 'VP8X' ? 10 : 4 })));
    const compressor: WebpCompressor = { compress: () => Promise.resolve(new Blob([bytes], { type: 'image/webp' })) };
    await expect(encodePostImage({ image: image(), compressor, maxBytes: 5_242_880, signal: signal() })).rejects.toBeInstanceOf(NotWebpError);
  });
});

describe('encodePostImage 취소 (TC-UPL-046)', () => {
  it('TC-UPL-046 이미 취소된 signal이면 압축을 시작하지 않고 AbortError로 거절한다', async () => {
    const controller = new AbortController();
    controller.abort();
    const compressor = laddered({ 90: 10 });
    await expect(encodePostImage({ image: image(), compressor, maxBytes: MAX, signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(compressor.compressCount).toBe(0);
  });

  it('TC-UPL-046 압축 중 취소되면 사다리의 후속 압축을 부르지 않고 AbortError로 거절한다(취소에 협조하지 않는 압축기여도)', async () => {
    const controller = new AbortController();
    const compressor = laddered({}); // 모든 품질 초과: 취소가 없으면 16회 시도한다
    compressor.ignoreAbort = true;
    const gate = compressor.hold();
    const result = track(encodePostImage({ image: image(), compressor, maxBytes: MAX, signal: controller.signal }));
    await settleMore();
    expect(compressor.compressCount).toBe(1);
    controller.abort();
    gate.resolve();
    await settleMore();
    expect(result.state).toBe('rejected');
    expect(result.error).toMatchObject({ name: 'AbortError' });
    expect(compressor.compressCount).toBe(1);
  });

  it('TC-UPL-046 라운드 사이에서도 취소를 확인한다', async () => {
    const controller = new AbortController();
    const compressor = laddered({});
    const second = deferred();
    compressor.bytesFor = (call, index) => {
      if (index === 1) controller.abort();
      second.resolve();
      return MAX + call.quality;
    };
    await expect(encodePostImage({ image: image(), compressor, maxBytes: MAX, signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(compressor.compressCount).toBeLessThanOrEqual(2);
  });
});

describe('inspectWebp (REQ-UPL-033, TC-UPL-032, 033, 043)', () => {
  it('TC-UPL-032 RIFF/WEBP 헤더이고 RIFF 크기 필드가 전체 길이 - 8인 정지 이미지는 통과한다', () => {
    const bytes = webpBytes(100);
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('RIFF');
    expect(String.fromCharCode(...bytes.slice(8, 12))).toBe('WEBP');
    expect(inspectWebp(bytes)).toEqual({ ok: true, chunks: ['VP8 '] });
  });

  it.each([
    ['VP8L', [{ id: 'VP8L', payload: 20 }]],
    ['VP8X + VP8', [{ id: 'VP8X', payload: 10 }, { id: 'VP8 ', payload: 20 }]],
  ])('TC-UPL-033 첫 청크가 VP8 /VP8L/VP8X이면 통과하고 청크 id를 순서대로 돌려준다: %s', (_name, chunks) => {
    expect(inspectWebp(webpFromChunks(chunks))).toEqual({ ok: true, chunks: chunks.map((c) => c.id) });
  });

  it('TC-UPL-032 마지막 청크의 패딩이 없는 홀수 길이도 허용한다', () => {
    const bytes = webpBytes(101);
    expect(bytes.length).toBe(101);
    expect(inspectWebp(bytes).ok).toBe(true);
  });

  it('TC-UPL-032 12바이트 미만, RIFF가 아님, WEBP가 아님, 크기 필드 불일치를 구분한다', () => {
    expect(inspectWebp(new Uint8Array(11))).toEqual({ ok: false, reason: 'too-short' });
    const notRiff = webpBytes(100);
    notRiff.set([0x52, 0x49, 0x46, 0x58]); // RIFX
    expect(inspectWebp(notRiff)).toEqual({ ok: false, reason: 'not-riff' });
    const notWebp = webpBytes(100);
    notWebp.set([0x57, 0x45, 0x42, 0x58], 8); // WEBX
    expect(inspectWebp(notWebp)).toEqual({ ok: false, reason: 'not-webp' });
    const mismatch = webpBytes(100);
    mismatch[4] = 0x10;
    expect(inspectWebp(mismatch)).toEqual({ ok: false, reason: 'size-mismatch' });
  });

  it('TC-UPL-033 첫 청크가 이미지 청크가 아니면 no-image-chunk다', () => {
    expect(inspectWebp(webpFromChunks([{ id: 'JUNK', payload: 8 }, { id: 'VP8 ', payload: 8 }]))).toEqual({ ok: false, reason: 'no-image-chunk' });
  });

  it.each([
    ['ANIM 청크', webpFromChunks([{ id: 'VP8X', payload: 10 }, { id: 'ANIM', payload: 6 }, { id: 'ANMF', payload: 16 }])],
    ['ANMF 청크', webpFromChunks([{ id: 'VP8X', payload: 10 }, { id: 'ANMF', payload: 16 }])],
    ['VP8X 애니메이션 플래그(0x02)', webpFromChunks([{ id: 'VP8X', payload: [0x02, 0, 0, 0, 0, 0, 0, 0, 0, 0] }, { id: 'VP8 ', payload: 8 }])],
  ])('TC-UPL-043 %s가 있으면 animated다', (_name, bytes) => {
    expect(inspectWebp(bytes)).toEqual({ ok: false, reason: 'animated' });
  });

  it.each([['EXIF'], ['XMP '], ['ICCP']])('TC-UPL-033 %s 청크가 있으면 metadata다', (id) => {
    expect(inspectWebp(webpFromChunks([{ id: 'VP8X', payload: 10 }, { id: 'VP8 ', payload: 8 }, { id, payload: 6 }]))).toEqual({ ok: false, reason: 'metadata' });
  });

  it('TC-UPL-043 애니메이션과 메타데이터가 함께 있으면 animated가 먼저다', () => {
    expect(inspectWebp(webpFromChunks([{ id: 'VP8X', payload: 10 }, { id: 'EXIF', payload: 4 }, { id: 'ANIM', payload: 6 }]))).toEqual({ ok: false, reason: 'animated' });
  });
});

describe('selectWebpBackend (upload-edit.md 플랫폼별 허용 차이)', () => {
  it('TC-UPL-032 canvas가 WebP 인코딩을 지원하면 canvas, 아니면 WASM, 둘 다 안 되면 null이다(PNG/JPEG 폴백 없음)', () => {
    expect(selectWebpBackend({ canvasWebp: true, wasm: true })).toBe('canvas');
    expect(selectWebpBackend({ canvasWebp: true, wasm: false })).toBe('canvas');
    expect(selectWebpBackend({ canvasWebp: false, wasm: true })).toBe('wasm');
    expect(selectWebpBackend({ canvasWebp: false, wasm: false })).toBeNull();
  });
});
