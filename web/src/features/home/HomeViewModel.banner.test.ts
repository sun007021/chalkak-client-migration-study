import { t } from '../../copy/ko';
import { BANNERS_P1, createHomeHarness, finish } from '../../test/homeHarness';
import { BannerFeed } from './BannerFeed';
import type { Banner } from './homeModels';

const FIRST = '44444444-4444-4444-8444-444444444401';
const SECOND = '44444444-4444-4444-8444-444444444402';

describe('HomeViewModel ISSUE 배너 (Web: 현재 탭 유지, 새 탭으로 열기)', () => {
  it('TC-BANR-012 TC-BANR-019 REQ-BANR-004 배너 카드는 https 주소를 ExternalLinkOpener(새 탭)로 열고 홈 화면은 유지한다', async () => {
    const h = createHomeHarness();
    await finish(h, h.viewModel.onShown());
    expect(h.banners.state.status).toBe('ready');

    h.viewModel.onBannerPress(FIRST);
    h.viewModel.onBannerPress(SECOND);
    expect(h.opener.opened).toEqual(['https://web.example.test/issues/1', 'https://web.example.test/issues/2']);
    expect(h.navigator.calls).toEqual([]); // 이 탭은 이동하지 않는다
    expect(h.toasts.messages).toEqual([]);
  });

  it('목록에 없는 id는 아무 일도 없다', async () => {
    const h = createHomeHarness();
    await finish(h, h.viewModel.onShown());
    h.viewModel.onBannerPress('44444444-4444-4444-8444-4444444444ff');
    expect(h.opener.opened).toEqual([]);
    expect(h.toasts.messages).toEqual([]);
  });

  it('TC-BANR-023 REQ-BANR-020 새 탭을 열지 못하면(팝업 차단 등) "브라우저에서 링크를 열지 못했어요" 토스트를 띄운다', async () => {
    const h = createHomeHarness();
    await finish(h, h.viewModel.onShown());
    h.opener.result = false;
    h.viewModel.onBannerPress(FIRST);
    expect(h.toasts.messages).toEqual([t('banner.web.open-failed')]);
    h.opener.result = 'throw';
    h.viewModel.onBannerPress(FIRST);
    expect(h.toasts.messages).toEqual([t('banner.web.open-failed'), t('banner.web.open-failed')]); // 같은 문구도 다시 뜬다(D-20)
  });

  it('TC-BANR-017 REQ-BANR-013 https가 아닌 주소가 목록에 들어와도 열지 않고 "링크를 열 수 없어요"를 보인다(방어)', async () => {
    class InsecureFeed extends BannerFeed {
      override load(): Promise<void> {
        const banner: Banner = { id: FIRST, title: '이슈', subtitle: '부제', webViewUrl: 'http://web.example.test/issues/1', thumbnailUrl: null, createdAt: 0 };
        this.setState({ status: 'ready', banners: [banner], hasNext: false, loadingMore: false, nextPage: 2 });
        return Promise.resolve();
      }
    }
    const h = createHomeHarness({ bannerFeed: (repository) => new InsecureFeed({ repository }) });
    await finish(h, h.viewModel.onShown());
    h.viewModel.onBannerPress(FIRST);
    expect(h.opener.opened).toEqual([]);
    expect(h.toasts.messages).toEqual([t('banner.web.link-unavailable')]);
  });

  it('REQ-BANR-006 최초 배너 실패는 banners 오류이고 다른 섹션은 정상이다. retryBanners는 배너만 다시 부른다', async () => {
    const h = createHomeHarness();
    h.router.set(BANNERS_P1, 'banner/banners__500-server-error');
    await finish(h, h.viewModel.onShown());
    expect(h.banners.state).toEqual({ status: 'error' });
    expect(h.viewModel.state.hero.kind).toBe('photo');
    expect(h.viewModel.state.popular.status).toBe('ready');

    h.router.set(BANNERS_P1, 'banner/banners__page1-10');
    const before = h.ff.calls.length;
    await finish(h, h.viewModel.retryBanners());
    expect(h.banners.state.status).toBe('ready');
    expect(h.ff.calls.length - before).toBe(1);
  });

  it('TC-BANR-010 REQ-BANR-005 빈 응답이면 ready + 빈 목록이라 섹션이 숨겨진다(오류 아님)', async () => {
    const h = createHomeHarness();
    h.router.set(BANNERS_P1, 'banner/banners__empty');
    await finish(h, h.viewModel.onShown());
    expect(h.banners.state).toMatchObject({ status: 'ready', banners: [] });
  });
});
