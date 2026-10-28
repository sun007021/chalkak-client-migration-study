import { HttpError, NetworkError, ReauthenticationRequiredError } from '../../core/http/ApiError';
import { t } from '../../shared/copy';
import { createLikeHarness, P1, P2, settle } from './__testing__/createLikeHarness';

const snap = (postId: string, likeCount: number, isLiked: boolean) => ({
  postId,
  likeCount,
  isLiked,
});
const updated = (postId: string, likeCount: number, isLiked: boolean) => ({
  kind: 'updated',
  snapshot: snap(postId, likeCount, isLiked),
});
const server500 = () => new HttpError(500, 'INTERNAL_ERROR', null);

describe('DefaultLikeController 낙관적 갱신', () => {
  it('TC-LIKE-003 TC-LIKE-006 탭하면 응답 전에 즉시 isLiked=true, likeCount+1을 알린다', async () => {
    const h = createLikeHarness();
    h.controller.toggle(snap(P1, 10, false));
    expect(h.events).toEqual([updated(P1, 11, true)]);
    expect(h.controller.snapshot(P1)).toEqual(snap(P1, 11, true));
    expect(h.api.calls.map((c) => c.kind)).toEqual(['like']);
  });

  it('TC-LIKE-007 좋아요한 사진을 다시 탭하면 즉시 isLiked=false, likeCount-1', async () => {
    const h = createLikeHarness();
    h.controller.toggle(snap(P1, 10, true));
    expect(h.events).toEqual([updated(P1, 9, false)]);
    expect(h.api.calls.map((c) => c.kind)).toEqual(['unlike']);
  });

  it('TC-LIKE-007 likeCount는 0 아래로 내려가지 않는다', async () => {
    const h = createLikeHarness();
    h.controller.toggle(snap(P1, 0, true));
    expect(h.events).toEqual([updated(P1, 0, false)]);
  });

  it('TC-LIKE-008 성공 응답의 likeCount·isLiked가 낙관 값과 다르면 서버 값으로 덮어쓴다', async () => {
    const h = createLikeHarness();
    h.api.setServer(P1, 10, false);
    h.controller.toggle(snap(P1, 10, false));
    h.api.succeed(0, { likeCount: 13 });
    await settle();
    expect(h.events.at(-1)).toEqual(updated(P1, 13, true));
    expect(h.controller.snapshot(P1)).toEqual(snap(P1, 13, true));
  });

  it('TC-LIKE-032 내 게시물도 똑같이 처리한다(컨트롤러는 작성자를 구분하지 않는다)', async () => {
    const h = createLikeHarness();
    h.controller.toggle(snap(P1, 10, false));
    h.api.succeed(0);
    await settle();
    expect(h.controller.snapshot(P1)).toEqual(snap(P1, 11, true));
    expect(h.toast.messages).toEqual([]);
  });

  it('TC-LIKE-004 TC-LIKE-025 같은 컨트롤러를 구독하는 모든 화면이 같은 이벤트를 받는다(화면 간 동기)', async () => {
    const h = createLikeHarness();
    const other: unknown[] = [];
    const stop = h.controller.subscribe((c) => other.push(c));
    h.controller.toggle(snap(P1, 10, false));
    h.api.succeed(0);
    await settle();
    expect(other).toEqual(h.events);
    stop();
    h.controller.toggle(snap(P1, 11, true));
    expect(other.length).toBeLessThan(h.events.length);
  });
});

