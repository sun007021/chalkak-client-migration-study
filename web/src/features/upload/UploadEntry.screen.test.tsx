import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { t } from '../../copy/ko';
import { deferred } from '../../test/deferred';
import { loadFixture } from '../../test/fixtures';
import { screenViews } from '../../test/screenViews';
import { openUploadApp, toastText, advance, uploadLocation } from '../../test/uploadApp';
import { TODAY } from '../../test/uploadHarness';

const plus = () => screen.getByTestId('bottom-bar.upload-button');
const todayCalls = (h: { ff: { callsTo(spec: string): unknown[] } }) => h.ff.callsTo('GET /posts/today').length;

async function openHome(options: Parameters<typeof openUploadApp>[0] = {}) {
  const app = openUploadApp(options);
  await screen.findByTestId('home.root');
  await waitFor(() => expect(screen.queryByTestId('home.hero-loading')).not.toBeInTheDocument());
  return app;
}

/** GET /posts/today를 붙잡아 두었다가 풀어 준다. */
function holdToday(app: Awaited<ReturnType<typeof openHome>>) {
  const gate = deferred<Response>();
  app.routes.set(TODAY, () => gate.promise);
  return (fixture: string) => gate.resolve(loadFixture(`${fixture}.json`).toResponse());
}

describe('업로드 진입 (+ 버튼, 홈 히어로)', () => {
  it('TC-UPL-002 회원이 +를 누르면 GET /posts/today 1회 뒤 업로드 화면이 push로 열리고 topicDate가 state에 실린다', async () => {
    const app = await openHome();
    const before = todayCalls(app.h);
    fireEvent.click(plus());
    await screen.findByTestId('upload.root');
    expect(todayCalls(app.h)).toBe(before + 1);
    expect(app.router.state.location.pathname).toBe('/upload');
    expect(app.router.state.location.state).toEqual({ topicDate: '2026-10-27' });
    expect(app.router.state.historyAction).toBe('PUSH');
    expect(screen.queryByTestId('upload-entry.loading')).not.toBeInTheDocument();
    expect(toastText()).toBeNull();
  });

  it('TC-UPL-009 확인 중에는 진입 표시(upload-entry.loading)가 보이고 연타해도 요청은 1회, 화면은 한 번만 열린다', async () => {
    const app = await openHome();
    const before = todayCalls(app.h);
    const release = holdToday(app);
    fireEvent.click(plus());
    expect(await screen.findByTestId('upload-entry.loading')).toHaveAttribute('role', 'status');
    fireEvent.click(plus());
    fireEvent.click(plus());
    expect(todayCalls(app.h)).toBe(before + 1);
    await act(async () => release('upload/posts-today__not-posted'));
    await screen.findByTestId('upload.root');
    expect(screen.queryByTestId('upload-entry.loading')).not.toBeInTheDocument();
    expect(todayCalls(app.h)).toBe(before + 1);
    expect(app.router.state.location.pathname).toBe('/upload');
  });

  it('TC-UPL-002 홈 히어로의 빈 상태 버튼도 같은 게이트를 쓴다', async () => {
    const app = await openHome();
    const before = todayCalls(app.h);
    fireEvent.click(screen.getByTestId('home.hero-upload-button'));
    await screen.findByTestId('upload.root');
    expect(todayCalls(app.h)).toBe(before + 1);
    expect(app.router.state.location.state).toEqual({ topicDate: '2026-10-27' });
  });

  it('TC-UPL-001 게스트는 로그인 안내 토스트만 보이고 요청이 0건이며 화면이 열리지 않는다', async () => {
    const app = openUploadApp({ mode: 'guest' });
    await screen.findByTestId('home.root');
    fireEvent.click(plus());
    expect(toastText()).toBe('게시물을 추가하려면 로그인이 필요해요');
    expect(toastText()).toBe(t('nav.guest.upload'));
    expect(app.h.ff.callsTo('GET /posts/today')).toHaveLength(0);
    expect(app.router.state.location.pathname).toBe('/home');
    expect(screen.queryByTestId('upload-entry.loading')).not.toBeInTheDocument();
  });

  it.each([
    ['이미 작성(VALIDATING)', 'home/posts-today__posted-validating', '이미 이 주제에 게시물을 작성했어요.'],
    ['이미 작성(PENDING)', 'home/posts-today__posted-pending', '이미 이 주제에 게시물을 작성했어요.'],
    ['이미 작성(APPROVED)', 'home/posts-today__posted-approved', '이미 이 주제에 게시물을 작성했어요.'],
    ['참여 가능한 주제 없음', 'home/posts-today__404-no-open-topic', '지금 참여할 수 있는 주제가 없어요.'],
    ['정지 회원', 'home/posts-today__403-banned', '이용이 정지되어 게시물을 작성할 수 없어요.'],
  ])('TC-UPL-003 TC-UPL-004 TC-UPL-005 %s 이면 2.5초 안에 토스트가 보이고 업로드 화면은 열리지 않는다', async (_name, fixture, message) => {
    const app = await openHome();
    app.routes.set(TODAY, fixture);
    fireEvent.click(plus());
    await waitFor(() => expect(toastText()).toBe(message));
    expect(app.router.state.location.pathname).toBe('/home');
    expect(screen.queryByTestId('upload.root')).not.toBeInTheDocument();
    expect(screen.queryByTestId('upload-entry.loading')).not.toBeInTheDocument();
  });

  it('TC-UPL-007 서버 오류는 재시도(0.5초, 1초) 뒤 확인 실패 토스트이고 화면은 열리지 않는다', async () => {
    const app = await openHome();
    app.routes.set(TODAY, 'home/posts-today__500-server-error');
    const before = todayCalls(app.h);
    fireEvent.click(plus());
    await advance(app.h, 1_500);
    await waitFor(() => expect(toastText()).toBe('게시물 작성 여부를 확인하지 못했어요. 다시 시도해 주세요.'));
    expect(todayCalls(app.h)).toBe(before + 3);
    expect(app.router.state.location.pathname).toBe('/home');
  });

  it('TC-UPL-007 TC-UPL-008 미작성인데 post 필드가 있는 응답(계약 위반)도 확인 실패 토스트다', async () => {
    const app = await openHome();
    app.routes.set(TODAY, 'upload/posts-today__invalid-not-posted-with-post');
    fireEvent.click(plus());
    await waitFor(() => expect(toastText()).toBe(t('upload.gate.check-failed')));
    expect(screen.queryByTestId('upload.root')).not.toBeInTheDocument();
  });

  it('TC-UPL-010 확인 중에 홈을 떠나면(탭 셸이 사라지면) 요청을 취소하고 뒤늦은 응답으로 화면이 열리지 않는다', async () => {
    const app = await openHome();
    const release = holdToday(app);
    fireEvent.click(plus());
    await screen.findByTestId('upload-entry.loading');
    const signal = app.h.ff.callsTo('GET /posts/today').at(-1)!.signal;
    await act(async () => {
      await app.router.navigate('/notifications');
    });
    await screen.findByTestId('notifications.root');
    expect(signal?.aborted).toBe(true);
    expect(screen.queryByTestId('upload-entry.loading')).not.toBeInTheDocument();
    await act(async () => release('upload/posts-today__not-posted'));
    expect(app.router.state.location.pathname).toBe('/notifications');
    expect(screen.queryByTestId('upload.root')).not.toBeInTheDocument();
    expect(toastText()).toBeNull();
  });

  it('TC-UPL-090 설정 탭에서 + → 업로드 화면 → 닫기 하면 설정 탭으로 돌아온다', async () => {
    const app = openUploadApp({ path: '/settings' });
    await screen.findByTestId('settings.root');
    fireEvent.click(plus());
    await screen.findByTestId('upload.root');
    fireEvent.click(screen.getByTestId('upload.close-button'));
    await screen.findByTestId('settings.root');
    expect(app.router.state.location.pathname).toBe('/settings');
  });
});

