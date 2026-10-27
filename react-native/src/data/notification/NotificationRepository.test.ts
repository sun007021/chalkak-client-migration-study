import { HttpError, InvalidResponseError } from '../../core/http/ApiError';
import { createNetHarness } from '../../core/http/__testing__/createNetHarness';
import { json } from '../../core/http/__testing__/FakeTransport';
import { fixtureResponse } from '../../core/http/__testing__/loadFixture';
import { authorizationOf, pathOf } from '../__testing__/requestAsserts';
import { NotificationRepository } from './NotificationRepository';

async function setup() {
  const net = createNetHarness();
  await net.signIn();
  return { ...net, repository: new NotificationRepository({ api: net.api }) };
}

describe('NotificationRepository.hasUnread', () => {
  it('TC-HOME-050 GET /notifications/unread-status를 토큰과 함께 부르고 hasUnread를 돌려준다', async () => {
    const h = await setup();
    h.transport.script(fixtureResponse('home/notifications-unread-status__true'));
    await expect(h.repository.hasUnread()).resolves.toBe(true);

    const [request] = h.transport.requests;
    expect(request.method).toBe('GET');
    expect(pathOf(request)).toBe('/notifications/unread-status');
    expect(authorizationOf(request)).toBe('Bearer access-1');

    h.transport.script(fixtureResponse('home/notifications-unread-status__false'));
    await expect(h.repository.hasUnread()).resolves.toBe(false);
  });

  it('TC-HOME-052 5xx는 재시도 뒤 HttpError를 던진다(무시 여부는 ViewModel이 정한다)', async () => {
    const h = await setup();
    h.transport.script(fixtureResponse('home/notifications-unread-status__500-server-error'));
    await expect(h.repository.hasUnread()).rejects.toBeInstanceOf(HttpError);
    expect(h.transport.requests).toHaveLength(3);
  });

  it('TC-NET-010 hasUnread가 없거나 boolean이 아니면 InvalidResponseError', async () => {
    const h = await setup();
    h.transport.script(json(200, {}));
    await expect(h.repository.hasUnread()).rejects.toBeInstanceOf(InvalidResponseError);
    h.transport.script(json(200, { hasUnread: 'yes' }));
    await expect(h.repository.hasUnread()).rejects.toBeInstanceOf(InvalidResponseError);
  });
});
