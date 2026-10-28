import { networkFailure } from '../../core/http/__testing__/FakeTransport';
import { unauthorized } from '../../core/http/__testing__/createNetHarness';
import { t } from '../../shared/copy';
import { flush } from '../home/__testing__/createHomeHarness';
import {
  createFeedHarness,
  GET_MINE,
  gated,
  MINE,
  PUT_MINE,
} from './__testing__/createFeedHarness';

async function openEditor(routes: Record<string, never | string | unknown> = {}) {
  const h = await createFeedHarness({
    open: { entry: 'mine', postId: MINE },
    routes: routes as never,
  });
  await h.viewModel.onShown();
  h.viewModel.openTitleEditor();
  return h;
}
const puts = (h: Awaited<ReturnType<typeof openEditor>>) =>
  h.transport.requests.filter((r) => r.method === 'PUT');
const dialog = (h: Awaited<ReturnType<typeof openEditor>>) => h.viewModel.getSnapshot().titleDialog;

describe('FeedViewModel 제목 수정 다이얼로그', () => {
  it('TC-FEED-018 열면 현재 제목이 미리 채워지고 취소는 요청을 보내지 않는다', async () => {
    const h = await openEditor();
    expect(dialog(h)).toMatchObject({
      draft: h.viewModel.getSnapshot().content?.title,
      saving: false,
      errorMessage: null,
    });
    expect(dialog(h)?.draft).toBeTruthy();
    h.viewModel.closeTitleEditor();
    expect(dialog(h)).toBeNull();
    expect(puts(h)).toEqual([]);
  });

  it('TC-FEED-019 이모지 10개는 입력되고 11번째는 입력되지 않는다', async () => {
    const h = await openEditor();
    const ten = '🙂'.repeat(10);
    h.viewModel.onTitleInput(ten);
    expect(dialog(h)?.draft).toBe(ten);
    h.viewModel.onTitleInput(ten + '🙂');
    expect(dialog(h)?.draft).toBe(ten);
  });

  it('TC-FEED-020 11자 붙여넣기는 10 code point까지만 들어간다', async () => {
    const h = await openEditor();
    h.viewModel.onTitleInput('');
    h.viewModel.onTitleInput('가나다라마바사아자차카');
    expect(dialog(h)?.draft).toBe('가나다라마바사아자차');
  });

  it('TC-FEED-021 앞뒤 공백 포함 12자 입력은 strip 뒤 10자로 전송하고 화면에도 공백 없는 값이 표시된다', async () => {
    const h = await openEditor();
    h.viewModel.onTitleInput(' 가나다라마바사아자차 ');
    await h.viewModel.saveTitle();
    expect(JSON.parse(String(puts(h)[0].body))).toEqual({ title: '가나다라마바사아자차' });
    expect(h.viewModel.getSnapshot().content?.title).toBe('가나다라마바사아자차');
  });

  it('TC-FEED-022 빈 입력이면 title 키를 null로 보내고 성공 뒤 제목은 null(무제)이다', async () => {
    const h = await openEditor({ [PUT_MINE]: 'feed/posts-title-update__200-null-title' });
    h.viewModel.onTitleInput('   ');
    await h.viewModel.saveTitle();
    expect(String(puts(h)[0].body)).toBe('{"title":null}');
    expect(h.viewModel.getSnapshot().content?.title).toBeNull();
  });

  it('TC-FEED-023 TC-FEED-024 성공하면 다이얼로그를 닫고 토스트 1회, 응답 title을 상세·목록 캐시(변경 알림)에 반영한다', async () => {
    const h = await openEditor();
    h.viewModel.onTitleInput('다른 제목');
    await h.viewModel.saveTitle();
    expect(dialog(h)).toBeNull();
    expect(h.toast.messages).toEqual([t('feed.edit.success')]);
    // 응답 title(서버 값)을 쓴다.
    expect(h.viewModel.getSnapshot().content?.title).toBe('가나다라마바사아자차');
    expect(h.changes.published).toEqual([
      { kind: 'title-changed', postId: MINE, title: '가나다라마바사아자차' },
    ]);
  });

  it('TC-FEED-025 저장 중에는 "저장 중" 상태이고 연타해도 PUT은 1회만 나간다', async () => {
    const h = await openEditor();
    const gate = gated(h.router, PUT_MINE, 'feed/posts-title-update__200');
    h.viewModel.onTitleInput('새 제목');
    const first = h.viewModel.saveTitle();
    void h.viewModel.saveTitle();
    void h.viewModel.saveTitle();
    await flush();
    expect(dialog(h)?.saving).toBe(true);
    gate.release();
    await first;
    expect(puts(h)).toHaveLength(1);
  });

  it('TC-FEED-026 상세 재조회가 진행 중일 때 제목을 수정해 성공하면 늦게 온 이전 상세 응답이 새 제목을 덮지 않는다', async () => {
    const h = await openEditor();
    const gate = gated(h.router, GET_MINE, 'feed/posts-detail__mine-today');
    const refreshing = h.viewModel.onShown();
    await flush();
    h.viewModel.onTitleInput('새 제목');
    await h.viewModel.saveTitle();
    gate.release();
    await refreshing;
    expect(h.viewModel.getSnapshot().content?.title).toBe('가나다라마바사아자차');
  });

  it('TC-FEED-027 수정 400은 상태 문구를 보이고 다이얼로그·입력·기존 제목을 유지한다(message로 분기하지 않음)', async () => {
    const h = await openEditor({ [PUT_MINE]: 'feed/posts-title-update__400-not-editable' });
    const original = h.viewModel.getSnapshot().content?.title;
    h.viewModel.onTitleInput('새 제목');
    await h.viewModel.saveTitle();
    expect(dialog(h)).toMatchObject({
      draft: '새 제목',
      saving: false,
      errorMessage: t('feed.edit.error.state'),
    });
    expect(h.viewModel.getSnapshot().content?.title).toBe(original);
    expect(h.toast.messages).toEqual([]);
  });

  it('TC-FEED-028 400은 서버 message와 상관없이 상태 문구를 보이고, 다이얼로그는 열린 채 입력을 유지한다', async () => {
    // [팀장 결정: spec §5.2 표·D-02 우선, Android와 동일] 서버 문구("제목은 10자 이하여야 합니다.") 분기는 두지 않는다.
    const h = await openEditor({ [PUT_MINE]: 'feed/posts-title-update__400-title-too-long' });
    h.viewModel.onTitleInput('새 제목');
    await h.viewModel.saveTitle();
    expect(dialog(h)).not.toBeNull();
    expect(dialog(h)).toMatchObject({
      draft: '새 제목',
      saving: false,
      errorMessage: t('feed.edit.error.state'),
    });
    expect(puts(h)).toHaveLength(1);
  });

  it('TC-FEED-029 정지 회원의 403은 정지 문구를 보이고 같은 요청을 다시 보내지 않는다', async () => {
    const h = await openEditor({ [PUT_MINE]: 'feed/posts-title-update__403-banned' });
    h.viewModel.onTitleInput('새 제목');
    await h.viewModel.saveTitle();
    expect(dialog(h)?.errorMessage).toBe(t('feed.edit.error.banned'));
    expect(puts(h)).toHaveLength(1);
  });

  it('TC-FEED-030 수정 404는 안내 후 상세를 닫고 목록을 갱신하도록 알린다', async () => {
    const h = await openEditor({ [PUT_MINE]: 'feed/posts-title-update__404-not-found' });
    h.viewModel.onTitleInput('새 제목');
    await h.viewModel.saveTitle();
    expect(h.toast.messages).toEqual([t('feed.error.not-found')]);
    expect(h.navigator.closeCount).toBe(1);
    expect(h.changes.published).toEqual([{ kind: 'deleted', postId: MINE }]);
  });

  it('TC-FEED-031 수정 401은 refresh 뒤 1회 재전송한다', async () => {
    const h = await openEditor({ [PUT_MINE]: [unauthorized(), 'feed/posts-title-update__200'] });
    h.viewModel.onTitleInput('새 제목');
    await h.viewModel.saveTitle();
    expect(dialog(h)).toBeNull();
    expect(puts(h)).toHaveLength(2);
  });

  it('TC-FEED-031 refresh 뒤에도 401이면 "로그인이 필요해요"와 로그인 화면이다', async () => {
    const h = await openEditor({ [PUT_MINE]: 'feed/posts-title-update__401-unauthorized' });
    h.viewModel.onTitleInput('새 제목');
    await h.viewModel.saveTitle();
    expect(dialog(h)?.errorMessage).toBe(t('feed.edit.error.login'));
    expect(h.authFlow.calls).toEqual(['login']);
  });

  it.each([
    ['5xx', 'feed/posts-title-update__500-server-error', t('feed.edit.error.other')],
    ['연결 실패', networkFailure(), t('common.error.network')],
  ])(
    'TC-FEED-032 %s는 재시도(총 3회) 뒤 "%s" 문구이고 다시 저장할 수 있다',
    async (_name, route, message) => {
      const h = await openEditor({ [PUT_MINE]: route });
      h.viewModel.onTitleInput('새 제목');
      await h.viewModel.saveTitle();
      expect(puts(h)).toHaveLength(3);
      expect(dialog(h)).toMatchObject({ saving: false, errorMessage: message, draft: '새 제목' });
      h.router.set(PUT_MINE, 'feed/posts-title-update__200');
      await h.viewModel.saveTitle();
      expect(dialog(h)).toBeNull();
    },
  );

  it('TC-FEED-033 응답 유실 뒤 같은 제목으로 다시 저장해도 성공으로 처리한다', async () => {
    const h = await openEditor({
      [PUT_MINE]: [
        networkFailure(),
        networkFailure(),
        networkFailure(),
        'feed/posts-title-update__200',
      ],
    });
    h.viewModel.onTitleInput('가나다라마바사아자차');
    await h.viewModel.saveTitle();
    expect(dialog(h)?.errorMessage).toBe(t('common.error.network'));
    await h.viewModel.saveTitle();
    expect(dialog(h)).toBeNull();
    expect(h.toast.messages).toEqual([t('feed.edit.success')]);
  });
});
