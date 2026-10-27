import json from '../../../shared/constants.json';
import * as c from './constants';

// RN 상수 이름 -> shared/constants.json 값. 이름이 같으면 json[key]와 비교하고, 다르면 아래 매핑을 쓴다.
const RENAMED: Record<string, unknown> = {
  SIGNUP_PENDING_RETRY: {
    intervalMs: json.SIGNUP_PENDING_RETRY_INTERVAL_MS,
    maxAttempts: json.SIGNUP_PENDING_RETRY_MAX,
  },
};
// json에는 있지만 RN이 아직 쓰지 않아 상수로 두지 않는 키(쓰게 되면 constants.ts에 추가하고 여기서 뺀다).
const UNUSED_JSON_KEYS = [
  'FIXTURE_NOW',
  'SIGNUP_PENDING_RETRY_INTERVAL_MS',
  'SIGNUP_PENDING_RETRY_MAX',
];

describe('constants <-> shared/constants.json', () => {
  const exported = c as unknown as Record<string, unknown>;

  it('RN이 내보내는 모든 상수는 json과 같은 값이다', () => {
    for (const [name, value] of Object.entries(exported)) {
      const expected = name in RENAMED ? RENAMED[name] : (json as Record<string, unknown>)[name];
      expect({ name, value }).toEqual({ name, value: expected });
    }
  });

  it('json의 모든 키는 RN 상수로 있거나 미사용 목록에 있다', () => {
    const covered = new Set([
      ...Object.keys(exported),
      ...Object.keys(RENAMED),
      ...UNUSED_JSON_KEYS,
    ]);
    const missing = Object.keys(json).filter((key) => !covered.has(key));
    expect(missing).toEqual([]);
  });

  it('핵심 값 스냅샷(문서 00-overview §6)', () => {
    expect(c.SERVICE_TIME_ZONE).toBe('Asia/Seoul');
    expect(c.FIRST_TOPIC_DATE).toBe('2026-09-17');
    expect(c.POST_TITLE_MAX).toBe(10);
    expect(c.POST_IMAGE_MAX_BYTES).toBe(5_242_880);
    expect([...c.WEBP_QUALITY_LADDER]).toEqual([90, 80, 60, 40]);
    expect(c.SIGNUP_PENDING_RETRY).toEqual({ intervalMs: 1_000, maxAttempts: 10 });
    expect(c.AI_REVIEW_POLL_WINDOW_MS).toBe(300_000);
    expect(c.PAGE_SIZE).toBe(20);
  });
});
