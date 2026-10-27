import { t } from '../../shared/copy';
import type { IssueNavigationRequest } from './IssueNavigationPolicy';
import { createIssueWebHarness, SAFE_URL } from './__testing__/createIssueWebHarness';

const flush = async () => {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
};
const click = (
  url: string,
  extra: Partial<IssueNavigationRequest> = {},
): IssueNavigationRequest => ({
  url,
  isInitialLoad: false,
  isMainFrame: true,
  hasUserGesture: true,
  opensNewWindow: false,
  currentUrl: SAFE_URL,
  ...extra,
});

describe('IssueWebViewModel 로드 상태', () => {
  it('TC-BANR-017 안전한 주소면 그 주소를 loading으로 시작한다', () => {
    const h = createIssueWebHarness();
    expect(h.viewModel.getSnapshot()).toEqual({
      sourceUrl: SAFE_URL,
      phase: 'loading',
      errorKind: null,
      loadAttempt: 0,
    });
  });

  it.each(['http://web.example.test/issues/1', '', 'https://'])(
    'REQ-BANR-013 안전하지 않은 주소(%j)는 로드하지 않고 link-unavailable 오류다',
    (url) => {
      const h = createIssueWebHarness(url);
      expect(h.viewModel.getSnapshot()).toMatchObject({
        sourceUrl: null,
        phase: 'error',
        errorKind: 'link-unavailable',
      });
    },
  );

  it('로드 완료면 ready, 로드 실패면 error(load-failed)', () => {
    const h = createIssueWebHarness();
    h.viewModel.onLoadEnd();
    expect(h.viewModel.getSnapshot().phase).toBe('ready');
    h.viewModel.onLoadError();
    expect(h.viewModel.getSnapshot()).toMatchObject({ phase: 'error', errorKind: 'load-failed' });
  });

  it('TC-BANR-024 다시 시도는 같은 주소를 loading으로 되돌리고 loadAttempt를 올린다', () => {
    const h = createIssueWebHarness();
    h.viewModel.onLoadError();
    h.viewModel.retry();
    expect(h.viewModel.getSnapshot()).toEqual({
      sourceUrl: SAFE_URL,
      phase: 'loading',
      errorKind: null,
      loadAttempt: 1,
    });
    h.viewModel.onLoadEnd();
    expect(h.viewModel.getSnapshot().phase).toBe('ready');
  });

  it('REQ-BANR-013 안전하지 않은 주소는 다시 시도해도 계속 link-unavailable', () => {
    const h = createIssueWebHarness('http://web.example.test/x');
    h.viewModel.retry();
    expect(h.viewModel.getSnapshot()).toMatchObject({
      sourceUrl: null,
      phase: 'error',
      errorKind: 'link-unavailable',
    });
  });
});

describe('IssueWebViewModel 분석', () => {
  it('TC-BANR-025 REQ-BANR-012 screen_view issue를 한 번만 보낸다', () => {
    const h = createIssueWebHarness();
    h.viewModel.onScreenShown();
    h.viewModel.onScreenShown();
    expect(h.analytics.screenNames).toEqual(['issue']);
  });
});

describe('IssueWebViewModel 이동 요청', () => {
  it('TC-BANR-019 사용자가 누른 링크는 외부 브라우저로 열고 앱 안 이동은 거부한다', async () => {
    const h = createIssueWebHarness();
    const decision = h.viewModel.onNavigationRequest(click('https://other.example.test/x'));
    await flush();
    expect(decision).toBe('open-external');
    expect(h.linkOpener.opened).toEqual(['https://other.example.test/x']);
    expect(h.toast.messages).toEqual([]);
  });

  it('TC-BANR-018 TC-BANR-021 block이면 아무것도 열지 않고 토스트도 없다', async () => {
    const h = createIssueWebHarness();
    expect(h.viewModel.onNavigationRequest(click('tel:0212345678'))).toBe('block');
    expect(
      h.viewModel.onNavigationRequest(click('https://x.test/', { hasUserGesture: false })),
    ).toBe('block');
    await flush();
    expect(h.linkOpener.opened).toEqual([]);
    expect(h.toast.messages).toEqual([]);
  });

  it('TC-BANR-020 TC-BANR-022 앵커와 하위 프레임은 allow-in-app이고 외부로 열지 않는다', async () => {
    const h = createIssueWebHarness();
    expect(h.viewModel.onNavigationRequest(click(`${SAFE_URL}#a`))).toBe('allow-in-app');
    expect(h.viewModel.onNavigationRequest(click('https://f.test/', { isMainFrame: false }))).toBe(
      'allow-in-app',
    );
    await flush();
    expect(h.linkOpener.opened).toEqual([]);
  });

  it('TC-BANR-023 REQ-BANR-020 브라우저가 없으면 banner.no-browser 토스트', async () => {
    const h = createIssueWebHarness();
    h.linkOpener.result = 'no-browser';
    h.viewModel.onNavigationRequest(click('https://other.example.test/x'));
    await flush();
    expect(h.toast.messages).toEqual([t('banner.no-browser')]);
  });

  it('TC-BANR-023 REQ-BANR-020 열기에 실패하면 banner.open-failed 토스트', async () => {
    const h = createIssueWebHarness();
    h.linkOpener.result = 'failed';
    h.viewModel.onNavigationRequest(click('https://other.example.test/x'));
    await flush();
    expect(h.toast.messages).toEqual([t('banner.open-failed')]);
  });

  it('TC-BANR-019 외부로 열어도 웹뷰 화면 상태는 그대로다', async () => {
    const h = createIssueWebHarness();
    h.viewModel.onLoadEnd();
    h.viewModel.onNavigationRequest(click('https://other.example.test/x'));
    await flush();
    expect(h.viewModel.getSnapshot()).toMatchObject({ phase: 'ready', errorKind: null });
  });
});

