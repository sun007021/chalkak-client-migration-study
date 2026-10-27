import type { SessionMode } from './authGate';

/** 스플래시 동안 홈 데이터를 미리 받는 훅(홈 PR이 구현). 게스트는 공개 데이터만 받는다(D-05). 거절(reject)은 "프리로드 실패"다. */
export interface HomePreloader {
  preload(mode: SessionMode, signal: AbortSignal): Promise<void>;
}

/** 홈이 생기기 전 기본값: 아무것도 받지 않고 바로 끝난다. */
export class NoopHomePreloader implements HomePreloader {
  preload(_mode: SessionMode, _signal: AbortSignal): Promise<void> {
    throw new Error('not implemented');
  }
}
