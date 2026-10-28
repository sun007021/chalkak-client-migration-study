import { encodePng } from '../../core/image/png';
import { ExpoImageEngine } from './ExpoImageEngine';
import { identityEdit, type PhotoEdit } from './PhotoEdit';

/** expo-file-system / expo-image-manipulator를 메모리로 흉내 낸다. */
const mock = {
  saves: [] as { format: string; compress?: number }[],
  releases: 0,
  deleted: [] as string[],
  size: 1234 as number | null,
  counter: 0,
};
const mockPixels = encodePng(new Uint8Array(4 * 4 * 4).fill(128), 4, 4);

jest.mock('expo-file-system', () => ({
  Paths: { cache: 'file:///cache' },
  File: class {
    uri: string;
    exists = true;
    constructor(...parts: unknown[]) {
      this.uri = parts.map(String).join('/');
    }
    get size() {
      return mock.size;
    }
    async bytes() {
      return mockPixels;
    }
    create() {}
    write() {}
    delete() {
      mock.deleted.push(this.uri);
    }
  },
}));

jest.mock('expo-image-manipulator', () => {
  const ref = {
    width: 4,
    height: 4,
    saveAsync: async (options: { format: string; compress?: number }) => {
      mock.saves.push(options);
      mock.counter += 1;
      return { uri: `file:///cache/out-${mock.counter}.${options.format}`, width: 4, height: 4 };
    },
    release: () => {
      mock.releases += 1;
    },
  };
  const context: Record<string, unknown> = {};
  for (const name of ['resize', 'rotate', 'crop']) context[name] = () => context;
  context.renderAsync = async () => ref;
  context.release = () => undefined;
  return {
    ImageManipulator: { manipulate: () => context },
    SaveFormat: { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' },
  };
});

const SIZE = { width: 4, height: 4 };
const colorEdit = (): PhotoEdit => ({ ...identityEdit(), filter: 'mono' });
const request = (edit: PhotoEdit | null, quality: number) => ({
  sourceUri: 'file:///src.jpg',
  sourceSize: SIZE,
  targetSize: SIZE,
  edit,
  quality,
});

beforeEach(() => {
  mock.saves.length = 0;
  mock.deleted.length = 0;
  mock.releases = 0;
  mock.size = 1234;
});

describe('ExpoImageEngine 라운드', () => {
  it('같은 라운드의 품질 사다리는 칠하기를 한 번만 하고 WebP 저장만 반복한다', async () => {
    const engine = new ExpoImageEngine();
    const edit = colorEdit();
    await engine.encodeWebp(request(edit, 90));
    await engine.encodeWebp(request(edit, 80));
    await engine.encodeWebp(request(edit, 60));
    expect(mock.saves.filter((s) => s.format === 'png')).toHaveLength(1);
    expect(mock.saves.filter((s) => s.format === 'webp').map((s) => s.compress)).toEqual([
      0.9, 0.8, 0.6,
    ]);
    engine.releaseRound();
  });

  it('releaseRound는 만들어 둔 이미지를 놓고, 다음 호출은 다시 만든다', async () => {
    const engine = new ExpoImageEngine();
    await engine.encodeWebp(request(null, 90));
    const before = mock.releases;
    engine.releaseRound();
    expect(mock.releases).toBe(before + 1);
    await engine.encodeWebp(request(null, 90));
    engine.releaseRound();
  });

  it('칠하기에 쓴 원본 이미지는 PNG로 저장한 즉시 놓고 중간 파일은 지운다', async () => {
    const engine = new ExpoImageEngine();
    await engine.encodeWebp(request(colorEdit(), 90));
    expect(mock.deleted.some((uri) => uri.includes('.png'))).toBe(true);
    expect(mock.releases).toBeGreaterThanOrEqual(1);
    engine.releaseRound();
  });

  it('인코딩 결과 크기를 읽을 수 없으면 0으로 통과시키지 않고 실패한다', async () => {
    const engine = new ExpoImageEngine();
    mock.size = null;
    await expect(engine.encodeWebp(request(null, 90))).rejects.toThrow(/size/);
    expect(mock.deleted.some((uri) => uri.includes('.webp'))).toBe(true);
    engine.releaseRound();
  });

  it('이미 취소된 요청은 아무것도 저장하지 않는다', async () => {
    const engine = new ExpoImageEngine();
    const controller = new AbortController();
    controller.abort();
    await expect(engine.encodeWebp(request(null, 90), controller.signal)).rejects.toThrow();
    expect(mock.saves).toEqual([]);
  });
});
