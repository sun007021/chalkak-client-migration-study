import { InvalidResponseError } from './errors';

export type Decoder<T> = (value: unknown) => T;

/** 디코더 DSL. 알 수 없는 키는 무시하고, 필수 누락·타입 불일치는 DecodeError(→ InvalidResponseError)로 던진다. */
export class DecodeError extends InvalidResponseError {}

export const d = {
  string(): Decoder<string> {
    throw new Error('not implemented');
  },
  number(): Decoder<number> {
    throw new Error('not implemented');
  },
  boolean(): Decoder<boolean> {
    throw new Error('not implemented');
  },
  /** null 또는 키 생략(undefined)이면 null. */
  nullable<T>(_inner: Decoder<T>): Decoder<T | null> {
    throw new Error('not implemented');
  },
  array<T>(_item: Decoder<T>): Decoder<T[]> {
    throw new Error('not implemented');
  },
  object<S extends Record<string, Decoder<unknown>>>(_shape: S): Decoder<{ [K in keyof S]: S[K] extends Decoder<infer R> ? R : never }> {
    throw new Error('not implemented');
  },
  /** fallback이 있으면 알 수 없는 값을 fallback으로, 없으면 DecodeError. */
  enumOf<const V extends readonly string[], F extends string = never>(_values: V, _options?: { fallback: F }): Decoder<V[number] | F> {
    throw new Error('not implemented');
  },
  /** UTC ISO-8601 Instant 문자열 → epoch ms. */
  instant(): Decoder<number> {
    throw new Error('not implemented');
  },
};
