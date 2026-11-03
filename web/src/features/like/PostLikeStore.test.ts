import { t } from '../../copy/ko';
import { createLikeServer } from '../../test/likeServer';
import { finish, settle } from '../../test/homeHarness';
import { json } from '../../test/fixtureRouter';
import { createPostHarness } from '../../test/postHarness';
import type { PostHarness } from '../../test/postHarness';
import { MINE, OTHER, likeBody, likeKey } from '../../test/postRoutes';
import type { LikeTarget, PostChange } from '../post/postModels';

const GENERIC = t('like.error.generic');
const BANNED = t('like.error.banned');

/** 하트를 누른 화면이 보여 주던 값. */
const target = (id: string, isLiked: boolean, likeCount: number): LikeTarget => ({ id, isLiked, likeCount });

function setup(overrides: Parameters<typeof createPostHarness>[0] = {}) {
  const h = createPostHarness({ bare: true, ...overrides });
  const events: PostChange[] = [];
  h.changes.subscribe((change) => events.push(change));
  const likeEvents = () => events.filter((e): e is Extract<PostChange, { type: 'like' }> => e.type === 'like').map((e) => [e.isLiked, e.likeCount]);
  return { h, events, likeEvents };
}

/** 하트를 누르고(낙관 반영은 동기) 요청이 서버에 도착할 때까지 기다린다. */
async function tap(h: PostHarness, base: LikeTarget): Promise<{ done: Promise<void> }> {
  const done = h.likes.toggle(base);
  await settle();
  return { done }; // async 함수가 약속을 돌려주면 끝날 때까지 기다리게 되므로 객체로 감싼다
}

describe('PostLikeStore 낙관적 갱신 (D-04, REQ-LIKE-001, 002)', () => {
  it('TC-LIKE-003 TC-LIKE-032 하트를 누르면 응답을 기다리지 않고 즉시 isLiked=true, likeCount+1이다(내 게시물도 같다)', async () => {
    const { h, likeEvents } = setup();
    const server = createLikeServer(h, MINE);
    const done = h.likes.toggle(target(MINE, false, 10));
    expect(h.likes.current(MINE)).toEqual({ isLiked: true, likeCount: 11 });
    expect(h.likes.isPending(MINE)).toBe(true);
    expect(likeEvents()).toEqual([[true, 11]]);
    await settle();
    expect(h.ff.calls).toHaveLength(1);
    expect(h.ff.calls[0]).toMatchObject({ method: 'PUT', path: `/posts/${MINE}/likes`, body: null });
    expect(h.ff.calls[0]!.headers['authorization']).toBe('Bearer fixture-access-token-1');
    await server.succeed();
    await done;
    expect(h.likes.isPending(MINE)).toBe(false);
  });

  it('TC-LIKE-007 좋아요한 사진을 다시 누르면 즉시 isLiked=false, likeCount-1이고 DELETE를 보낸다', async () => {
    const { h, likeEvents } = setup();
    const server = createLikeServer(h, MINE, { isLiked: true, likeCount: 11 });
    const { done } = await tap(h, target(MINE, true, 11));
    expect(h.likes.current(MINE)).toEqual({ isLiked: false, likeCount: 10 });
    expect(server.methods).toEqual(['DELETE']);
    await server.succeed();
    await done;
    expect(likeEvents()).toEqual([
      [false, 10],
      [false, 10],
    ]);
  });

  it('TC-LIKE-007 likeCount는 0 아래로 내려가지 않는다', async () => {
    const { h } = setup();
    createLikeServer(h, MINE, { isLiked: true, likeCount: 0 });
    h.likes.toggle(target(MINE, true, 0));
    expect(h.likes.current(MINE)).toEqual({ isLiked: false, likeCount: 0 });
  });

  it('TC-LIKE-002 성공 응답의 값이 확정 값으로 이벤트에 실린다', async () => {
    const { h, likeEvents } = setup();
    const server = createLikeServer(h, MINE);
    const { done } = await tap(h, target(MINE, false, 10));
    await server.succeed();
    await done;
    expect(likeEvents()).toEqual([
      [true, 11],
      [true, 11],
    ]);
    expect(h.likes.current(MINE)).toEqual({ isLiked: true, likeCount: 11 });
    expect(h.toasts.messages).toEqual([]);
  });

  it('TC-LIKE-008 응답의 likeCount가 낙관 값과 다르면(다른 사용자의 동시 좋아요) 서버 값으로 덮어쓴다', async () => {
    const { h, likeEvents } = setup({ routes: { [likeKey('PUT', MINE)]: 'like/posts-likes-put__liked-count-differs' } });
    await h.likes.toggle(target(MINE, false, 10));
    await settle();
    expect(h.likes.current(MINE)).toEqual({ isLiked: true, likeCount: 13 });
    expect(likeEvents()).toEqual([
      [true, 11],
      [true, 13],
    ]);
  });

  it('TC-LIKE-033 L1 이미 좋아요한 글(화면은 몰랐음)의 PUT 응답은 개수를 늘리지 않은 멱등 성공으로 반영한다', async () => {
    const { h } = setup({ routes: { [likeKey('PUT', MINE)]: 'like/posts-likes-put__already-liked' } });
    await h.likes.toggle(target(MINE, false, 11));
    await settle();
    expect(h.likes.current(MINE)).toEqual({ isLiked: true, likeCount: 11 });
    expect(h.toasts.messages).toEqual([]);
  });

  it('TC-LIKE-033 L2 좋아요 안 한 글의 DELETE도 isLiked=false로 정상이다', async () => {
    const { h } = setup({ routes: { [likeKey('DELETE', MINE)]: 'like/posts-likes-delete__not-liked' } });
    await h.likes.toggle(target(MINE, true, 11));
    await settle();
    expect(h.likes.current(MINE)).toEqual({ isLiked: false, likeCount: 10 });
    expect(h.toasts.messages).toEqual([]);
  });

  it('활동이 없던 게시물은 current가 undefined다', () => {
    const { h } = setup();
    expect(h.likes.current(MINE)).toBeUndefined();
    expect(h.likes.isPending(MINE)).toBe(false);
  });
});

