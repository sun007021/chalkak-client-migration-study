import type { Logger, LogLevel } from '../core/net/Logger';

/** 테스트용 로그 sink. */
export class RecordingLogger implements Logger {
  readonly entries: { level: LogLevel; message: string; fields?: Record<string, unknown> }[] = [];
  log(level: LogLevel, message: string, fields?: Record<string, unknown>): void {
    this.entries.push({ level, message, fields });
  }
  /** 모든 기록을 한 문자열로(비밀값 포함 여부 검사용). */
  dump(): string {
    return JSON.stringify(this.entries);
  }
}
