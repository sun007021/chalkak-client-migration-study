/** 시작할 수 있는 푸시 구성요소. 반환 함수로 해제한다. */
export type PushPart = { start(): (() => void) | void };

/**
 * 푸시 기능 전체(기기 등록, 권한 요청, 포그라운드 표시, 탭 라우팅)의 시작·정지를 한 곳에서 맡는다.
 * 컨테이너가 하나만 만들고, 참조 수로 센다: 중첩 start는 구독을 늘리지 않고, 마지막 stop에서만 해제한다.
 * 구성요소는 stop -> start에서 상태(권한 판단, 콜드 스타트 탭 소비)를 이어받으므로 StrictMode에서도 안전하다.
 */
export class PushFeature {
  private active = 0;
  private stops: (() => void)[] = [];

  constructor(private readonly parts: readonly PushPart[]) {}

  start(): () => void {
    this.active += 1;
    if (this.active === 1) {
      this.stops = this.parts
        .map((part) => part.start())
        .filter((stop) => typeof stop === 'function');
    }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active -= 1;
      if (this.active === 0) {
        const stops = this.stops;
        this.stops = [];
        stops.forEach((stop) => stop());
      }
    };
  }
}
