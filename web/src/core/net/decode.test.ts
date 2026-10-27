import { d, DecodeError } from './decode';
import { InvalidResponseError } from './errors';

describe('decoder DSL', () => {
  const user = d.object({ id: d.string(), age: d.number(), nick: d.nullable(d.string()) });

  it('TC-NET-008 알 수 없는 JSON 필드는 무시한다', () => {
    const v = user({ id: 'a', age: 3, nick: null, surprise: { x: 1 } });
    expect(v).toEqual({ id: 'a', age: 3, nick: null });
  });

  it('TC-NET-010 필수 필드 누락·타입 불일치는 DecodeError(InvalidResponseError)다', () => {
    expect(() => user({ age: 3, nick: null })).toThrow(DecodeError);
    expect(() => user({ id: 'a', age: '3', nick: null })).toThrow(InvalidResponseError);
    expect(() => user(null)).toThrow(DecodeError);
    expect(() => user('str')).toThrow(DecodeError);
  });

  it('TC-NET-010 nullable 필드는 null과 생략을 모두 null로 받는다', () => {
    expect(user({ id: 'a', age: 1, nick: null }).nick).toBeNull();
    expect(user({ id: 'a', age: 1 }).nick).toBeNull();
    expect(user({ id: 'a', age: 1, nick: 'n' }).nick).toBe('n');
    expect(() => user({ id: 'a', age: 1, nick: 5 })).toThrow(DecodeError);
  });

  it('TC-NET-010 array, boolean 디코더', () => {
    expect(d.array(d.number())([1, 2])).toEqual([1, 2]);
    expect(() => d.array(d.number())([1, 'x'])).toThrow(DecodeError);
    expect(() => d.array(d.number())({})).toThrow(DecodeError);
    expect(d.boolean()(false)).toBe(false);
    expect(() => d.boolean()('true')).toThrow(DecodeError);
  });

  it('TC-NET-009 알 수 없는 enum 값은 fallback이 있으면 fallback, 없으면 DecodeError다', () => {
    const type = d.enumOf(['POST_APPROVED', 'TOPIC'] as const, { fallback: 'UNKNOWN' });
    expect(type('TOPIC')).toBe('TOPIC');
    expect(type('BRAND_NEW')).toBe('UNKNOWN');
    expect(() => d.enumOf(['A', 'B'] as const)('C')).toThrow(DecodeError);
    expect(() => type(3)).toThrow(DecodeError);
  });

  it('TC-TIME-025 TC-TIME-026 instant 디코더는 유효한 시각을 epoch ms로, 파싱 불가는 DecodeError로 바꾼다', () => {
    expect(d.instant()('2026-10-20T05:00:00Z')).toBe(Date.UTC(2026, 9, 20, 5));
    expect(() => d.instant()('not-a-date')).toThrow(DecodeError);
    expect(() => d.instant()(123)).toThrow(DecodeError);
  });
});
