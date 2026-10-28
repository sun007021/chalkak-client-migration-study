import { KstDate } from '../core/time/KstDate';
import { parseInstant } from '../core/time/kst';

// 디코더 공용 도구. 모양이 어긋나면 throw하고, ApiClient.requestJson이 InvalidResponseError로 바꾼다.

export type Obj = Record<string, unknown>;

export function asObject(raw: unknown, what: string): Obj {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`${what} is not an object`);
  }
  return raw as Obj;
}

export function asArray(raw: unknown, what: string): unknown[] {
  if (!Array.isArray(raw)) throw new Error(`${what} is not an array`);
  return raw;
}

export function str(o: Obj, key: string): string {
  const v = o[key];
  if (typeof v !== 'string' || v === '') throw new Error(`${key} must be a non-empty string`);
  return v;
}

/** null·생략은 null. 있는데 문자열이 아니면 throw. */
export function optStr(o: Obj, key: string): string | null {
  const v = o[key];
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string') throw new Error(`${key} must be a string`);
  return v;
}

export function bool(o: Obj, key: string): boolean {
  const v = o[key];
  if (typeof v !== 'boolean') throw new Error(`${key} must be a boolean`);
  return v;
}

export function nonNegInt(o: Obj, key: string): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
    throw new Error(`${key} must be a non-negative integer`);
  }
  return v;
}

export function kstDate(o: Obj, key: string): KstDate {
  const date = KstDate.parse(str(o, key));
  if (date === null) throw new Error(`${key} must be yyyy-MM-dd`);
  return date;
}

export function instant(o: Obj, key: string): Date {
  const date = parseInstant(str(o, key));
  if (date === null) throw new Error(`${key} must be an ISO-8601 instant`);
  return date;
}

export function oneOf<T extends string>(o: Obj, key: string, allowed: readonly T[]): T {
  const v = o[key];
  if (typeof v !== 'string' || !allowed.includes(v as T)) {
    throw new Error(`${key} has an unknown value`);
  }
  return v as T;
}

/** `scheme://host...` 형태(공백 없음, 호스트 있음). */
const URL_WITH_HOST = /^(https?):\/\/[^\s/?#]+(?:[/?#]\S*)?$/i;

export function isHttpsUrlWithHost(value: string): boolean {
  const match = URL_WITH_HOST.exec(value);
  return match !== null && match[1].toLowerCase() === 'https';
}

export function isHttpUrlWithHost(value: string): boolean {
  return URL_WITH_HOST.test(value);
}
