import { IDBFactory } from 'fake-indexeddb';
import { MOCK_BASE } from '../test/apiEnv';
import { makeHarness } from '../test/appHarness';
import { FixtureRouter } from '../test/fixtureRouter';
import { memberSession } from '../test/fixtures';
import { finish } from '../test/homeHarness';
import { RECORD_ROUTES, OCT_27 } from '../test/recordRoutes';
import { createAppContainer } from './container';
import { CanvasCalendarImageExporter } from '../features/record/CalendarImageExporter';
import { AnchorFileDownloader } from '../features/record/FileDownloader';

describe('컨테이너의 기록 조립 (W9)', () => {
  it('TC-REC-038 이미지 렌더·파일 다운로드 포트를 주입하지 않으면 canvas 렌더와 `<a download>` 구현을 쓴다', () => {
    const container = createAppContainer({ env: { VITE_API_BASE_URL: MOCK_BASE }, indexedDB: new IDBFactory() });
    expect(container.calendarImageExporter).toBeInstanceOf(CanvasCalendarImageExporter);
    expect(container.fileDownloader).toBeInstanceOf(AnchorFileDownloader);
  });

  it('TC-REC-038 주입한 Fake 포트를 그대로 쓴다', () => {
    const h = makeHarness();
    expect(h.container.calendarImageExporter).toBe(h.calendarExporter);
    expect(h.container.fileDownloader).toBe(h.downloader);
  });

  it('recordSession은 모드별로 하나를 보관하고 다른 모드를 요청하면 이전 것은 dispose한다', () => {
    const h = makeHarness({ session: memberSession() });
    const first = h.container.recordSession('member');
    expect(h.container.recordSession('member')).toBe(first);
    const guest = h.container.recordSession('guest');
    expect(guest).not.toBe(first);
    expect(guest.viewModel.state.mode).toBe('guest');
    expect(h.container.recordSession('guest')).toBe(guest);
  });

  it('TC-REC-028 UserCaches.clearAll(로그아웃·계정 전환)이 기록 ViewModel을 처음 상태로 돌리고 삭제 기억도 지운다', async () => {
    const h = makeHarness({ session: memberSession() });
    new FixtureRouter(h.ff, RECORD_ROUTES);
    const { viewModel } = h.container.recordSession('member');
    await finish(h, viewModel.onShown());
    viewModel.selectDate('2026-10-20');
    h.container.postChanges.publish({ type: 'removed', postId: OCT_27 });
    expect(viewModel.state.selectedDate).toBe('2026-10-20');
    viewModel.onHidden();
    await h.container.userCaches.clearAll();
    expect(viewModel.state).toMatchObject({ selectedDate: null, selectedPost: null, availableMonths: [], body: { status: 'loading' } });
    expect(h.container.postChanges.wasRemoved(OCT_27)).toBe(false);
  });

  it('TC-REC-024 컨테이너의 PostChanges 버스를 구독한다: 삭제 이벤트가 보관된 ViewModel 달력에 반영된다', async () => {
    const h = makeHarness({ session: memberSession() });
    new FixtureRouter(h.ff, RECORD_ROUTES);
    const { viewModel } = h.container.recordSession('member');
    await finish(h, viewModel.onShown());
    h.container.postChanges.publish({ type: 'removed', postId: OCT_27 });
    expect(viewModel.state.body).toMatchObject({ status: 'ready' });
    expect('posts' in viewModel.state.body && viewModel.state.body.posts.map((p) => p.topicDate)).toEqual(['2026-10-20', '2026-10-31']);
  });
});