describe('업로드 화면 라우트 보호', () => {
  it('TC-UPL-001 게스트가 URL로 /upload에 오면 홈으로 replace되고 안내 토스트가 뜨며 요청·screen_view가 없다', async () => {
    const app = openUploadApp({ mode: 'guest', path: uploadLocation() });
    await screen.findByTestId('home.root');
    expect(app.router.state.location.pathname).toBe('/home');
    expect(toastText()).toBe(t('nav.guest.upload'));
    expect(app.h.ff.callsTo('POST /posts/uploads')).toHaveLength(0);
    expect(screenViews(app.h.tracker)).not.toContain('photo_upload');
  });

  it('TC-UPL-002 location.state 없이(새 탭·딥링크) /upload에 오면 홈으로 replace되고 업로드 요청·screen_view가 없다', async () => {
    const app = openUploadApp({ path: '/upload' });
    await screen.findByTestId('home.root');
    expect(app.router.state.location.pathname).toBe('/home');
    expect(app.router.state.historyAction).toBe('REPLACE');
    expect(app.h.ff.callsTo('POST /posts/uploads')).toHaveLength(0);
    expect(screenViews(app.h.tracker)).not.toContain('photo_upload');
    expect(screen.queryByTestId('upload.root')).not.toBeInTheDocument();
  });

  it('TC-UPL-002 topicDate 형식이 잘못된 state도 홈으로 보낸다', async () => {
    const app = openUploadApp({ path: { pathname: '/upload', state: { topicDate: '2026-13-40' } } });
    await screen.findByTestId('home.root');
    expect(app.router.state.location.pathname).toBe('/home');
  });
});
