export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  log(level: LogLevel, message: string, fields?: Record<string, unknown>): void;
}

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

/** 토큰/idToken/rawNonce/fcmToken/signupToken 값과 presigned URL 쿼리를 제거한 사본을 돌려준다(REQ-NET-031). */
export function sanitizeLogFields(_fields: unknown): unknown {
  throw new Error('not implemented');
}

/** URL에서 쿼리 문자열과 fragment를 제거한다. */
export function stripUrlQuery(_url: string): string {
  throw new Error('not implemented');
}
