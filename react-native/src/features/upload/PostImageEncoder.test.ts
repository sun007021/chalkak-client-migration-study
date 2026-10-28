import { CancelledError } from '../../core/http/ApiError';
import { FakeLocalFiles } from '../../core/media/__testing__/FakeLocalFiles';
import { FakeImageEngine } from '../photo-edit/__testing__/FakeImageEngine';
import { ImageDecodeError } from '../photo-edit/ImageErrors';
import { identityEdit, type PhotoEdit } from '../photo-edit/PhotoEdit';
import type { WebpEncodeRequest } from '../photo-edit/ImageEngine';
import { PostImageEncoder } from './PostImageEncoder';
import { SizeLimitExceededError } from './UploadErrors';

const SOURCE = 'file:///picked/a.jpg';
const MAX = 5_242_880;

function setup(size = { width: 1600, height: 1200 }) {
  const files = new FakeLocalFiles();
  const engine = new FakeImageEngine(files);
  engine.sizes.set(SOURCE, size);
  const encoder = new PostImageEncoder({ engine, files });
  const input = (edit: PhotoEdit = identityEdit(), maxBytes = MAX) => ({
    sourceUri: SOURCE,
    edit,
    maxBytes,
  });
  const qualities = () => engine.encodeRequests.map((r) => r.quality);
  return { files, engine, encoder, input, qualities };
}

/** 품질별 크기 표로 압축기를 흉내 낸다. */
const bySize = (table: Record<number, number>) => (request: WebpEncodeRequest) =>
  table[request.quality] ?? Number.MAX_SAFE_INTEGER;

describe('PostImageEncoder - 품질 사다리', () => {
  it('TC-UPL-037 90에서 maxBytes 이하면 90 한 번만 시도하고 끝낸다', async () => {
    const h = setup();
    h.engine.sizeFor = bySize({ 90: 1000 });
    await h.encoder.encode(h.input());
    expect(h.qualities()).toEqual([90]);
  });

  it.each([
    [{ 90: MAX + 1, 80: 1000 }, [90, 80]],
    [{ 90: MAX + 1, 80: MAX + 1, 60: 1000 }, [90, 80, 60]],
    [{ 90: MAX + 1, 80: MAX + 1, 60: MAX + 1, 40: 1000 }, [90, 80, 60, 40]],
  ] as [Record<number, number>, number[]][])(
    'TC-UPL-037 사다리 순서 %j -> %j',
    async (table, expected) => {
      const h = setup();
      h.engine.sizeFor = bySize(table);
      const out = await h.encoder.encode(h.input());
      expect(h.qualities()).toEqual(expected);
      expect(out.byteLength).toBe(1000);
    },
  );

  it('TC-UPL-039 정확히 maxBytes(5,242,880)는 성공이다(이하 허용)', async () => {
    const h = setup();
    h.engine.sizeFor = () => MAX;
    await expect(h.encoder.encode(h.input())).resolves.toMatchObject({ byteLength: MAX });
    expect(h.qualities()).toEqual([90]);
  });

  it('TC-UPL-039 maxBytes보다 1바이트 크면 그 품질은 실패로 보고 다음 단계로 간다', async () => {
    const h = setup();
    h.engine.sizeFor = bySize({ 90: MAX + 1, 80: MAX });
    await expect(h.encoder.encode(h.input())).resolves.toMatchObject({ byteLength: MAX });
    expect(h.qualities()).toEqual([90, 80]);
  });

  it('TC-UPL-058 한도는 항상 정책의 maxBytes다: 작은 maxBytes면 같은 크기도 초과로 본다', async () => {
    const h = setup();
    h.engine.sizeFor = bySize({ 90: 900_000, 80: 700_000 });
    await expect(h.encoder.encode(h.input(identityEdit(), 800_000))).resolves.toMatchObject({
      byteLength: 700_000,
    });
    expect(h.qualities()).toEqual([90, 80]);
  });

  it('TC-UPL-058 maxBytes가 5 MiB보다 커도(5,000,000,000) 그 값을 한도로 쓴다', async () => {
    const h = setup();
    h.engine.sizeFor = () => MAX + 10;
    await expect(h.encoder.encode(h.input(identityEdit(), 5_000_000_000))).resolves.toBeDefined();
    expect(h.qualities()).toEqual([90]);
  });

  it('성공하지 못한 시도의 임시 파일은 바로 지우고 결과 파일만 남긴다', async () => {
    const h = setup();
    h.engine.sizeFor = bySize({ 90: MAX + 1, 80: MAX + 1, 60: 1000 });
    const out = await h.encoder.encode(h.input());
    expect(h.files.existing).toEqual([out.uri]);
    expect(h.files.deleted).toHaveLength(2);
  });
});

