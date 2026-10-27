import type { HomePreloader } from './HomePreloader';

/** 홈 PR 전까지의 자리표시자. 프리로드할 데이터가 없으니 바로 끝난다. */
export class NoopHomePreloader implements HomePreloader {
  async preload(): Promise<void> {}
}
