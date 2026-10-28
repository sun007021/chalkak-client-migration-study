import type { MonotonicClock } from '../media/MonotonicClock';

export interface Clock {
  now(): Date;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

/** 기기 벽시계를 바꿔도 거꾸로 가지 않는 단조 시계(업로드 URL 만료 판정용). 시스템 시계를 부르는 곳은 이 파일뿐이다. */
export class SystemMonotonicClock implements MonotonicClock {
  nowMs(): number {
    return performance.now();
  }
}
