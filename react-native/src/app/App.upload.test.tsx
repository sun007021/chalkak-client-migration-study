import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { FakeAnalyticsTracker } from '../core/analytics/__testing__/FakeAnalyticsTracker';
import { createNetHarness } from '../core/http/__testing__/createNetHarness';
import { deferred } from '../core/http/__testing__/FakeTransport';
import { fixtureResponse } from '../core/http/__testing__/loadFixture';
import { FakeGallerySaver } from '../core/media/__testing__/FakeGallerySaver';
import { FakeImagePicker, picked } from '../core/media/__testing__/FakeImagePicker';
import { FakeLocalFiles } from '../core/media/__testing__/FakeLocalFiles';
import { FakeMediaPermissions } from '../core/media/__testing__/FakeMediaPermissions';
import { FakeMonotonicClock } from '../core/media/__testing__/FakeMonotonicClock';
import { FixtureRouter, type RouteValue } from '../data/__testing__/FixtureRouter';
import { GUEST_ROUTES, MEMBER_ROUTES, NOW } from '../features/home/__testing__/createHomeHarness';
import { FakeImageEngine } from '../features/photo-edit/__testing__/FakeImageEngine';
import { UPLOAD_ROUTES } from '../features/upload/__testing__/createUploadHarness';
import type { MediaServices } from '../features/upload/MediaServices';
import { t } from '../shared/copy';
import { App } from './App';

const OK = { ok: true, config: { apiBaseUrl: 'http://localhost:4010/api/v1/' } } as const;
const PHOTO = 'file:///picked/photo-a.jpg';

/** 홈 fixture 위에 업로드 fixture를 겹친 가짜 서버. 오늘은 미작성이다. */
async function renderApp(mode: 'member' | 'guest', routes: Record<string, RouteValue> = {}) {
  const net = createNetHarness();
  net.clock.set(NOW);
  if (mode === 'member') await net.signIn();
  else await net.sessionStore.enterGuest();
  const router = new FixtureRouter(
    mode === 'member' ? { ...MEMBER_ROUTES, ...UPLOAD_ROUTES, ...routes } : GUEST_ROUTES,
  ).install(net.transport);

  const files = new FakeLocalFiles();
  const engine = new FakeImageEngine(files);
  const picker = new FakeImagePicker();
  const media: MediaServices = {
    picker,
    gallery: new FakeGallerySaver(),
    permissions: new FakeMediaPermissions(),
    files,
    engine,
    monotonic: new FakeMonotonicClock(),
    platform: 'android',
  };
  const analytics = new FakeAnalyticsTracker();
  await render(
    <App
      configResult={OK}
      overrides={{
        clock: net.clock,
        sessionStore: net.sessionStore,
        events: net.events,
        api: net.api,
        analytics,
        media,
      }}
    />,
  );
  await screen.findByTestId('bottom-bar.root');
  return { net, router, picker, analytics, engine };
}

const press = (id: string) => fireEvent.press(screen.getByTestId(id));

