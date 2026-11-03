import { splitMasonry, TILE_CAPTION_UNITS } from './masonry';

const post = (id: string) => ({ id });
const heightOf = (column: { id: string }[], ratios: Record<string, number>) =>
  column.reduce((sum, p) => sum + 1 / (ratios[p.id] ?? 1) + TILE_CAPTION_UNITS, 0);

describe('splitMasonry', () => {
  it('TC-DISP-057 비율을 모르면 정사각형으로 보고 좌우로 번갈아 쌓는다(순서 유지)', () => {
    const {
      columns: [left, right],
    } = splitMasonry(['a', 'b', 'c', 'd', 'e'].map(post), {});
    expect(left.map((p) => p.id)).toEqual(['a', 'c', 'e']);
    expect(right.map((p) => p.id)).toEqual(['b', 'd']);
  });

  it('TC-DISP-057 세로로 긴 사진이 한쪽에 몰리지 않고 열 높이 차이가 가장 큰 타일보다 작다', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    // fixture mixed-ratio와 같은 비율 순환: 1:1, 3:4, 4:3, 9:16
    const cycle = [1, 3 / 4, 4 / 3, 9 / 16];
    const ratios = Object.fromEntries(ids.map((id, i) => [id, cycle[i % cycle.length]]));
    const {
      columns: [left, right],
    } = splitMasonry(ids.map(post), ratios);
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
    expect(splitMasonry([], {}).columns).toEqual([[], []]);
  });

  it('TC-DISP-057 한 번 놓인 사진은 비율이 알려져도 열을 옮기지 않고, 새 사진만 균형에 맞춰 놓인다', () => {
    const first = splitMasonry(['a', 'b', 'c'].map(post), {});
    const columnOf = (cols: { id: string }[][], id: string) =>
      cols.findIndex((c) => c.some((p) => p.id === id));
    // a가 아주 세로로 긴 사진으로 밝혀져도 a·b·c는 처음 자리에 남는다.
    const ratios = { a: 0.3, b: 2, c: 1 };
    const second = splitMasonry(['a', 'b', 'c', 'd'].map(post), ratios, first.assignment);
    for (const id of ['a', 'b', 'c']) {
      expect(columnOf(second.columns, id)).toBe(columnOf(first.columns, id));
    }
    // 새 사진 d는 더 낮은 열(오른쪽: b만 가로로 넓음)로 간다.
    expect(second.columns[1].map((p) => p.id)).toEqual(['b', 'd']);
  });
});
