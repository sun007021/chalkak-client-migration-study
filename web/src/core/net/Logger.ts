export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  log(level: LogLevel, message: string, fields?: Record<string, unknown>): void;
}

/** 브라우저 콘솔로 내보내는 기본 Logger. 호출자가 비밀값을 넣지 않아도 되도록 필드를 한 번 더 걸러 낸다. */
export class ConsoleLogger implements Logger {
  constructor(private readonly sink: Pick<Console, 'debug' | 'info' | 'warn' | 'error'> = console) {}
  log(level: LogLevel, message: string, fields?: Record<string, unknown>): void {
    const safe = fields === undefined ? undefined : sanitizeLogFields(fields);
    if (safe === undefined) this.sink[level](message);
    else this.sink[level](message, safe);
  }
}

/** 키 이름에 token·nonce·authorization이 들어가면(idToken, signupToken, fcmToken, rawNonce 등) 값을 지운다. */
const isSecretKey = (key: string): boolean => /token|nonce|authorization/i.test(key);
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
    out[key] = isSecretKey(key) ? REDACTED : sanitizeValue(inner, depth + 1);
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
