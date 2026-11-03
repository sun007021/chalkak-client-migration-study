import { splitMasonry, TILE_CAPTION_UNITS } from './masonry';

const post = (id: string) => ({ id });
const heightOf = (column: { id: string }[], ratios: Record<string, number>) =>
  column.reduce((sum, p) => sum + 1 / (ratios[p.id] ?? 1) + TILE_CAPTION_UNITS, 0);

describe('splitMasonry', () => {
  it('TC-DISP-057 비율을 모르면 정사각형으로 보고 좌우로 번갈아 쌓는다(순서 유지)', () => {
    const [left, right] = splitMasonry(['a', 'b', 'c', 'd', 'e'].map(post), {});
    expect(left.map((p) => p.id)).toEqual(['a', 'c', 'e']);
    expect(right.map((p) => p.id)).toEqual(['b', 'd']);
  });

  it('TC-DISP-057 세로로 긴 사진이 한쪽에 몰리지 않고 열 높이 차이가 가장 큰 타일보다 작다', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    // fixture mixed-ratio와 같은 비율 순환: 1:1, 3:4, 4:3, 9:16
    const cycle = [1, 3 / 4, 4 / 3, 9 / 16];
    const ratios = Object.fromEntries(ids.map((id, i) => [id, cycle[i % cycle.length]]));
    const [left, right] = splitMasonry(ids.map(post), ratios);
    const tallest = Math.max(...ids.map((id) => 1 / ratios[id] + TILE_CAPTION_UNITS));
    expect(Math.abs(heightOf(left, ratios) - heightOf(right, ratios))).toBeLessThan(tallest);
    expect([...left, ...right].map((p) => p.id).sort()).toEqual(ids);
    // 각 열 안에서는 목록 순서를 지킨다.
    for (const column of [left, right]) {
      const indexes = column.map((p) => ids.indexOf(p.id));
      expect(indexes).toEqual([...indexes].sort((x, y) => x - y));
    }
  });

  it('빈 목록은 빈 두 열', () => {
    expect(splitMasonry([], {})).toEqual([[], []]);
  });
});
