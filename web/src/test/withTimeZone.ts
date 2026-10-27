/** 테스트용: 프로세스 시간대(TZ)를 바꿔 fn을 실행하고 되돌린다(기기 시간대가 달라도 결과가 같은지 검증). */
export function withTimeZone<T>(tz: string, fn: () => T): T {
  const prev = process.env.TZ;
  process.env.TZ = tz;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.TZ;
    else process.env.TZ = prev;
  }
}

export const DEVICE_TIME_ZONES = ['UTC', 'America/Los_Angeles', 'Pacific/Kiritimati', 'Pacific/Pago_Pago', 'Asia/Seoul'] as const;

/** 아랍·태국·페르시아 로캘처럼 숫자를 ASCII가 아닌 문자로 바꾸는 환경을 흉내낸다. fn 실행 동안만. */
export function withHostileLocale<T>(fn: () => T): T {
  const num = Number.prototype.toLocaleString;
  const dateStr = Date.prototype.toLocaleDateString;
  const timeStr = Date.prototype.toLocaleTimeString;
  const both = Date.prototype.toLocaleString;
  Number.prototype.toLocaleString = () => '٢٠٢٦';
  Date.prototype.toLocaleDateString = () => '٢٠٢٦/١٠/٢٧';
  Date.prototype.toLocaleTimeString = () => '١٢:٠٠';
  Date.prototype.toLocaleString = () => '٢٠٢٦/١٠/٢٧ ١٢:٠٠';
  try {
    return fn();
  } finally {
    Number.prototype.toLocaleString = num;
    Date.prototype.toLocaleDateString = dateStr;
    Date.prototype.toLocaleTimeString = timeStr;
    Date.prototype.toLocaleString = both;
  }
}
