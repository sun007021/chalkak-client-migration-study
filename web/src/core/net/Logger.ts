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

const SECRET_KEYS = new Set(['accesstoken', 'refreshtoken', 'idtoken', 'rawnonce', 'fcmtoken', 'signuptoken', 'authorization']);
const REDACTED = '[REDACTED]';
const MAX_DEPTH = 8;
const URL_WITH_QUERY = /(https?:\/\/[^\s?#"'<>]+)[?#][^\s"'<>]*/g;
const BEARER = /Bearer\s+[^\s"']+/gi;

function sanitizeValue(value: unknown, depth: number): unknown {
  if (typeof value === 'string') return value.replace(URL_WITH_QUERY, '$1').replace(BEARER, `Bearer ${REDACTED}`);
  if (typeof value !== 'object' || value === null) return value;
  if (depth >= MAX_DEPTH) return '[truncated]';
  if (value instanceof Error) return { name: value.name, message: sanitizeValue(value.message, depth + 1) };
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value)) {
    out[key] = SECRET_KEYS.has(key.toLowerCase()) ? REDACTED : sanitizeValue(inner, depth + 1);
  }
  return out;
}

/** 토큰/idToken/rawNonce/fcmToken/signupToken 값과 presigned URL 쿼리를 제거한 사본을 돌려준다(REQ-NET-031). */
export function sanitizeLogFields(fields: unknown): unknown {
  return sanitizeValue(fields, 0);
}

/** URL에서 쿼리 문자열과 fragment를 제거한다. */
export function stripUrlQuery(url: string): string {
  const end = url.search(/[?#]/);
  return end === -1 ? url : url.slice(0, end);
}
