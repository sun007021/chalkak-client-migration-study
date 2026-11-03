import { loadFixture } from '../../test/fixtures';
import { noti, SOURCE_POST } from '../../test/notificationHarness';
import { planRowTap } from './notificationTarget';
import type { RowTapPlan } from './notificationTarget';

const base = { id: noti(1), type: 'POST_APPROVED', sourceType: 'POST' as string | null, sourceId: SOURCE_POST as string | null };
const plan = (overrides: Partial<typeof base> = {}): RowTapPlan => planRowTap({ ...base, ...overrides });

interface Raw {
  id: string;
  type: string;
  sourceType: string | null;
  sourceId: string | null;
}
const fixtureItems = (name: string): Raw[] => (loadFixture(`notification/${name}.json`).json as { notifications: Raw[] }).notifications;

describe('planRowTap 목적지 표 (D-11)', () => {
  it('TC-NOTI-027 POST_APPROVED는 읽음 후 게시물 상세(sourceId, AI 시트 없음)다', () => {
    expect(plan()).toEqual({ kind: 'read', destination: { kind: 'post', postId: SOURCE_POST, openAiReview: false } });
  });

  it.each(['AI_REVIEW_COMPLETED', 'AI_REVIEW_FAILED'])('TC-NOTI-028 %s는 읽음 후 게시물 상세 + AI 시트 자동 열기 플래그다', (type) => {
    expect(plan({ type, id: noti(3) })).toEqual({ kind: 'read', destination: { kind: 'post', postId: SOURCE_POST, openAiReview: true } });
  });

  it('TC-NOTI-031 POST_REJECTED는 읽음 후 알림 상세다(알림 자신의 id, sourceId가 아니다)', () => {
    expect(plan({ type: 'POST_REJECTED', id: noti(2) })).toEqual({ kind: 'read', destination: { kind: 'detail', notificationId: noti(2) } });
  });

  it('TC-NOTI-030 NOTICE는 읽음 후 알림 상세이고 notificationId는 알림 id다(공지 sourceId가 아니다)', () => {
    const notice = fixtureItems('notifications__page1')[4]!;
    expect(notice.sourceId).toBe('77777777-7777-4777-8777-777777777701');
    expect(planRowTap(notice)).toEqual({ kind: 'read', destination: { kind: 'detail', notificationId: noti(5) } });
  });

  it('TC-NOTI-030 NOTICE는 sourceType·sourceId가 없어도 알림 상세로 갈 수 있다(알림 id만 필요)', () => {
    expect(plan({ type: 'NOTICE', id: noti(5), sourceType: null, sourceId: null })).toEqual({ kind: 'read', destination: { kind: 'detail', notificationId: noti(5) } });
  });

  it.each(['TOPIC', 'REMINDER'])('TC-NOTI-025 %s는 읽음 요청 없이 홈으로 간다(Q-11)', (type) => {
    expect(plan({ type, sourceType: type, sourceId: '11111111-1111-4111-8111-111111111127' })).toEqual({ kind: 'home' });
    expect(plan({ type, sourceType: null, sourceId: null })).toEqual({ kind: 'home' });
  });

  it('TC-NOTI-024 알 수 없는 type은 이동도 읽음도 없다(ignore)', () => {
    const [unknown] = fixtureItems('notifications__unknown-type');
    expect(planRowTap(unknown!)).toEqual({ kind: 'ignore' });
    expect(plan({ type: '' })).toEqual({ kind: 'ignore' });
    expect(plan({ type: 'post_approved' })).toEqual({ kind: 'ignore' }); // 대소문자 구분
  });

  it('TC-NOTI-026 POST_APPROVED인데 sourceType·sourceId가 null이면 ignore다', () => {
    const [item] = fixtureItems('notifications__null-source');
    expect(planRowTap(item!)).toEqual({ kind: 'ignore' });
    expect(plan({ sourceType: null })).toEqual({ kind: 'ignore' });
    expect(plan({ sourceId: null })).toEqual({ kind: 'ignore' });
  });

  it('TC-NOTI-029 AI 알림의 sourceType이 POST가 아니거나 sourceId가 UUID가 아니면 ignore다(fixture)', () => {
    for (const item of fixtureItems('notifications__bad-ai-source')) expect(planRowTap(item), item.id).toEqual({ kind: 'ignore' });
  });

  it.each([
    ['sourceType이 NOTICE', { sourceType: 'NOTICE' }],
    ['sourceType이 소문자 post', { sourceType: 'post' }],
    ['sourceId가 UUID가 아님', { sourceId: 'not-a-uuid' }],
    ['sourceId가 빈 문자열', { sourceId: '' }],
    ['sourceId에 경로 조각', { sourceId: `${SOURCE_POST}/../x` }],
  ])('TC-NOTI-029 TC-NOTI-026 POST_APPROVED·AI 알림: %s → ignore', (_name, change) => {
    expect(plan(change)).toEqual({ kind: 'ignore' });
    expect(plan({ type: 'AI_REVIEW_COMPLETED', ...change })).toEqual({ kind: 'ignore' });
  });

  it('REQ-NOTI-021 알림 상세로 가는 type도 알림 id가 UUID 형식이 아니면 ignore다', () => {
    expect(plan({ type: 'POST_REJECTED', id: 'not-a-uuid' })).toEqual({ kind: 'ignore' });
    expect(plan({ type: 'NOTICE', id: '' })).toEqual({ kind: 'ignore' });
  });

  it('대문자 UUID는 유효로 보고 결과의 id는 소문자 정규형이다', () => {
    expect(plan({ sourceId: SOURCE_POST.toUpperCase() })).toEqual({ kind: 'read', destination: { kind: 'post', postId: SOURCE_POST, openAiReview: false } });
    expect(plan({ type: 'NOTICE', id: noti(5).toUpperCase() })).toEqual({ kind: 'read', destination: { kind: 'detail', notificationId: noti(5) } });
  });

  it('REQ-NOTI-004 제목·본문 문구는 분기에 쓰지 않는다', () => {
    const a = planRowTap({ ...base, title: '사진이 반려되었어요', body: '반려' } as typeof base);
    const b = planRowTap({ ...base, title: '아무 문구', body: '' } as typeof base);
    expect(a).toEqual(b);
  });

  it('page1 fixture의 모든 type이 표대로 나뉜다(승인 post, 반려·공지 detail, AI post+플래그)', () => {
    const kinds = fixtureItems('notifications__page1').map((item) => {
      const p = planRowTap(item);
      return p.kind === 'read' ? p.destination.kind + (p.destination.kind === 'post' && p.destination.openAiReview ? '+ai' : '') : p.kind;
    });
    expect(new Set(kinds)).toEqual(new Set(['post', 'detail', 'post+ai']));
    expect(kinds.slice(0, 5)).toEqual(['post', 'detail', 'post+ai', 'post+ai', 'detail']);
  });
});