describe('DefaultLikeController 실패와 롤백', () => {
  it.each([
    ['500', server500()],
    ['연결 실패', new NetworkError('offline')],
  ])('TC-LIKE-009 %s이면 이전 상태로 되돌리고 토스트를 한 번 띄운다', async (_name, error) => {
    const h = createLikeHarness();
    h.controller.toggle(snap(P1, 10, false));
    h.api.fail(0, error);
    await settle();
    expect(h.events).toEqual([updated(P1, 11, true), updated(P1, 10, false)]);
    expect(h.controller.snapshot(P1)).toEqual(snap(P1, 10, false));
    expect(h.toast.messages).toEqual([t('like.error.generic')]);
  });

  it('TC-LIKE-010 404이면 롤백 뒤 게시물을 목록에서 빼도록 removed를 알리고 토스트를 띄운다', async () => {
    const h = createLikeHarness();
    h.controller.toggle(snap(P1, 10, false));
    h.api.fail(0, new HttpError(404, 'BUSINESS_ERROR', '게시물을 찾을 수 없습니다.'));
    await settle();
    expect(h.events).toEqual([
      updated(P1, 11, true),
      updated(P1, 10, false),
      { kind: 'removed', postId: P1 },
    ]);
    expect(h.controller.snapshot(P1)).toBeUndefined();
    expect(h.toast.messages).toEqual([t('like.error.generic')]);
  });

  it('TC-LIKE-011 등록(PUT) 403은 롤백하고 정지 문구를 띄우며 같은 요청을 다시 보내지 않는다', async () => {
    const h = createLikeHarness();
    h.controller.toggle(snap(P1, 10, false));
    h.api.fail(0, new HttpError(403, 'FORBIDDEN', '차단된 회원입니다.'));
    await settle();
    expect(h.controller.snapshot(P1)).toEqual(snap(P1, 10, false));
    expect(h.toast.messages).toEqual([t('like.error.banned')]);
    expect(h.api.calls).toHaveLength(1);
  });

  it('TC-LIKE-012 정지 회원도 이미 한 좋아요의 취소(DELETE)는 정상 취소된다', async () => {
    const h = createLikeHarness();
    h.api.setServer(P1, 11, true);
    h.controller.toggle(snap(P1, 11, true));
    h.api.succeed(0);
    await settle();
    expect(h.controller.snapshot(P1)).toEqual(snap(P1, 10, false));
    expect(h.toast.messages).toEqual([]);
  });

  it('TC-LIKE-013 재인증 필요(refresh 실패)면 롤백 뒤 로그인 화면으로 보낸다', async () => {
    const h = createLikeHarness();
    h.controller.toggle(snap(P1, 10, false));
    h.api.fail(0, new ReauthenticationRequiredError('reauth'));
    await settle();
    expect(h.controller.snapshot(P1)).toEqual(snap(P1, 10, false));
    expect(h.authFlow.calls).toEqual(['login']);
  });

  it('TC-LIKE-030 서로 다른 두 사진이 연달아 실패하면 같은 문구 토스트가 두 번 요청된다', async () => {
    const h = createLikeHarness();
    h.controller.toggle(snap(P1, 10, false));
    h.controller.toggle(snap(P2, 5, false));
    h.api.fail(0, server500());
    h.api.fail(1, server500());
    await settle();
    expect(h.toast.messages).toEqual([t('like.error.generic'), t('like.error.generic')]);
  });
});

describe('DefaultLikeController 직렬화(D-04)', () => {
  it('TC-LIKE-015 TC-LIKE-018 PUT 진행 중 on·off·on 연타는 요청을 쌓지 않고 PUT 1회로 끝나며 최종 isLiked=true', async () => {
    const h = createLikeHarness();
    h.api.setServer(P1, 10, false);
    h.controller.toggle(snap(P1, 10, false));
    h.controller.toggle(snap(P1, 11, true));
    h.controller.toggle(snap(P1, 10, false));
    expect(h.api.calls).toHaveLength(1);
    expect(h.controller.snapshot(P1)).toMatchObject({ isLiked: true });
    h.api.succeed(0);
    await settle();
    expect(h.api.calls.map((c) => c.kind)).toEqual(['like']);
    expect(h.controller.snapshot(P1)).toEqual(snap(P1, 11, true));
  });

  it('TC-LIKE-016 on·off 2회 연타: PUT 응답 뒤 최종 의도(off)와 서버 상태(on)가 다르면 DELETE를 1회 더 보낸다', async () => {
    const h = createLikeHarness();
    h.api.setServer(P1, 10, false);
    h.controller.toggle(snap(P1, 10, false));
    h.controller.toggle(snap(P1, 11, true));
    expect(h.controller.snapshot(P1)).toEqual(snap(P1, 10, false));
    h.api.succeed(0);
    await settle();
    expect(h.api.calls.map((c) => c.kind)).toEqual(['like', 'unlike']);
    h.api.succeed(1);
    await settle();
    expect(h.api.calls).toHaveLength(2);
    expect(h.controller.snapshot(P1)).toEqual(snap(P1, 10, false));
    expect(h.api.serverState(P1)).toEqual({ likeCount: 10, isLiked: false });
  });

  it('TC-LIKE-019 서로 다른 두 사진은 독립적으로 병렬 요청되고 한쪽 실패가 다른 쪽에 영향이 없다', async () => {
    const h = createLikeHarness();
    h.api.setServer(P2, 5, false);
    h.controller.toggle(snap(P1, 10, false));
    h.controller.toggle(snap(P2, 5, false));
    expect(h.api.calls.map((c) => c.postId)).toEqual([P1, P2]);
    h.api.fail(0, server500());
    h.api.succeed(1);
    await settle();
    expect(h.controller.snapshot(P1)).toEqual(snap(P1, 10, false));
    expect(h.controller.snapshot(P2)).toEqual(snap(P2, 6, true));
  });

  it('TC-LIKE-020 PUT 진행 중 다시 탭해 의도=off인데 PUT이 실패하면 롤백 결과가 의도와 같으므로 추가 요청 없이 토스트만 띄운다', async () => {
    const h = createLikeHarness();
    h.controller.toggle(snap(P1, 10, false));
    h.controller.toggle(snap(P1, 11, true));
    h.api.fail(0, server500());
    await settle();
    expect(h.api.calls).toHaveLength(1);
    expect(h.controller.snapshot(P1)).toEqual(snap(P1, 10, false));
    expect(h.toast.messages).toEqual([t('like.error.generic')]);
  });

  it('TC-LIKE-022 [가정: 진행 중 요청이 실패할 때 서버 상태가 의도와 달라도 자동 재전송하지 않는다] 오래된 롤백이 이후의 새 탭을 되돌리지 않는다', async () => {
    const h = createLikeHarness();
    h.api.setServer(P1, 10, false);
    h.controller.toggle(snap(P1, 10, false));
    h.controller.toggle(snap(P1, 11, true));
    h.controller.toggle(snap(P1, 10, false)); // 의도 on, 진행 중 PUT
    h.api.fail(0, server500());
    await settle();
    expect(h.api.calls).toHaveLength(1);
    expect(h.controller.snapshot(P1)).toEqual(snap(P1, 10, false));
    // 실패 뒤의 새 탭은 새 세대로 처리되어 성공 결과가 유지된다.
    h.controller.toggle(snap(P1, 10, false));
    expect(h.api.calls.map((c) => c.kind)).toEqual(['like', 'like']);
    h.api.succeed(1);
    await settle();
    expect(h.controller.snapshot(P1)).toEqual(snap(P1, 11, true));
    expect(h.toast.messages).toHaveLength(1);
  });

  it('TC-LIKE-021 완료된 좋아요 이후 값만 latestSince로 돌려준다(요청 시작 revision 병합)', async () => {
    const h = createLikeHarness();
    const before = h.controller.revision();
    h.controller.toggle(snap(P1, 10, false));
    h.api.succeed(0);
    await settle();
    expect(h.controller.revision()).toBeGreaterThan(before);
    expect(h.controller.latestSince(P1, before)).toEqual(snap(P1, 11, true));
    expect(h.controller.latestSince(P1, h.controller.revision())).toBeUndefined();
    expect(h.controller.latestSince(P2, before)).toBeUndefined();
  });
});