describe('PostLikeStore 실패 처리 (REQ-LIKE-004, 006, 007)', () => {
  it('TC-LIKE-009 REQ-LIKE-004 요청이 실패하면 이전 상태로 되돌리고 토스트 "좋아요를 반영하지 못했어요"를 한 번 띄운다', async () => {
    const { h, likeEvents } = setup();
    const server = createLikeServer(h, MINE);
    const { done } = await tap(h, target(MINE, false, 10));
    await server.invalid();
    await done;
    expect(h.likes.current(MINE)).toEqual({ isLiked: false, likeCount: 10 });
    expect(likeEvents()).toEqual([
      [true, 11],
      [false, 10],
    ]);
    expect(h.toasts.messages).toEqual([GENERIC]);
    expect(h.ff.calls).toHaveLength(1);
  });

  it('TC-LIKE-009 취소(DELETE) 실패도 좋아요 상태로 되돌린다', async () => {
    const { h } = setup();
    const server = createLikeServer(h, MINE, { isLiked: true, likeCount: 11 });
    const { done } = await tap(h, target(MINE, true, 11));
    await server.invalid();
    await done;
    expect(h.likes.current(MINE)).toEqual({ isLiked: true, likeCount: 11 });
    expect(h.toasts.messages).toEqual([GENERIC]);
  });

  it('TC-LIKE-009 500은 재시도(0.5초·1초)를 모두 거친 뒤에야 롤백한다', async () => {
    const { h } = setup({ routes: { [likeKey('PUT', MINE)]: 'like/posts-likes-put__500-server-error' } });
    const done = h.likes.toggle(target(MINE, false, 10));
    await settle();
    expect(h.likes.current(MINE)).toEqual({ isLiked: true, likeCount: 11 });
    await h.clock.advance(500);
    expect(h.likes.current(MINE)).toEqual({ isLiked: true, likeCount: 11 });
    expect(h.toasts.messages).toEqual([]);
    await finish(h, done);
    expect(h.ff.calls).toHaveLength(3);
    expect(h.likes.current(MINE)).toEqual({ isLiked: false, likeCount: 10 });
    expect(h.toasts.messages).toEqual([GENERIC]);
  });

  it('TC-LIKE-026 REQ-LIKE-012 500 두 번 뒤 200이면 토스트 없이 서버 값이 반영된다', async () => {
    const { h } = setup({
      routes: { [likeKey('PUT', MINE)]: ['like/posts-likes-put__500-server-error', 'like/posts-likes-put__500-server-error', 'like/posts-likes-put__liked'] },
    });
    await finish(h, h.likes.toggle(target(MINE, false, 10)));
    expect(h.ff.calls).toHaveLength(3);
    expect(h.likes.current(MINE)).toEqual({ isLiked: true, likeCount: 11 });
    expect(h.toasts.messages).toEqual([]);
  });

  it('TC-LIKE-028 오프라인이면 낙관 반영 후 재시도를 소진하고 롤백 + 토스트가 한 번 뜬다', async () => {
    const { h, likeEvents } = setup({ routes: { [likeKey('PUT', MINE)]: () => Promise.reject(new TypeError('Failed to fetch')) } });
    await finish(h, h.likes.toggle(target(MINE, false, 10)));
    expect(likeEvents()).toEqual([
      [true, 11],
      [false, 10],
    ]);
    expect(h.toasts.messages).toEqual([GENERIC]);
  });

  it('TC-LIKE-010 REQ-LIKE-006 404면 되돌린 뒤 removed 이벤트를 알리고 토스트를 띄운다(재시도 없음)', async () => {
    const { h, events } = setup({ routes: { [likeKey('PUT', MINE)]: 'like/posts-likes-put__404-not-found' } });
    await h.likes.toggle(target(MINE, false, 10));
    await settle();
    expect(h.likes.current(MINE)).toEqual({ isLiked: false, likeCount: 10 });
    expect(events.map((e) => e.type)).toEqual(['like', 'like', 'removed']);
    expect(events[2]).toEqual({ type: 'removed', postId: MINE });
    expect(h.changes.wasRemoved(MINE)).toBe(true);
    expect(h.toasts.messages).toEqual([GENERIC]);
    expect(h.ff.calls).toHaveLength(1);
  });

  it('TC-LIKE-010 취소(DELETE)가 404여도 같다', async () => {
    const { h, events } = setup({ routes: { [likeKey('DELETE', MINE)]: 'like/posts-likes-put__404-not-found' } });
    await h.likes.toggle(target(MINE, true, 11));
    await settle();
    expect(events.at(-1)).toEqual({ type: 'removed', postId: MINE });
    expect(h.toasts.messages).toEqual([GENERIC]);
  });

  it('TC-LIKE-011 REQ-LIKE-007 D-08 등록(PUT) 403이면 되돌리고 "이용이 제한되어 좋아요를 누를 수 없어요."를 띄우며 같은 요청을 다시 보내지 않는다', async () => {
    const { h } = setup({ routes: { [likeKey('PUT', MINE)]: 'like/posts-likes-put__403-banned' } });
    await finish(h, h.likes.toggle(target(MINE, false, 10)));
    await h.clock.advance(10_000);
    expect(h.likes.current(MINE)).toEqual({ isLiked: false, likeCount: 10 });
    expect(h.toasts.messages).toEqual([BANNED]);
    expect(h.ff.calls).toHaveLength(1);
  });

  it('TC-LIKE-011 403 뒤에 사용자가 다시 누르는 것은 새 시도다(요청 1건)', async () => {
    const { h } = setup({ routes: { [likeKey('PUT', MINE)]: 'like/posts-likes-put__403-banned' } });
    await finish(h, h.likes.toggle(target(MINE, false, 10)));
    await finish(h, h.likes.toggle(target(MINE, false, 10)));
    expect(h.ff.calls).toHaveLength(2);
    expect(h.toasts.messages).toEqual([BANNED, BANNED]);
  });

  it('TC-LIKE-012 L3 정지 회원도 취소(DELETE)는 보낼 수 있고 정상 취소된다', async () => {
    const { h } = setup({ routes: { [likeKey('DELETE', MINE)]: 'like/posts-likes-delete__unliked' } });
    await finish(h, h.likes.toggle(target(MINE, true, 11)));
    expect(h.likes.current(MINE)).toEqual({ isLiked: false, likeCount: 10 });
    expect(h.toasts.messages).toEqual([]);
  });

  it('TC-LIKE-002 응답 postId가 다르거나 PUT 응답이 isLiked=false이면 계약 위반으로 롤백한다', async () => {
    const mismatch = setup({ routes: { [likeKey('PUT', MINE)]: 'like/posts-likes-put__postid-mismatch' } });
    await finish(mismatch.h, mismatch.h.likes.toggle(target(MINE, false, 10)));
    expect(mismatch.h.likes.current(MINE)).toEqual({ isLiked: false, likeCount: 10 });
    expect(mismatch.h.toasts.messages).toEqual([GENERIC]);
    const inconsistent = setup({ routes: { [likeKey('PUT', MINE)]: 'like/posts-likes-put__inconsistent-state' } });
    await finish(inconsistent.h, inconsistent.h.likes.toggle(target(MINE, false, 10)));
    expect(inconsistent.h.likes.current(MINE)).toEqual({ isLiked: false, likeCount: 10 });
    expect(inconsistent.h.toasts.messages).toEqual([GENERIC]);
  });

  it('TC-LIKE-013 D-17 401이면 refresh 1회 뒤 같은 요청이 한 번 더 나가 성공하고 토스트는 없다', async () => {
    const { h } = setup({
      routes: {
        [likeKey('PUT', MINE)]: ['like/posts-likes-put__401-unauthorized', 'like/posts-likes-put__liked'],
        'POST /auth/refresh': 'auth/refresh__success',
      },
    });
    await finish(h, h.likes.toggle(target(MINE, false, 10)));
    expect(h.ff.callsTo('POST /auth/refresh')).toHaveLength(1);
    expect(h.ff.callsTo(`PUT /posts/${MINE}/likes`)).toHaveLength(2);
    expect(h.likes.current(MINE)).toEqual({ isLiked: true, likeCount: 11 });
    expect(h.toasts.messages).toEqual([]);
  });

  it('TC-LIKE-013 재인증이 필요하면(refresh 거절) 낙관 반영을 되돌린다', async () => {
    const { h } = setup({
      routes: {
        [likeKey('PUT', MINE)]: 'like/posts-likes-put__401-unauthorized',
        'POST /auth/refresh': 'auth/refresh__reauthentication-required',
      },
    });
    await finish(h, h.likes.toggle(target(MINE, false, 10)));
    expect(h.likes.current(MINE)).toEqual({ isLiked: false, likeCount: 10 });
  });
});

