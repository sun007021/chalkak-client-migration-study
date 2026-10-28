import { type GestureResponderEvent, PanResponder, type PanResponderInstance } from 'react-native';

import type { SignatureDrawViewModel } from './SignatureDrawViewModel';
import type { Point } from './Stroke';

/**
 * 그리기 영역의 터치를 ViewModel의 획 입력으로 옮긴다. PanResponder는 한 번만 만들고,
 * 화면 크기는 레이아웃이 끝난 뒤 setWidth로 알려 준다(핸들러가 호출 시점의 값을 읽는다).
 * 터치 좌표(화면 픽셀)를 ViewModel의 논리 캔버스 크기로 환산하고, 유한하지 않은 값은 버린다.
 */
export class SignaturePadGesture {
  readonly responder: PanResponderInstance;
  private width = 0;

  constructor(private readonly viewModel: SignatureDrawViewModel) {
    this.responder = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (event) => this.withPoint(event, (p) => viewModel.beginStroke(p)),
      onPanResponderMove: (event) => this.withPoint(event, (p) => viewModel.appendPoint(p)),
      onPanResponderRelease: () => viewModel.endStroke(),
      onPanResponderTerminate: () => viewModel.endStroke(),
    });
  }

  setWidth(width: number): void {
    this.width = width;
  }

  /** 테스트와 핸들러가 같이 쓰는 환산. 너비를 모르면 1:1로 본다. */
  toCanvas(locationX: number, locationY: number): Point | null {
    const scale = this.width > 0 ? this.viewModel.canvas.width / this.width : 1;
    const point = { x: locationX * scale, y: locationY * scale };
    return Number.isFinite(point.x) && Number.isFinite(point.y) ? point : null;
  }

  private withPoint(event: GestureResponderEvent, apply: (point: Point) => void): void {
    const point = this.toCanvas(event.nativeEvent.locationX, event.nativeEvent.locationY);
    if (point) apply(point);
  }
}
