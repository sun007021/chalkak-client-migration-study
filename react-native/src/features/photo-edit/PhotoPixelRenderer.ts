import type { RgbaImage } from './ImageTypes';
import type { PhotoEdit } from './PhotoEdit';

/**
 * 순수 TS 기준 렌더러: 회전 -> 자르기(기하) -> 색 조정 -> 필터 순서(REQ-EDIT-008)로 픽셀 버퍼를 만든다.
 * 네이티브 파이프라인과 같은 결과여야 하는 기준이자, 작은 분석 표본·썸네일을 만드는 데 쓴다.
 */
export function renderPixels(image: RgbaImage, edit: PhotoEdit): RgbaImage {
  void image;
  void edit;
  throw new Error('not implemented');
}