describe('PostLikeStore 연타 직렬화 (REQ-LIKE-005)', () => {
  it('TC-LIKE-015 TC-LIKE-018 PUT 진행 중 on·off·on 연타는 요청을 쌓지 않고 PUT 1회로 끝나며 최종 isLiked=true다', async () => {
    const { h } = setup();
    const server = createLikeServer(h, MINE);
    const { done: first } = await tap(h, target(MINE, false, 10)); // on
    const second = h.likes.toggle(target(MINE, true, 11)); // off
    expect(h.likes.current(MINE)).toEqual({ isLiked: false, likeCount: 10 });
    const third = h.likes.toggle(target(MINE, false, 10)); // on
    expect(h.likes.current(MINE)).toEqual({ isLiked: true, likeCount: 11 });
    await settle();
    expect(server.methods).toEqual(['PUT']);
    expect(server.inFlight).toBe(1);
    await server.succeed();
    await Promise.all([first, second, third]);
    expect(server.methods).toEqual(['PUT']);
    expect(h.likes.current(MINE)).toEqual({ isLiked: true, likeCount: 11 });
    expect(server.state).toEqual({ isLiked: true, likeCount: 11 });
  });

  it('TC-LIKE-016 on·off 2회 연타: PUT 응답 뒤 최종 의도(off)와 서버 상태(on)가 달라 DELETE를 1회 더 보내 총 2회이고 최종 isLiked=false다', async () => {
    const { h } = setup();
    const server = createLikeServer(h, MINE);
    const { done: first } = await tap(h, target(MINE, false, 10));
    const second = h.likes.toggle(target(MINE, true, 11));
    await settle();
    await server.succeed(); // PUT 응답: liked 11
    expect(h.likes.current(MINE)).toEqual({ isLiked: false, likeCount: 10 }); // 의도(off)가 유지된다
    expect(server.methods).toEqual(['PUT', 'DELETE']);
    expect(server.inFlight).toBe(1);
    await server.succeed();
    await Promise.all([first, second]);
    expect(server.methods).toEqual(['PUT', 'DELETE']);
    expect(h.likes.current(MINE)).toEqual({ isLiked: false, likeCount: 10 });
    expect(server.state).toEqual({ isLiked: false, likeCount: 10 });
    expect(h.toasts.messages).toEqual([]);
  });

  it('TC-LIKE-016 첫 응답의 likeCount가 낙관 값과 달라도 마지막 의도는 응답 개수 기준으로 보여 준다', async () => {
    const { h } = setup();
    const server = createLikeServer(h, MINE, { isLiked: false, likeCount: 10 });
    const { done: first } = await tap(h, target(MINE, false, 10));
    const second = h.likes.toggle(target(MINE, true, 11));
    server.state.likeCount = 12; // 다른 사용자가 먼저 좋아요를 눌렀다
    await server.succeed(); // PUT 응답: liked 13
    expect(h.likes.current(MINE)).toEqual({ isLiked: false, likeCount: 12 });
    await server.succeed();
    await Promise.all([first, second]);
    expect(h.likes.current(MINE)).toEqual({ isLiked: false, likeCount: 12 });
  });

  it('TC-LIKE-018 PUT 진행 중 같은 의도로 또 눌러도 중복 요청이 나가지 않는다', async () => {
    const { h } = setup();
    const server = createLikeServer(h, MINE);
    const { done: first } = await tap(h, target(MINE, false, 10));
    const again = h.likes.toggle(target(MINE, true, 11)); // off
    const back = h.likes.toggle(target(MINE, false, 10)); // on
    await settle();
    expect(server.requests).toHaveLength(1);
    await server.succeed();
    await Promise.all([first, again, back]);
    expect(server.requests).toHaveLength(1);
  });

  it('TC-LIKE-019 서로 다른 두 사진은 독립적으로 병렬 요청되고 한쪽 실패가 다른 쪽을 되돌리지 않는다', async () => {
    const { h } = setup();
    const a = createLikeServer(h, MINE);
    const b = createLikeServer(h, OTHER, { isLiked: false, likeCount: 38 });
    const { done: doneA } = await tap(h, target(MINE, false, 10));
    const { done: doneB } = await tap(h, target(OTHER, false, 38));
    expect(a.inFlight).toBe(1);
    expect(b.inFlight).toBe(1);
    await a.invalid();
    await b.succeed();
    await Promise.all([doneA, doneB]);
    expect(h.likes.current(MINE)).toEqual({ isLiked: false, likeCount: 10 });
    expect(h.likes.current(OTHER)).toEqual({ isLiked: true, likeCount: 39 });
    expect(h.toasts.messages).toEqual([GENERIC]);
  });

  it('TC-LIKE-020 PUT 진행 중 다시 눌러 의도=off인데 PUT이 실패하면 롤백 결과가 이미 의도와 같아 추가 요청 없이 토스트만 띄운다', async () => {
    const { h } = setup();
    const server = createLikeServer(h, MINE);
    const { done: first } = await tap(h, target(MINE, false, 10));
    const second = h.likes.toggle(target(MINE, true, 11));
    await server.invalid();
    await Promise.all([first, second]);
    await h.clock.advance(5_000);
    expect(server.requests).toHaveLength(1);
    expect(h.likes.current(MINE)).toEqual({ isLiked: false, likeCount: 10 });
    expect(h.toasts.messages).toEqual([GENERIC]);
  });

  it('TC-LIKE-022 실패한 요청의 롤백이 새 동작을 되돌리지 않는다: on 실패 응답이 오기 전에 off를 눌렀다면 결과는 off 한 번뿐이다', async () => {
    const { h, likeEvents } = setup();
    const server = createLikeServer(h, MINE);
    const { done: first } = await tap(h, target(MINE, false, 10));
    const second = h.likes.toggle(target(MINE, true, 11));
    await server.invalid();
    await Promise.all([first, second]);
    expect(likeEvents().at(-1)).toEqual([false, 10]);
    expect(likeEvents().filter(([liked]) => liked).length).toBe(1); // on은 처음 낙관 반영 한 번뿐이다
    expect(server.requests).toHaveLength(1);
  });

  it('TC-LIKE-017 임의 탭 순서(길이 1~9)와 응답 순서에서도 동시 진행 요청은 1개 이하이고 최종 서버 상태가 마지막 의도와 같다', async () => {
    let seed = 20_261_027;
    const random = () => {
      seed = (seed * 1_664_525 + 1_013_904_223) % 4_294_967_296;
      return seed / 4_294_967_296;
    };
    for (let round = 0; round < 40; round += 1) {
      const startLiked = random() < 0.5;
      const { h } = setup();
      const server = createLikeServer(h, MINE, { isLiked: startLiked, likeCount: startLiked ? 11 : 10 });
      const taps = 1 + Math.floor(random() * 9);
      let intent = startLiked;
      const done: Promise<void>[] = [];
      for (let i = 0; i < taps; i += 1) {
        const shown = h.likes.current(MINE) ?? { isLiked: startLiked, likeCount: startLiked ? 11 : 10 };
        done.push(h.likes.toggle(target(MINE, shown.isLiked, shown.likeCount)));
        intent = !intent;
        await settle();
        if (server.inFlight > 0 && random() < 0.5) await server.succeed();
      }
      while (server.inFlight > 0) await server.succeed();
      await Promise.all(done);
      expect(server.maxInFlight, `round ${round}`).toBeLessThanOrEqual(1);
      expect(server.state.isLiked, `round ${round} taps ${taps}`).toBe(intent);
      expect(h.likes.current(MINE)?.isLiked, `round ${round}`).toBe(intent);
      expect(h.likes.current(MINE)?.likeCount, `round ${round}`).toBe(server.state.likeCount);
      expect(h.likes.isPending(MINE)).toBe(false);
    }
  });
});

