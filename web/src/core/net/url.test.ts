import { parseApiBaseUrl } from '../config/apiBaseUrl';
import { buildUrl, toWireUuid } from './url';

const base = parseApiBaseUrl('https://mock.local');

describe('buildUrl', () => {
  it('REQ-NET-003 기준 주소와 경로를 슬래시 중복 없이 잇는다', () => {
    expect(buildUrl(base, '/notifications')).toBe('https://mock.local/api/v1/notifications');
    expect(buildUrl(parseApiBaseUrl('same-origin', { pageOrigin: 'http://localhost:5173' }), '/posts/today')).toBe('http://localhost:5173/api/v1/posts/today');
  });

  it('TC-NET-052 경로와 쿼리의 UUID를 소문자 정규형으로 보낸다', () => {
    const upper = '3F2504E0-4F89-11D3-9A0C-0305E82C3301';
    expect(buildUrl(base, `/posts/${upper}`)).toBe('https://mock.local/api/v1/posts/3f2504e0-4f89-11d3-9a0c-0305e82c3301');
    expect(buildUrl(base, '/posts', { cursorId: upper })).toContain('cursorId=3f2504e0-4f89-11d3-9a0c-0305e82c3301');
    expect(toWireUuid(upper)).toBe(upper.toLowerCase());
  });

  it('TC-NET-053 date는 yyyy-MM-dd ASCII, 정수는 로캘과 무관한 10진수, undefined는 생략한다', () => {
    const toLocale = Number.prototype.toLocaleString;
    Number.prototype.toLocaleString = () => '١٢٣'; // 아랍 숫자를 돌려주는 로캘을 흉내
    try {
      const url = buildUrl(base, '/posts', { page: 1, pageSize: 20, date: '2026-10-27', randomSeed: 123456789, sort: 'latest', missing: undefined });
      const q = new URL(url).searchParams;
      expect(q.get('page')).toBe('1');
      expect(q.get('pageSize')).toBe('20');
      expect(q.get('randomSeed')).toBe('123456789');
      expect(q.get('date')).toBe('2026-10-27');
      expect(q.get('sort')).toBe('latest');
      expect(q.has('missing')).toBe(false);
    } finally {
      Number.prototype.toLocaleString = toLocale;
    }
  });
});
