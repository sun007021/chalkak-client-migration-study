import { loadFixture } from '../http/__testing__/loadFixture';
import { parsePushPayload } from './PushPayload';

type PushFixture = {
  data: Record<string, unknown>;
  notification?: { title: string; body: string };
};
const data = (name: string) => loadFixture<PushFixture>(`push/${name}`).data;

describe('parsePushPayload', () => {
  it('TC-PUSH-050 평탄한 data 맵(iOS userInfo, Android extras, 플러그인 래퍼 결과)을 같은 PushPayload로 바꾼다', () => {
    const expected = {
      eventId: '66666666-6666-4666-8666-666666666601',
      notificationId: '33333333-3333-4333-8333-333333333301',
      type: 'POST_APPROVED',
      sourceType: 'POST',
      sourceId: '22222222-2222-4222-8222-222222222201',
    };
    expect(parsePushPayload(data('payload__post-approved'))).toEqual(expected);
    // 플러그인이 Record<string, unknown>로 감싸 넘겨도, 키 순서가 달라도 같다.
    expect(parsePushPayload({ ...Object.fromEntries(Object.entries(expected).reverse()) })).toEqual(
      expected,
    );
  });

  it('TC-PUSH-050 iOS의 중첩 notification/data 구조는 가정하지 않는다(최상위 키만 읽는다)', () => {
    const nested = { aps: { alert: 'x' }, data: data('payload__post-approved') };
    expect(parsePushPayload(nested)).toEqual({
      eventId: null,
      notificationId: null,
      type: null,
      sourceType: null,
      sourceId: null,
    });
  });

  it('TC-PUSH-037 TOPIC은 notificationId가 없어도 type과 sourceId를 읽는다', () => {
    expect(parsePushPayload(data('payload__topic'))).toMatchObject({
      type: 'TOPIC',
      notificationId: null,
      sourceId: '11111111-1111-4111-8111-111111111127',
    });
  });

  it('TC-PUSH-049 문자열이 아닌 값(숫자, 중첩 객체, 배열)은 누락(null)으로 보고 예외를 던지지 않는다', () => {
    expect(parsePushPayload(data('payload__non-string-values'))).toEqual({
      eventId: null,
      notificationId: null,
      type: 'POST_APPROVED',
      sourceType: 'POST',
      sourceId: null,
    });
  });

  it('TC-PUSH-045 type 필드가 없으면 type이 null이다', () => {
    expect(parsePushPayload(data('payload__missing-type')).type).toBeNull();
  });

  it.each([null, undefined, 'text', 42, [], [1, 2]])(
    'TC-PUSH-049 객체가 아닌 입력(%p)도 모든 필드가 null인 payload가 된다',
    (raw) => {
      expect(parsePushPayload(raw)).toEqual({
        eventId: null,
        notificationId: null,
        type: null,
        sourceType: null,
        sourceId: null,
      });
    },
  );

  it('빈 문자열은 누락으로 본다', () => {
    expect(parsePushPayload({ type: '', notificationId: '' }).type).toBeNull();
    expect(parsePushPayload({ type: '', notificationId: '' }).notificationId).toBeNull();
  });
});
