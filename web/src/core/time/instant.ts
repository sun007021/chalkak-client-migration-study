export class InvalidInstantError extends Error {
  readonly name = 'InvalidInstantError';
}

const INSTANT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(?:Z|\+00:00)$/;

/** UTC ISO-8601 Instant → epoch ms. Z / +00:00 / 소수 초 없음·3·6·9자리. 파싱 불가면 InvalidInstantError. */
export function parseInstant(s: string): number {
  const m = INSTANT.exec(s);
  if (!m) throw new InvalidInstantError(`invalid instant: ${s}`);
  const [year, month, day, hour, minute, second] = m.slice(1, 7).map(Number) as [number, number, number, number, number, number];
  const millis = m[7] ? Number(m[7].padEnd(3, '0').slice(0, 3)) : 0;
  if (hour > 23 || minute > 59 || second > 59) throw new InvalidInstantError(`invalid instant: ${s}`);
  const ms = Date.UTC(year, month - 1, day, hour, minute, second, millis);
  const check = new Date(ms);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    throw new InvalidInstantError(`invalid instant: ${s}`);
  }
  return ms;
}
