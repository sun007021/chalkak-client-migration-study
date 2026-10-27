import type { NetworkLogEntry, NetworkLogger } from '../NetworkLogger';

export class FakeNetworkLogger implements NetworkLogger {
  readonly entries: NetworkLogEntry[] = [];

  log(entry: NetworkLogEntry): void {
    this.entries.push(entry);
  }

  /** 기록된 모든 내용을 하나의 문자열로(비밀값 검사용). */
  dump(): string {
    return JSON.stringify(this.entries);
  }
}
