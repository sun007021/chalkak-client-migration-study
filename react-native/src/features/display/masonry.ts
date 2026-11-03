/** 사진 아래 제목·하트 줄이 차지하는 높이(열 너비 대비 비율). 열 높이를 어림할 때만 쓴다. */
export const TILE_CAPTION_UNITS = 0.2;

/**
 * 2열 메이슨리 배치(TC-DISP-057): 목록 순서대로 지금까지 더 낮은 열에 사진을 쌓는다.
 * 사진 비율(가로/세로)은 이미지를 읽은 뒤에야 알 수 있어서 모르는 동안은 정사각형(1)으로 어림하고,
 * 비율이 알려지면 다음 렌더에서 다시 균형을 맞춘다. 높이가 같으면 왼쪽 열이 먼저다.
 */
export function splitMasonry<T extends { id: string }>(
  items: readonly T[],
  ratios: Readonly<Record<string, number>>,
): [T[], T[]] {
  const columns: [T[], T[]] = [[], []];
  const heights = [0, 0];
  for (const item of items) {
    const column = heights[1] < heights[0] ? 1 : 0;
    columns[column].push(item);
    heights[column] += 1 / (ratios[item.id] ?? 1) + TILE_CAPTION_UNITS;
  }
  return columns;
}