describe('DefaultLikeController 화면 이탈·계정 전환', () => {
  it('TC-LIKE-029 구독자가 없어도(화면 이탈) 응답은 저장소에 반영되고 토스트는 표시기에 요청된다', async () => {
    const h = createLikeHarness();
    h.controller.toggle(snap(P1, 10, false));
    h.unsubscribe();
    h.api.fail(0, server500());
    await settle();
    expect(h.controller.snapshot(P1)).toEqual(snap(P1, 10, false));
    expect(h.toast.messages).toEqual([t('like.error.generic')]);
  });

  it('TC-LIKE-031 clearAll(로그아웃·계정 전환) 뒤 도착한 이전 계정의 응답은 무시된다', async () => {
    const h = createLikeHarness();
    h.controller.toggle(snap(P1, 10, false));
    h.controller.clearAll();
    const seen = h.events.length;
    h.api.succeed(0, { likeCount: 99 });
    await settle();
    expect(h.events).toHaveLength(seen);
    expect(h.controller.snapshot(P1)).toBeUndefined();
    expect(h.toast.messages).toEqual([]);
  });

  it('TC-LIKE-031 이전 계정 요청의 실패도 새 계정 화면에 롤백·토스트로 나타나지 않는다', async () => {
    const h = createLikeHarness();
    h.controller.toggle(snap(P1, 10, false));
    h.controller.clearAll();
    h.api.fail(0, server500());
    await settle();
    expect(h.toast.messages).toEqual([]);
    expect(h.controller.snapshot(P1)).toBeUndefined();
  });

  it('TC-LIKE-031 clearAll 뒤 새 계정이 같은 사진을 누르면 새 요청이 나가고 결과는 새 요청의 서버 값뿐이다', async () => {
    const h = createLikeHarness();
    h.controller.toggle(snap(P1, 10, false));
    h.controller.clearAll();
    h.controller.toggle(snap(P1, 20, true));
    expect(h.api.calls.map((c) => c.kind)).toEqual(['like', 'unlike']);
    h.api.succeed(0, { likeCount: 99 });
    h.api.succeed(1, { likeCount: 19, isLiked: false });
    await settle();
    expect(h.controller.snapshot(P1)).toEqual(snap(P1, 19, false));
  });
});
