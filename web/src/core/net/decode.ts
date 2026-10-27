import { InvalidResponseError } from './errors';
import { InvalidInstantError, parseInstant } from '../time/instant';

export type Decoder<T> = (value: unknown) => T;

/** 디코더 DSL. 알 수 없는 키는 무시하고, 필수 누락·타입 불일치는 DecodeError(→ InvalidResponseError)로 던진다. */
export class DecodeError extends InvalidResponseError {}

const describe = (value: unknown): string => (value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value);

function expected(what: string, value: unknown): DecodeError {
  return new DecodeError(`expected ${what} but got ${describe(value)}`);
}

/** 하위 디코더의 오류에 경로를 붙여 다시 던진다. */
function atPath<T>(path: string, run: () => T): T {
  try {
    return run();
  } catch (error) {
    if (error instanceof DecodeError) throw new DecodeError(`${path}: ${error.reason}`, error);
    throw error;
  }
}

export const d = {
  string(): Decoder<string> {
    return (value) => {
      if (typeof value !== 'string') throw expected('string', value);
      return value;
    };
  },
  number(): Decoder<number> {
    return (value) => {
      if (typeof value !== 'number' || !Number.isFinite(value)) throw expected('number', value);
      return value;
    };
  },
  boolean(): Decoder<boolean> {
    return (value) => {
      if (typeof value !== 'boolean') throw expected('boolean', value);
      return value;
    };
  },
  /** null 또는 키 생략(undefined)이면 null. */
  nullable<T>(inner: Decoder<T>): Decoder<T | null> {
    return (value) => (value === null || value === undefined ? null : inner(value));
  },
  array<T>(item: Decoder<T>): Decoder<T[]> {
    return (value) => {
      if (!Array.isArray(value)) throw expected('array', value);
      return value.map((element: unknown, index) => atPath(`[${index}]`, () => item(element)));
    };
  },
  object<S extends Record<string, Decoder<unknown>>>(shape: S): Decoder<{ [K in keyof S]: S[K] extends Decoder<infer R> ? R : never }> {
    return (value) => {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) throw expected('object', value);
      const record = value as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(shape)) {
        out[key] = atPath(key, () => shape[key]!(record[key]));
      }
      return out as { [K in keyof S]: S[K] extends Decoder<infer R> ? R : never };
    };
  },
  /** fallback이 있으면 알 수 없는 값을 fallback으로, 없으면 DecodeError. */
  enumOf<const V extends readonly string[], F extends string = never>(values: V, options?: { fallback: F }): Decoder<V[number] | F> {
    return (value) => {
      if (typeof value !== 'string') throw expected('string enum', value);
      if ((values as readonly string[]).includes(value)) return value as V[number];
      if (options) return options.fallback;
      throw new DecodeError(`unknown enum value: ${value}`);
    };
  },
  /** UTC ISO-8601 Instant 문자열 → epoch ms. */
  instant(): Decoder<number> {
    return (value) => {
      if (typeof value !== 'string') throw expected('instant string', value);
      try {
        return parseInstant(value);
      } catch (error) {
        if (error instanceof InvalidInstantError) throw new DecodeError(`invalid instant: ${value}`, error);
        throw error;
      }
    };
  },
};
