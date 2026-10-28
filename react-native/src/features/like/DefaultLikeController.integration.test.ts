import {
  createNetHarness,
  reauth,
  refreshOk,
  unauthorized,
} from '../../core/http/__testing__/createNetHarness';
import { networkFailure } from '../../core/http/__testing__/FakeTransport';
import { fixtureResponse } from '../../core/http/__testing__/loadFixture';
import { FakeToastPresenter } from '../../core/toast/__testing__/FakeToastPresenter';
import { LikeRepository } from '../../data/like/LikeRepository';
import { t } from '../../shared/copy';
import { FakeAuthFlowNavigator } from '../auth/__testing__/FakeAuthFlowNavigator';
import { DefaultLikeController } from './DefaultLikeController';
import { P1, settle } from './__testing__/createLikeHarness';

async function setup() {
  const net = createNetHarness();
  await net.signIn();
  const toast = new FakeToastPresenter();
  const authFlow = new FakeAuthFlowNavigator();
  const controller = new DefaultLikeController({
    api: new LikeRepository({ api: net.api }),
    toast,
    authFlow,
  });
  return { ...net, toast, authFlow, controller };
}

const start = { postId: P1, likeCount: 10, isLiked: false };

describe('DefaultLikeController + LikeRepository + ApiClient', () => {
  it('TC-LIKE-013 401 UNAUTHORIZED면 refresh 뒤 같은 요청을 1회 재전송해 성공한다', async () => {
    const h = await setup();
    h.transport.script(unauthorized(), refreshOk(), fixtureResponse('like/posts-likes-put__liked'));
    h.controller.toggle(start);
    await settle(200);
    expect(h.transport.requests.map((r) => r.method)).toEqual(['PUT', 'POST', 'PUT']);
    expect(h.controller.snapshot(P1)).toEqual({ postId: P1, likeCount: 11, isLiked: true });
    expect(h.toast.messages).toEqual([]);
  });

  it('TC-LIKE-013 재인증 필요면 롤백만 한다(로그인 이동은 session-expired 이벤트의 몫이라 화면은 부르지 않는다)', async () => {
    const h = await setup();
    h.transport.script(unauthorized(), reauth());
    h.controller.toggle(start);
    await settle(200);
    expect(h.controller.snapshot(P1)).toEqual(start);
    expect(h.authFlow.calls).toEqual([]);
    expect(h.toast.messages).toEqual([]);
  });

  it('TC-LIKE-026 500 두 번 뒤 200이면 토스트 없이 서버 값이 반영된다(0.5초, 1초 대기)', async () => {
    const h = await setup();
    h.transport.script(
      fixtureResponse('like/posts-likes-put__500-server-error'),
      fixtureResponse('like/posts-likes-put__500-server-error'),
      fixtureResponse('like/posts-likes-put__liked'),
    );
    h.controller.toggle(start);
    await settle(200);
    expect(h.sleeper.calls).toEqual([500, 1000]);
    expect(h.controller.snapshot(P1)).toEqual({ postId: P1, likeCount: 11, isLiked: true });
    expect(h.toast.messages).toEqual([]);
  });

  it('TC-LIKE-026 세 번 모두 실패하면 롤백하고 토스트를 띄운다', async () => {
    const h = await setup();
    h.transport.script(fixtureResponse('like/posts-likes-put__500-server-error'));
    h.controller.toggle(start);
    await settle(200);
    expect(h.transport.requests).toHaveLength(3);
    expect(h.controller.snapshot(P1)).toEqual(start);
    expect(h.toast.messages).toEqual([t('like.error.generic')]);
  });

  it('TC-LIKE-027 429 Retry-After: 1은 1초 기다린 뒤 재시도한다', async () => {
    const h = await setup();
    h.transport.script(
      fixtureResponse('like/posts-likes-put__429-retry-after'),
      fixtureResponse('like/posts-likes-put__liked'),
    );
    h.controller.toggle(start);
    await settle(200);
    expect(h.sleeper.calls).toEqual([1000]);
    expect(h.controller.snapshot(P1)).toMatchObject({ isLiked: true });
  });

  it('TC-LIKE-028 오프라인이면 낙관 반영 뒤 재시도 소진 시 롤백하고 토스트가 한 번 뜬다', async () => {
    const h = await setup();
    h.transport.script(networkFailure());
    h.controller.toggle(start);
    expect(h.controller.snapshot(P1)).toEqual({ postId: P1, likeCount: 11, isLiked: true });
    await settle(200);
    expect(h.controller.snapshot(P1)).toEqual(start);
    expect(h.toast.messages).toEqual([t('like.error.generic')]);
  });

  it('TC-LIKE-011 403 FORBIDDEN은 재시도 없이 정지 문구를 띄운다', async () => {
    const h = await setup();
    h.transport.script(fixtureResponse('like/posts-likes-put__403-banned'));
    h.controller.toggle(start);
    await settle(200);
    expect(h.transport.requests).toHaveLength(1);
    expect(h.toast.messages).toEqual([t('like.error.banned')]);
  });

  it('TC-LIKE-002 postId가 다른 응답은 계약 위반으로 보고 롤백한다', async () => {
    const h = await setup();
    h.transport.script(fixtureResponse('like/posts-likes-put__postid-mismatch'));
    h.controller.toggle(start);
    await settle(200);
    expect(h.controller.snapshot(P1)).toEqual(start);
    expect(h.toast.messages).toEqual([t('like.error.generic')]);
  });

  it('TC-LIKE-033 이미 좋아요한 글의 멱등 응답은 정상 성공이다', async () => {
    const h = await setup();
    h.transport.script(fixtureResponse('like/posts-likes-put__already-liked'));
    h.controller.toggle(start);
    await settle(200);
    expect(h.controller.snapshot(P1)).toEqual({ postId: P1, likeCount: 11, isLiked: true });
    expect(h.toast.messages).toEqual([]);
  });
});
