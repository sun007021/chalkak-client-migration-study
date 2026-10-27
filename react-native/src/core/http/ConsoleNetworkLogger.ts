import type { NetworkLogEntry, NetworkLogger } from './NetworkLogger';

/** 개발용 로거. 호출자가 비밀값을 넣지 않는 계약(NetworkLogger)이므로 그대로 출력한다. */
export class ConsoleNetworkLogger implements NetworkLogger {
  log(entry: NetworkLogEntry): void {
    const line = `[net] ${entry.event}`;
    if (entry.level === 'error') console.error(line, entry);
    else if (entry.level === 'warn') console.warn(line, entry);
    else if (__DEV__) console.debug(line, entry);
  }
}
