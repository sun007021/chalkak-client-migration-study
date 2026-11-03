import { HttpError, InvalidResponseError } from '../../core/http/ApiError';
import { createNetHarness } from '../../core/http/__testing__/createNetHarness';
import { json } from '../../core/http/__testing__/FakeTransport';
import { fixtureResponse } from '../../core/http/__testing__/loadFixture';
import { authorizationOf, pathOf } from '../__testing__/requestAsserts';
import { NotificationRepository } from './NotificationRepository';

const ID1 = '33333333-3333-4333-8333-333333333301';

async function setup() {
  const net = createNetHarness();
  await net.signIn();
  return { ...net, repository: new NotificationRepository({ api: net.api }) };
}

describe('NotificationRepository.list', () => {
  it('TC-NOTI-002 GET /notifications?page=1&pageSize=20을 인증 헤더와 함께 보낸다', async () => {
    const h = await setup();
    h.transport.script(fixtureResponse('notification/notifications__page1'));
    await h.repository.list(1);
    const [request] = h.transport.requests;
    expect(request.method).toBe('GET');
    expect(pathOf(request)).toBe('/notifications');
    expect(new URL(request.url).searchParams.get('page')).toBe('1');
    expect(new URL(request.url).searchParams.get('pageSize')).toBe('20');
    expect(authorizationOf(request)).toBe('Bearer access-1');
  });

  it('TC-NOTI-003 모든 필드를 읽고 null/생략 필드와 UTC Instant를 처리한다', async () => {
    const h = await setup();
    h.transport.script(fixtureResponse('notification/notifications__page1'));
    const page = await h.repository.list(1);
    expect(page).toMatchObject({ currentPage: 1, pageSize: 20, hasNext: true });
    expect(page.notifications).toHaveLength(20);
    expect(page.notifications[0]).toEqual({
      id: ID1,
      type: 'POST_APPROVED',
      sourceType: 'POST',
      sourceId: '22222222-2222-4222-8222-222222222201',
      title: '사진이 승인되었어요',
      body: '오늘의 사진이 전시에 올라갔어요.',
      thumbnailImageUrl:
        'https://cdn.example.test/posts/22222222-2222-4222-8222-222222222201/thumbnail.webp',
      readAt: null,
      createdAt: new Date('2026-10-27T01:30:00Z'),
    });
    expect(page.notifications[4].thumbnailImageUrl).toBeNull();
    expect(page.notifications[5].readAt).toEqual(new Date('2026-10-26T23:10:00Z'));
  });

  it('TC-NOTI-003 sourceType/sourceId 생략과 소수 초 Instant도 읽는다', async () => {
    const h = await setup();
    h.transport.script(
      json(200, {
        currentPage: 1,
        pageSize: 20,
        hasNext: false,
        notifications: [
          { id: ID1, type: 'NOTICE', title: 't', body: 'b', createdAt: '2026-10-27T01:30:00.123Z' },
        ],
      }),
    );
    const [item] = (await h.repository.list(1)).notifications;
    expect(item.sourceType).toBeNull();
    expect(item.sourceId).toBeNull();
    expect(item.thumbnailImageUrl).toBeNull();
    expect(item.createdAt).toEqual(new Date('2026-10-27T01:30:00.123Z'));
  });

  it('TC-NOTI-024 알 수 없는 type도 문자열 그대로 읽는다', async () => {
    const h = await setup();
    h.transport.script(fixtureResponse('notification/notifications__unknown-type'));
    const [item] = (await h.repository.list(1)).notifications;
    expect(item.type).toBe('FUTURE_TYPE');
  });

  it('TC-NOTI-023 서버가 준 항목을 날짜로 거르지 않는다', async () => {
    const h = await setup();
    h.transport.script(fixtureResponse('notification/notifications__30day-boundary'));
    expect((await h.repository.list(1)).notifications).toHaveLength(2);
  });

  it('TC-NOTI-008 필수 필드(title) 누락은 InvalidResponseError', async () => {
    const h = await setup();
    h.transport.script(fixtureResponse('notification/notifications__missing-fields'));
    await expect(h.repository.list(1)).rejects.toBeInstanceOf(InvalidResponseError);
  });

  it('TC-NOTI-008 깨진 JSON도 InvalidResponseError', async () => {
    const h = await setup();
    h.transport.script({
      status: 200,
      headers: { 'content-type': 'application/json' },
      bodyText: '{',
    });
    await expect(h.repository.list(1)).rejects.toBeInstanceOf(InvalidResponseError);
  });

  it('TC-NOTI-006 5xx는 재시도 뒤 HttpError', async () => {
    const h = await setup();
    h.transport.script(fixtureResponse('notification/notifications__internal-error'));
    await expect(h.repository.list(1)).rejects.toBeInstanceOf(HttpError);
    expect(h.transport.requests).toHaveLength(3);
  });
});

describe('NotificationRepository.getDetail', () => {
  it('TC-NOTI-042 반려 상세를 읽는다(원본 사진, 반려 사유)', async () => {
    const h = await setup();
    h.transport.script(fixtureResponse('notification/notification-detail__rejected'));
    const detail = await h.repository.getDetail('33333333-3333-4333-8333-333333333302');
    expect(pathOf(h.transport.requests[0])).toBe(
      '/notifications/33333333-3333-4333-8333-333333333302',
    );
    expect(detail).toMatchObject({
      type: 'POST_REJECTED',
      title: '사진이 반려되었어요',
      originalImageUrl: expect.stringContaining('original.webp'),
      rejectionReason: '다른 사람의 얼굴이 식별 가능하게 담겨 있어 전시할 수 없어요.',
      readAt: null,
      createdAt: new Date('2026-10-27T01:00:00Z'),
    });
  });

  it('TC-NOTI-044 공지 상세는 사진·반려 사유가 null이다', async () => {
    const h = await setup();
    h.transport.script(fixtureResponse('notification/notification-detail__notice'));
    const detail = await h.repository.getDetail('33333333-3333-4333-8333-333333333305');
    expect(detail.originalImageUrl).toBeNull();
    expect(detail.rejectionReason).toBeNull();
  });

  it('TC-NOTI-045 404는 HttpError(404)', async () => {
    const h = await setup();
    h.transport.script(fixtureResponse('notification/notification-detail__not-found'));
    await expect(
      h.repository.getDetail('33333333-3333-4333-8333-333333333399'),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('NotificationRepository.markRead', () => {
  it('TC-NOTI-027 PATCH /notifications/{id}/read를 본문 없이 보내고 204를 성공으로 읽는다', async () => {
    const h = await setup();
    h.transport.script(fixtureResponse('notification/notification-read__no-content'));
    await expect(h.repository.markRead(ID1)).resolves.toBeUndefined();
    const [request] = h.transport.requests;
    expect(request.method).toBe('PATCH');
    expect(pathOf(request)).toBe(`/notifications/${ID1}/read`);
    expect(request.body).toBeUndefined();
    expect(authorizationOf(request)).toBe('Bearer access-1');
  });

  it('TC-NOTI-033 404는 HttpError(404)로 던진다', async () => {
    const h = await setup();
    h.transport.script(fixtureResponse('notification/notification-read__not-found'));
    await expect(h.repository.markRead(ID1)).rejects.toMatchObject({ status: 404 });
  });

  it('REQ-NOTI-013 read-all(PATCH /notifications/read-all)은 어떤 메서드로도 부르지 않는다', () => {
    expect(Object.getOwnPropertyNames(NotificationRepository.prototype)).not.toContain(
      'markAllRead',
    );
  });
});