describe('PostLikeStore 읽기 응답 병합 (REQ-LIKE-009, REQ-FEED-008)', () => {
  const stale = [target(MINE, false, 10), target(OTHER, false, 38)];

  it('TC-LIKE-021 좋아요가 끝난 뒤 도착한 이전 읽기 응답은 완료된 좋아요 상태를 덮어쓰지 않는다', async () => {
    const { h } = setup();
    const server = createLikeServer(h, MINE);
    const stamp = h.likes.beginRead();
    const { done } = await tap(h, target(MINE, false, 10));
    await server.succeed();
    await done;
    expect(h.likes.merge(stale, stamp)).toEqual([target(MINE, true, 11), target(OTHER, false, 38)]);
  });

  it('TC-LIKE-021 진행 중인 낙관 상태도 덮어쓰지 않는다', async () => {
    const { h } = setup();
    createLikeServer(h, MINE);
    const stamp = h.likes.beginRead();
    await tap(h, target(MINE, false, 10));
    expect(h.likes.merge(stale, stamp)[0]).toEqual(target(MINE, true, 11));
  });

  it('TC-LIKE-021 읽기를 시작하기 전에 끝난 좋아요는 더 새로운 읽기 응답이 이긴다(다른 사용자의 좋아요 반영)', async () => {
    const { h } = setup();
    const server = createLikeServer(h, MINE);
    const { done } = await tap(h, target(MINE, false, 10));
    await server.succeed();
    await done;
    const stamp = h.likes.beginRead();
    const fresh = [target(MINE, true, 15)];
    expect(h.likes.merge(fresh, stamp)).toEqual(fresh);
  });

  it('TC-LIKE-021 롤백도 읽기 이후의 변경이므로 보정한다(실패해 되돌린 값이 낡은 읽기 값으로 바뀌지 않는다)', async () => {
    const { h } = setup();
    const server = createLikeServer(h, MINE);
    const stamp = h.likes.beginRead();
    const { done } = await tap(h, target(MINE, false, 10));
    await server.invalid();
    await done;
    expect(h.likes.merge([target(MINE, true, 99)], stamp)).toEqual([target(MINE, false, 10)]);
  });

  it('좋아요 활동이 없는 게시물은 응답 값 그대로이고 입력 배열을 바꾸지 않는다', () => {
    const { h } = setup();
    const stamp = h.likes.beginRead();
    const items = [target(MINE, true, 3)];
    const merged = h.likes.merge(items, stamp);
    expect(merged).toEqual(items);
    expect(items).toEqual([target(MINE, true, 3)]);
  });

  it('merge는 좋아요 값만 바꾸고 항목의 다른 필드는 유지한다', async () => {
    const { h } = setup();
    createLikeServer(h, MINE);
    const stamp = h.likes.beginRead();
    await tap(h, target(MINE, false, 10));
    const [merged] = h.likes.merge([{ ...target(MINE, false, 10), title: '비 오는 날', isMine: true }], stamp);
    expect(merged).toEqual({ id: MINE, title: '비 오는 날', isMine: true, isLiked: true, likeCount: 11 });
  });

  it('beginRead 표시는 활동이 있을 때마다 커진다', async () => {
    const { h } = setup();
    createLikeServer(h, MINE);
    const before = h.likes.beginRead();
    await tap(h, target(MINE, false, 10));
    expect(h.likes.beginRead()).toBeGreaterThan(before);
  });
});

