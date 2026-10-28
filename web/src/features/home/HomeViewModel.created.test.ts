import { MY_POST_ID, TODAY_POST, createHomeHarness, finish, settle } from '../../test/homeHarness';

const CREATED_PENDING = { type: 'created', postId: MY_POST_ID, topicDate: '2026-10-27', moderationStatus: 'PENDING' } as const;

async function emptyHome() {
  const h = createHomeHarness();
  h.router.set(TODAY_POST, 'home/posts-today__not-posted');
  await finish(h, h.viewModel.onShown());
  expect(h.viewModel.state.hero).toEqual({ kind: 'empty', banned: false });
  return h;
}

describe('HomeViewModel created 변경(업로드 직후 히어로, REQ-UPL-062)', () => {
  it('TC-UPL-060 VALIDATING이 오면 히어로는 곧바로 processing이 된다', async () => {
    const h = await emptyHome();
    h.changes.publish({ ...CREATED_PENDING, moderationStatus: 'VALIDATING' });
    expect(h.viewModel.state.hero).toEqual({ kind: 'processing' });
    expect(h.viewModel.state.ai).toEqual({ kind: 'hidden' });
  });

  it('TC-UPL-060 PENDING이 오면 히어로는 검수 대기 사진이 된다', async () => {
    const h = await emptyHome();
    h.changes.publish(CREATED_PENDING);
    expect(h.viewModel.state.hero).toMatchObject({ kind: 'photo', postId: MY_POST_ID, pending: true });
    expect(h.viewModel.state.ai).toEqual({ kind: 'hidden' });
  });

  it('TC-UPL-060 이벤트만으로 반영하고 GET /posts/today를 다시 부르지 않는다', async () => {
    const h = await emptyHome();
    const before = h.ff.callsTo('GET /posts/today').length;
    h.changes.publish(CREATED_PENDING);
    await settle();
    expect(h.ff.callsTo('GET /posts/today')).toHaveLength(before);
  });

  it('TC-UPL-060 오늘이 아닌 날짜의 created는 히어로를 바꾸지 않는다', async () => {
    const h = await emptyHome();
    h.changes.publish({ ...CREATED_PENDING, topicDate: '2026-10-26' });
    expect(h.viewModel.state.hero).toEqual({ kind: 'empty', banned: false });
  });

  it('TC-UPL-060 created 뒤에 홈이 다시 보이면 서버 상태(/posts/today)로 맞춘다', async () => {
    const h = await emptyHome();
    h.changes.publish({ ...CREATED_PENDING, moderationStatus: 'VALIDATING' });
    h.router.set(TODAY_POST, 'home/posts-today__posted-pending');
    await finish(h, h.viewModel.onShown());
    expect(h.viewModel.state.hero).toMatchObject({ kind: 'photo', postId: MY_POST_ID, pending: true });
  });

  it('TC-UPL-060 created 뒤에 그 게시물이 삭제되면 히어로는 비었음으로 돌아간다', async () => {
    const h = await emptyHome();
    h.changes.publish(CREATED_PENDING);
    h.changes.publish({ type: 'removed', postId: MY_POST_ID });
    expect(h.viewModel.state.hero).toEqual({ kind: 'empty', banned: false });
  });

  it('TC-UPL-060 홈이 사라진 뒤(dispose)에 온 created는 상태를 바꾸지 않는다', async () => {
    const h = await emptyHome();
    h.viewModel.dispose();
    const before = h.viewModel.state;
    h.changes.publish(CREATED_PENDING);
    expect(h.viewModel.state).toBe(before);
  });
});