describe('IssueWebViewModel 로드 중 차단', () => {
  const redirect = (url: string, extra: Partial<IssueNavigationRequest> = {}) =>
    click(url, { hasUserGesture: false, ...extra });

  it('최초 로드가 정책에 막히면 load-failed로 바꿔 스피너가 계속 돌지 않게 한다', () => {
    const h = createIssueWebHarness();
    const decision = h.viewModel.onNavigationRequest(
      redirect('http://web.example.test/issues/1', { isInitialLoad: true, currentUrl: null }),
    );
    expect(decision).toBe('block');
    expect(h.viewModel.getSnapshot()).toMatchObject({ phase: 'error', errorKind: 'load-failed' });
  });

  it('로드 중 리다이렉트가 막혀도 load-failed', () => {
    const h = createIssueWebHarness();
    h.viewModel.onNavigationRequest(
      redirect('https://web.example.test/issues/1', { isInitialLoad: true }),
    );
    h.viewModel.onNavigationRequest(redirect('intent://x#Intent;end'));
    expect(h.viewModel.getSnapshot()).toMatchObject({ phase: 'error', errorKind: 'load-failed' });
  });

  it('로드를 마친 뒤(ready) 막힌 스크립트 이동은 화면 상태를 바꾸지 않는다', () => {
    const h = createIssueWebHarness();
    h.viewModel.onLoadEnd();
    h.viewModel.onNavigationRequest(redirect('https://x.test/'));
    expect(h.viewModel.getSnapshot()).toMatchObject({ phase: 'ready', errorKind: null });
  });

  it('로드 중이라도 사용자가 누른 링크·하위 프레임·새 창의 차단은 로드 실패가 아니다', () => {
    const h = createIssueWebHarness();
    h.viewModel.onNavigationRequest(click('tel:0212345678'));
    h.viewModel.onNavigationRequest(redirect('tel:1', { isMainFrame: false }));
    h.viewModel.onNavigationRequest(redirect('tel:1', { opensNewWindow: true }));
    expect(h.viewModel.getSnapshot()).toMatchObject({ phase: 'loading', errorKind: null });
  });

  it('차단 뒤 다시 시도하면 loading으로 돌아간다', () => {
    const h = createIssueWebHarness();
    h.viewModel.onNavigationRequest(redirect('tel:1'));
    h.viewModel.retry();
    expect(h.viewModel.getSnapshot()).toMatchObject({ phase: 'loading', errorKind: null });
  });
});

describe('IssueWebViewModel dispose', () => {
  it('dispose 뒤에는 외부 열기 결과를 토스트로 보이지 않는다', async () => {
    const h = createIssueWebHarness();
    h.linkOpener.result = 'failed';
    h.viewModel.onNavigationRequest(click('https://other.example.test/x'));
    h.viewModel.dispose();
    await flush();
    expect(h.toast.messages).toEqual([]);
  });

  it('dispose 뒤에는 로드 이벤트와 분석도 무시한다', () => {
    const h = createIssueWebHarness();
    h.viewModel.dispose();
    h.viewModel.onScreenShown();
    h.viewModel.onLoadEnd();
    expect(h.analytics.screenNames).toEqual([]);
    expect(h.viewModel.getSnapshot().phase).toBe('loading');
  });
});
