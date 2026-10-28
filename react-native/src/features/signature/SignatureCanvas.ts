import type { Size } from './Stroke';

/**
 * 그리기 영역의 논리 크기. 기존 앱과 같이 정사각형이다: PNG 정규화가 캔버스 대비 비율로 이뤄져서
 * 정사각형일 때 화면 비율이 그대로 유지된다. 화면은 실제 크기에 맞춰 터치 좌표를 이 크기로 환산해 ViewModel에 넘긴다.
 */
export const SIGNATURE_CANVAS: Size = { width: 300, height: 300 };