describe('PostLikeStore 화면 이탈·계정 전환 (D-17, D-20)', () => {
  it('TC-LIKE-029 화면이 보이지 않는 동안 도착한 실패는 상태(롤백)는 반영하되 토스트는 띄우지 않는다', async () => {
    const { h, likeEvents } = setup();
    const server = createLikeServer(h, MINE);
    const { done } = await tap(h, target(MINE, false, 10));
    h.toast.setVisible(false);
    await server.invalid();
    await done;
    expect(likeEvents().at(-1)).toEqual([false, 10]);
    expect(h.likes.current(MINE)).toEqual({ isLiked: false, likeCount: 10 });
    expect(h.toasts.messages).toEqual([]);
  });

  it('TC-LIKE-029 화면이 보이지 않는 동안 도착한 성공도 캐시(상태)에 반영된다', async () => {
    const { h } = setup();
    const server = createLikeServer(h, MINE);
    const { done } = await tap(h, target(MINE, false, 10));
    h.toast.setVisible(false);
    await server.succeed();
    await done;
    expect(h.likes.current(MINE)).toEqual({ isLiked: true, likeCount: 11 });
  });

  it('TC-LIKE-030 서로 다른 두 사진이 연달아 실패하면 같은 문구 토스트가 두 번 모두 표시된다(메시지 고유 ID)', async () => {
    const { h } = setup();
    const a = createLikeServer(h, MINE);
    const b = createLikeServer(h, OTHER, { isLiked: false, likeCount: 38 });
    const { done: doneA } = await tap(h, target(MINE, false, 10));
    const { done: doneB } = await tap(h, target(OTHER, false, 38));
    await a.invalid();
    await b.invalid();
    await Promise.all([doneA, doneB]);
    expect(h.toasts.messages).toEqual([GENERIC, GENERIC]);
  });

  it('TC-LIKE-031 A의 좋아요 응답이 진행 중일 때 reset(계정 전환)하면 A의 응답은 무시되고 아무 이벤트·토스트도 없다', async () => {
    const { h, events } = setup();
    const server = createLikeServer(h, MINE);
    const { done } = await tap(h, target(MINE, false, 10));
    const before = events.length;
    h.likes.reset();
    expect(h.likes.current(MINE)).toBeUndefined();
    expect(h.likes.isPending(MINE)).toBe(false);
    await server.succeed();
    await done;
    expect(events).toHaveLength(before);
    expect(h.likes.current(MINE)).toBeUndefined();
    expect(h.toasts.messages).toEqual([]);
  });

  it('TC-LIKE-031 reset 뒤에는 새 계정의 값으로 처음부터 시작하고 이전 요청이 남아 있어도 직렬화에 영향이 없다', async () => {
    const { h } = setup();
    const server = createLikeServer(h, MINE);
    await tap(h, target(MINE, false, 10)); // 계정 A: 응답 대기
    h.likes.reset();
    const { done } = await tap(h, target(MINE, true, 40)); // 계정 B: 같은 게시물, 다른 값
    expect(h.likes.current(MINE)).toEqual({ isLiked: false, likeCount: 39 });
    expect(server.methods).toEqual(['PUT', 'DELETE']); // B의 요청은 A의 응답을 기다리지 않고 나간다
    await server.respondWith(json(200, likeBody(MINE, 11, true))); // A의 늦은 응답
    expect(h.likes.current(MINE)).toEqual({ isLiked: false, likeCount: 39 });
    await server.respondWith(json(200, likeBody(MINE, 39, false)));
    await done;
    expect(h.likes.current(MINE)).toEqual({ isLiked: false, likeCount: 39 });
  });
});
