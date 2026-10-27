export class InvalidInstantError extends Error {
  readonly name = 'InvalidInstantError';
}

/** UTC ISO-8601 Instant → epoch ms. Z / +00:00 / 소수 초 없음·3·6·9자리. 파싱 불가면 InvalidInstantError. */
export function parseInstant(_s: string): number {
  throw new Error('not implemented');
}
