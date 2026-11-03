/** 사진 아래 제목·하트 줄이 차지하는 높이(열 너비 대비 비율). 열 높이를 어림할 때만 쓴다. */
export const TILE_CAPTION_UNITS = 0.2;

export type MasonryAssignment = ReadonlyMap<string, 0 | 1>;

/**
 * 2열 메이슨리 배치(TC-DISP-057): 목록 순서대로 지금까지 더 낮은 열에 사진을 쌓는다.
 * 사진 비율(가로/세로)은 이미지를 읽은 뒤에야 알 수 있어서 처음 놓는 순간 모르면 정사각형(1)으로 어림한다.
 * 한 번 놓인 사진은 `previous`에 기록된 열에 그대로 남는다. 이미지가 로드돼 비율이 알려져도 열을 옮기지 않으므로
 * 타일이 열 사이를 점프하거나 스크롤 위치가 흔들리지 않는다(비율은 이후에 새로 놓일 사진의 균형에만 쓰인다).
 * 목록에서 사라진 사진의 기록은 버린다. 높이가 같으면 왼쪽 열이 먼저다.
 */
export function splitMasonry<T extends { id: string }>(
  items: readonly T[],
  ratios: Readonly<Record<string, number>>,
  previous: MasonryAssignment = new Map(),
): { columns: [T[], T[]]; assignment: MasonryAssignment } {
  const columns: [T[], T[]] = [[], []];
  const heights = [0, 0];
  const assignment = new Map<string, 0 | 1>();
  for (const item of items) {
    const kept = previous.get(item.id);
    const column: 0 | 1 = kept ?? (heights[1] < heights[0] ? 1 : 0);
    assignment.set(item.id, column);
    columns[column].push(item);
    heights[column] += 1 / (ratios[item.id] ?? 1) + TILE_CAPTION_UNITS;
  }
  return { columns, assignment };
}

export function sameAssignment(a: MasonryAssignment, b: MasonryAssignment): boolean {
  if (a.size !== b.size) return false;
  for (const [id, column] of a) if (b.get(id) !== column) return false;
  return true;
}
