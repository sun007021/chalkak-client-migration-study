import type { HomePreloader, PreloadMode } from '../HomePreloader';
import type { PlayUpdateClient, PlayUpdateInfo } from '../PlayUpdateChecker';
import type { StoreOpener, UpdateChecker, UpdateCheckResult } from '../UpdateChecker';

/** 결과를 순서대로 돌려준다(다 쓰면 마지막 반복). Error면 throw. `gate`가 있으면 풀릴 때까지 대기. */
export class FakeUpdateChecker implements UpdateChecker {
  calls = 0;
  gate: Promise<void> | null = null;
  private readonly results: (UpdateCheckResult | Error)[];

  constructor(...results: (UpdateCheckResult | Error)[]) {
    this.results = results.length > 0 ? results : ['up-to-date'];
  }

  async check(): Promise<UpdateCheckResult> {
    const index = Math.min(this.calls, this.results.length - 1);
    this.calls += 1;
    if (this.gate) await this.gate;
    const result = this.results[index];
    if (result instanceof Error) throw result;
    return result;
  }
}

export class FakeStoreOpener implements StoreOpener {
  calls = 0;
  failWith: Error | null = null;
  gate: Promise<void> | null = null;

  async open(): Promise<void> {
    this.calls += 1;
    if (this.gate) await this.gate;
    if (this.failWith) throw this.failWith;
  }
}

/** 기본은 즉시 성공. `gate`로 완료 시점을, `failWith`로 오류를 정한다. */
export class FakeHomePreloader implements HomePreloader {
  readonly calls: PreloadMode[] = [];
  gate: Promise<void> | null = null;
  failWith: Error | null = null;

  async preload(mode: PreloadMode): Promise<void> {
    this.calls.push(mode);
    if (this.gate) await this.gate;
    if (this.failWith) throw this.failWith;
  }
}

export class FakePlayUpdateClient implements PlayUpdateClient {
  info: PlayUpdateInfo | Error = { availability: 'UPDATE_AVAILABLE', priority: 0 };

  async getUpdateInfo(): Promise<PlayUpdateInfo> {
    if (this.info instanceof Error) throw this.info;
    return this.info;
  }
}