describe('PostImageEncoder - 축소 라운드', () => {
  it('TC-UPL-038 모든 품질에서 초과면 0.85배(반올림)로 줄여 총 4라운드 16회 시도한 뒤 SizeLimitExceededError다', async () => {
    const h = setup({ width: 1600, height: 1200 });
    h.engine.sizeFor = () => MAX + 1;
    await expect(h.encoder.encode(h.input())).rejects.toBeInstanceOf(SizeLimitExceededError);

    expect(h.engine.encodeRequests).toHaveLength(16);
    expect(h.qualities()).toEqual([90, 80, 60, 40, 90, 80, 60, 40, 90, 80, 60, 40, 90, 80, 60, 40]);
    // [가정: 줄이는 크기는 직전 라운드 크기에 0.85를 곱해 반올림한다(연쇄)]
    const rounds = [0, 4, 8, 12].map((i) => h.engine.encodeRequests[i].targetSize);
    expect(rounds).toEqual([
      { width: 1600, height: 1200 },
      { width: 1360, height: 1020 },
      { width: 1156, height: 867 },
      { width: 983, height: 737 },
    ]);
  });

  it('TC-UPL-038 실패하면 만든 임시 파일이 하나도 남지 않는다', async () => {
    const h = setup();
    h.engine.sizeFor = () => MAX + 1;
    await h.encoder.encode(h.input()).catch(() => undefined);
    expect(h.files.existing).toEqual([]);
    expect(h.files.deleted).toHaveLength(16);
  });

  it('TC-UPL-038 중간 라운드에서 성공하면 즉시 끝낸다(2라운드 60에서 성공 = 총 7회)', async () => {
    const h = setup();
    h.engine.sizeFor = (request) =>
      request.targetSize.width < 1500 && request.quality === 60 ? 1000 : MAX + 1;
    const out = await h.encoder.encode(h.input());
    expect(h.engine.encodeRequests).toHaveLength(7);
    expect(out.width).toBe(1360);
    expect(out.height).toBe(1020);
  });

  it('TC-UPL-042 불가능한 maxBytes(1,000)는 SizeLimitExceededError다', async () => {
    const h = setup();
    h.engine.sizeFor = () => 50_000;
    await expect(h.encoder.encode(h.input(identityEdit(), 1_000))).rejects.toBeInstanceOf(
      SizeLimitExceededError,
    );
  });
});

