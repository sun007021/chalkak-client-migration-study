import { loadFixture } from '../../core/http/__testing__/loadFixture';
import { parsePushPayload } from '../../core/push/PushPayload';
import { planNotificationTap, type NotificationTapInput } from './NotificationTapPlan';

const SOURCE = '22222222-2222-4222-8222-222222222201';
const NID = '33333333-3333-4333-8333-333333333301';
const input = (over: Partial<NotificationTapInput>): NotificationTapInput => ({
  type: 'POST_APPROVED',
  notificationId: NID,
  sourceType: 'POST',
  sourceId: SOURCE,
  ...over,
});
const fromFixture = (name: string): NotificationTapInput =>
  parsePushPayload(loadFixture<{ data: unknown }>(`push/${name}`).data);

describe('planNotificationTap(D-11 목적지 표)', () => {
  it('TC-PUSH-037 TOPIC은 읽음 없이 홈, 새로고침 대상이다(sourceId 날짜는 무시)', () => {
    expect(planNotificationTap(fromFixture('payload__topic'))).toEqual({
      kind: 'home',
      refreshHome: true,
    });
  });

  it('TC-PUSH-038 REMINDER는 읽음 없이 홈이다', () => {
    expect(planNotificationTap(fromFixture('payload__reminder'))).toEqual({
      kind: 'home',
      refreshHome: false,
    });
  });

  it('TC-PUSH-039 POST_APPROVED는 읽음 뒤 sourceId 게시물 상세(AI 시트 없음)', () => {
    expect(planNotificationTap(fromFixture('payload__post-approved'))).toEqual({
      kind: 'post',
      notificationId: NID,
      postId: SOURCE,
      openAiSheet: false,
    });
  });

  it.each(['payload__ai-review-completed', 'payload__ai-review-failed'])(
    'TC-PUSH-040 %s는 게시물 상세 + AI 시트 자동 열기',
    (name) => {
      expect(planNotificationTap(fromFixture(name))).toMatchObject({
        kind: 'post',
        postId: SOURCE,
        openAiSheet: true,
      });
    },
  );

  it('TC-PUSH-041 POST_REJECTED는 notificationId로 알림 상세', () => {
    expect(planNotificationTap(fromFixture('payload__post-rejected'))).toMatchObject({
      kind: 'detail',
    });
    expect(planNotificationTap(input({ type: 'POST_REJECTED' }))).toEqual({
      kind: 'detail',
      notificationId: NID,
    });
  });

  it('TC-PUSH-042 NOTICE는 sourceId(공지 ID)가 아니라 notificationId로 알림 상세', () => {
    const plan = planNotificationTap(fromFixture('payload__notice'));
    expect(plan).toEqual({
      kind: 'detail',
      notificationId: '33333333-3333-4333-8333-333333333305',
    });
  });

  it('TC-PUSH-043 NOTICE에 notificationId가 없으면 invalid', () => {
    expect(planNotificationTap(fromFixture('payload__missing-notification-id'))).toEqual({
      kind: 'invalid',
    });
  });

  it('TC-PUSH-044 알 수 없는 type은 invalid', () => {
    expect(planNotificationTap(fromFixture('payload__unknown-type'))).toEqual({ kind: 'invalid' });
  });

  it('TC-PUSH-045 type 누락은 invalid', () => {
    expect(planNotificationTap(fromFixture('payload__missing-type'))).toEqual({ kind: 'invalid' });
  });

  it('TC-PUSH-046 UUID 형식이 아닌 ID는 invalid', () => {
    expect(planNotificationTap(fromFixture('payload__invalid-uuid'))).toEqual({ kind: 'invalid' });
  });

  it('TC-PUSH-047 AI 리뷰 type인데 sourceType이 POST가 아니면 invalid', () => {
    expect(planNotificationTap(fromFixture('payload__ai-source-type-not-post'))).toEqual({
      kind: 'invalid',
    });
  });

  it('TC-PUSH-048 대문자 UUID는 유효하고 결과는 소문자 정규형이다', () => {
    const plan = planNotificationTap(
      input({
        notificationId: NID.toUpperCase(),
        sourceId: SOURCE.toUpperCase(),
      }),
    );
    expect(plan).toEqual({
      kind: 'post',
      notificationId: NID,
      postId: SOURCE,
      openAiSheet: false,
    });
    expect(planNotificationTap(fromFixture('payload__uppercase-uuid'))).toMatchObject({
      kind: 'post',
      notificationId: '33333333-3333-4333-8333-3333333333ab',
    });
  });

  it('TC-PUSH-049 비문자열 필드(sourceId 누락)는 invalid', () => {
    expect(planNotificationTap(fromFixture('payload__non-string-values'))).toEqual({
      kind: 'invalid',
    });
  });

  it('TC-NOTI-026 sourceType/sourceId가 null인 POST_APPROVED 행은 invalid', () => {
    expect(planNotificationTap(input({ sourceType: null, sourceId: null }))).toEqual({
      kind: 'invalid',
    });
  });

  it('TC-NOTI-029 AI 알림의 sourceType이 POST가 아니거나 sourceId가 UUID가 아니면 invalid', () => {
    expect(
      planNotificationTap(input({ type: 'AI_REVIEW_COMPLETED', sourceType: 'NOTICE' })),
    ).toEqual({
      kind: 'invalid',
    });
    expect(
      planNotificationTap(input({ type: 'AI_REVIEW_COMPLETED', sourceId: 'not-a-uuid' })),
    ).toEqual({
      kind: 'invalid',
    });
  });

  it('TC-NOTI-024 알 수 없는 type(FUTURE_TYPE, sourceType null)은 invalid', () => {
    expect(
      planNotificationTap(input({ type: 'FUTURE_TYPE', sourceType: null, sourceId: null })),
    ).toEqual({
      kind: 'invalid',
    });
  });

  it('TC-PUSH-051 title/body가 달라도 같은 type이면 같은 목적지(문구·eventId는 분기에 쓰지 않는다)', () => {
    const a = parsePushPayload({
      ...loadFixture<{ data: object }>('push/payload__post-approved').data,
    });
    const b = parsePushPayload({
      ...loadFixture<{ data: object }>('push/payload__post-approved').data,
      eventId: '66666666-6666-4666-8666-666666666699',
      title: '다른 제목',
    });
    expect(planNotificationTap(a)).toEqual(planNotificationTap(b));
  });
});