describe('App - 업로드 진입 (하단 + 버튼)', () => {
  it('TC-UPL-001 게스트는 토스트만 뜨고 요청이 0건이며 업로드 화면이 열리지 않는다', async () => {
    const { net } = await renderApp('guest');
    await screen.findByTestId('home.root');
    const before = net.transport.requests.length;
    await press('bottom-bar.upload-button');
    expect(await screen.findByTestId('toast.message')).toHaveTextContent(
      t('upload.gate.login-required'),
    );
    expect(net.transport.requests.length).toBe(before);
    expect(screen.queryByTestId('upload.root')).not.toBeOnTheScreen();
  });

  it('TC-UPL-002 회원은 GET /posts/today 확인 뒤 업로드 화면이 열린다', async () => {
    const { router } = await renderApp('member', {
      'GET /posts/today': 'home/posts-today__not-posted',
    });
    await screen.findByTestId('home.topic-title');
    const before = router.calls('GET /posts/today').length;
    await press('bottom-bar.upload-button');
    expect(await screen.findByTestId('upload.root')).toBeOnTheScreen();
    expect(router.calls('GET /posts/today').length).toBe(before + 1);
  });

  it('TC-UPL-009 확인 중에는 upload-entry.loading이 보이고 연타해도 요청은 1회다', async () => {
    const gate = deferred<void>();
    let calls = 0;
    const { router } = await renderApp('member', {
      'GET /posts/today': async () => {
        calls += 1;
        if (calls === 1) return fixtureResponse('home/posts-today__not-posted');
        await gate.promise;
        return fixtureResponse('home/posts-today__not-posted');
      },
    });
    await screen.findByTestId('home.topic-title');
    const before = router.calls('GET /posts/today').length;
    await press('bottom-bar.upload-button');
    await press('bottom-bar.upload-button');
    await press('bottom-bar.upload-button');
    expect(await screen.findByTestId('upload-entry.loading')).toBeOnTheScreen();
    expect(router.calls('GET /posts/today').length).toBe(before + 1);
    gate.resolve();
    expect(await screen.findByTestId('upload.root')).toBeOnTheScreen();
    expect(screen.queryByTestId('upload-entry.loading')).not.toBeOnTheScreen();
  });

  it('TC-UPL-003 이미 작성했으면 토스트로 알리고 업로드 화면은 열리지 않는다', async () => {
    await renderApp('member', { 'GET /posts/today': 'home/posts-today__posted-pending' });
    await screen.findByTestId('home.topic-title');
    await press('bottom-bar.upload-button');
    expect(await screen.findByTestId('toast.message')).toHaveTextContent(
      t('upload.gate.already-posted'),
    );
    expect(screen.queryByTestId('upload.root')).not.toBeOnTheScreen();
  });

  it('홈의 히어로 업로드 버튼도 같은 게이트를 지난다', async () => {
    const { router } = await renderApp('member', {
      'GET /posts/today': 'home/posts-today__not-posted',
    });
    await screen.findByTestId('home.hero-upload-button');
    const before = router.calls('GET /posts/today').length;
    await press('home.hero-upload-button');
    expect(await screen.findByTestId('upload.root')).toBeOnTheScreen();
    expect(router.calls('GET /posts/today').length).toBe(before + 1);
  });

  it('TC-UPL-090 설정 탭에서 + -> 업로드 화면 -> 닫기를 누르면 설정 탭으로 돌아온다', async () => {
    await renderApp('member', { 'GET /posts/today': 'home/posts-today__not-posted' });
    await press('bottom-bar.tab-settings');
    expect(screen.getByTestId('bottom-bar.tab-settings')).toBeSelected();
    await press('bottom-bar.upload-button');
    await screen.findByTestId('upload.root');
    await press('upload.close-button');
    await waitFor(() => expect(screen.queryByTestId('upload.root')).not.toBeOnTheScreen());
    expect(screen.getByTestId('bottom-bar.tab-settings')).toBeSelected();
  });
});

describe('App - 업로드 전체 흐름', () => {
  it('TC-UPL-002·060·086·088 사진 선택 -> 편집 완료 -> 전시하기 -> 성공 화면 -> 확인하면 전시 탭', async () => {
    const { picker, analytics, router } = await renderApp('member', {
      'GET /posts/today': 'home/posts-today__not-posted',
    });
    picker.willPick(picked(PHOTO));

    await press('bottom-bar.upload-button');
    await screen.findByTestId('upload.root');
    await press('upload.album-button');
    await screen.findByTestId('photo-edit.root');
    await press('photo-edit.done-button');
    await waitFor(() => expect(screen.queryByTestId('photo-edit.root')).not.toBeOnTheScreen());
    expect(await screen.findByTestId('upload.photo-preview')).toBeOnTheScreen();

    await fireEvent.changeText(screen.getByTestId('upload.title-input'), '가을 하늘');
    await press('upload.submit-button');

    expect(await screen.findByTestId('upload-success.root')).toBeOnTheScreen();
    expect(screen.queryByTestId('upload.root')).not.toBeOnTheScreen();
    expect(screen.getByTestId('upload-success.message')).toHaveTextContent(
      '‘가을 하늘’을 기록했어요.',
    );
    expect(screen.getByTestId('upload-success.status-message')).toHaveTextContent(
      t('upload.success.pending'),
    );
    expect(analytics.screenNames).toEqual(
      expect.arrayContaining(['photo_upload', 'photo_upload_success']),
    );
    expect(router.calls('POST /posts')).toHaveLength(1);

    await press('upload-success.confirm-button');
    await waitFor(() => expect(screen.queryByTestId('upload-success.root')).not.toBeOnTheScreen());
    expect(screen.getByTestId('bottom-bar.tab-display')).toBeSelected();
  });

  it('REQ-UPL-064 성공 화면에서 뒤로 가도 업로드 화면으로 돌아오지 않는다', async () => {
    const { picker } = await renderApp('member', {
      'GET /posts/today': 'home/posts-today__not-posted',
    });
    picker.willPick(picked(PHOTO));
    await press('bottom-bar.upload-button');
    await screen.findByTestId('upload.root');
    await press('upload.album-button');
    await screen.findByTestId('photo-edit.root');
    await press('photo-edit.done-button');
    await screen.findByTestId('upload.photo-preview');
    await press('upload.submit-button');
    await screen.findByTestId('upload-success.root');

    await press('upload-success.confirm-button');
    await waitFor(() => expect(screen.queryByTestId('upload-success.root')).not.toBeOnTheScreen());
    expect(screen.queryByTestId('upload.root')).not.toBeOnTheScreen();
  });
});