describe('PostImageEncoder - 크기와 편집', () => {
  it('TC-UPL-035 먼저 크기만 읽고(readBounds) 편집용 전체 비트맵 준비(prepareEditable)는 하지 않는다', async () => {
    const h = setup({ width: 8000, height: 6000 });
    await h.encoder.encode(h.input());
    expect(h.engine.calls[0].method).toBe('readBounds');
    expect(h.engine.callsOf('readBounds')).toHaveLength(1);
    expect(h.engine.callsOf('prepareEditable')).toHaveLength(0);
    // 목표 크기가 인코딩 요청에 전달된다(디코더가 줄여서 읽는다)
    expect(h.engine.encodeRequests[0].sourceSize).toEqual({ width: 8000, height: 6000 });
    expect(h.engine.encodeRequests[0].targetSize.width).toBeLessThan(8000);
  });

  it.each([
    [{ width: 8000, height: 6000 }],
    [{ width: 4608, height: 3456 }],
    [{ width: 4097, height: 3000 }],
    [{ width: 3000, height: 9000 }],
  ])('TC-UPL-034 %j는 긴 변 4096 이하이고 비율 오차가 1px 이내다', async (size) => {
    const h = setup(size);
    await h.encoder.encode(h.input());
    const { targetSize } = h.engine.encodeRequests[0];
    expect(Math.max(targetSize.width, targetSize.height)).toBeLessThanOrEqual(4096);
    expect(
      Math.abs(targetSize.height - (targetSize.width * size.height) / size.width),
    ).toBeLessThanOrEqual(1);
  });

  it('TC-UPL-034 4096x3072와 작은 사진은 그대로 두고 절대 확대하지 않는다', async () => {
    const a = setup({ width: 4096, height: 3072 });
    await a.encoder.encode(a.input());
    expect(a.engine.encodeRequests[0].targetSize).toEqual({ width: 4096, height: 3072 });

    const b = setup({ width: 640, height: 480 });
    await b.encoder.encode(b.input());
    expect(b.engine.encodeRequests[0].targetSize).toEqual({ width: 640, height: 480 });
  });

  it('TC-EDIT-011 TC-UPL-045 편집이 없으면(isIdentity) edit은 null이라 다시 그리지 않고, 같은 입력은 같은 요청이다', async () => {
    const h = setup();
    const first = await h.encoder.encode(h.input());
    const second = await h.encoder.encode(h.input());
    expect(h.engine.encodeRequests[0].edit).toBeNull();
    expect(h.engine.encodeRequests[1]).toEqual(h.engine.encodeRequests[0]);
    expect(first.byteLength).toBe(second.byteLength);
  });

  it('TC-EDIT-010 편집이 있으면 edit을 그대로 전달하고 손실 인코딩은 시도마다 한 번만 한다(중간 JPEG 없음)', async () => {
    const h = setup();
    const edit: PhotoEdit = { ...identityEdit(), quarterTurns: 1, filter: 'vivid' };
    await h.encoder.encode(h.input(edit));
    expect(h.engine.encodeRequests).toHaveLength(1);
    expect(h.engine.encodeRequests[0].edit).toEqual(edit);
    expect(h.engine.callsOf('prepareEditable')).toHaveLength(0);
  });

  it('TC-EDIT-020 8000x6000 + 중앙 25% 자르기는 먼저 4096 이하로 줄인 크기에서 자른다(출력 약 1000x750)', async () => {
    const h = setup({ width: 8000, height: 6000 });
    const edit: PhotoEdit = {
      ...identityEdit(),
      crop: { centerX: 0.5, centerY: 0.5, width: 0.25, height: 0.25 },
    };
    const out = await h.encoder.encode(h.input(edit));
    const request = h.engine.encodeRequests[0];
    expect(Math.max(request.targetSize.width, request.targetSize.height)).toBeLessThanOrEqual(4096);
    expect(request.edit?.crop.width).toBe(0.25);
    // FakeImageEngine은 targetSize x crop 비율로 출력 크기를 만든다
    expect(out.width).toBeGreaterThan(950);
    expect(out.width).toBeLessThan(1100);
    expect(out.height).toBeGreaterThan(710);
    expect(out.height).toBeLessThan(830);
  });

  it('TC-EDIT-009 EXIF 회전은 readBounds가 돌려준 표시 크기(회전 반영)를 기준으로 쓴다', async () => {
    const h = setup({ width: 3000, height: 4000 });
    await h.encoder.encode(h.input());
    expect(h.engine.encodeRequests[0].sourceSize).toEqual({ width: 3000, height: 4000 });
  });

  it('읽을 수 없는 사진(ImageDecodeError)은 그대로 던진다', async () => {
    const h = setup();
    h.engine.sizes.set(SOURCE, new ImageDecodeError());
    await expect(h.encoder.encode(h.input())).rejects.toBeInstanceOf(ImageDecodeError);
    expect(h.engine.encodeRequests).toHaveLength(0);
  });
});

describe('PostImageEncoder - 취소', () => {
  it('TC-UPL-046 인코딩 중 취소하면 결과를 돌려주지 않고 CancelledError, 임시 파일이 없다', async () => {
    const h = setup();
    const hold = h.engine.holdNext('encodeWebp');
    const controller = new AbortController();
    const pending = h.encoder.encode(h.input(), controller.signal);
    const settled = pending.catch((e: unknown) => e);
    await Promise.resolve();
    controller.abort();
    hold.release();
    expect(await settled).toBeInstanceOf(CancelledError);
    expect(h.files.existing).toEqual([]);
  });

  it('TC-UPL-046 사다리 중간에 취소하면 후속 압축을 중단한다(호출 수 확인)', async () => {
    const h = setup();
    const controller = new AbortController();
    h.engine.sizeFor = () => {
      if (h.engine.encodeRequests.length === 2) controller.abort();
      return MAX + 1;
    };
    await expect(h.encoder.encode(h.input(), controller.signal)).rejects.toBeInstanceOf(
      CancelledError,
    );
    expect(h.engine.encodeRequests).toHaveLength(2);
    expect(h.files.existing).toEqual([]);
  });

  it('TC-UPL-046 시작하기 전에 이미 취소됐다면 아무것도 하지 않는다', async () => {
    const h = setup();
    const controller = new AbortController();
    controller.abort();
    await expect(h.encoder.encode(h.input(), controller.signal)).rejects.toBeInstanceOf(
      CancelledError,
    );
    expect(h.engine.encodeRequests).toHaveLength(0);
  });

  it('TC-UPL-046 성공한 직후 취소가 들어오면 만든 결과도 지운다', async () => {
    const h = setup();
    const controller = new AbortController();
    h.engine.sizeFor = () => {
      controller.abort();
      return 1000;
    };
    await expect(h.encoder.encode(h.input(), controller.signal)).rejects.toBeInstanceOf(
      CancelledError,
    );
    expect(h.files.existing).toEqual([]);
  });
});
