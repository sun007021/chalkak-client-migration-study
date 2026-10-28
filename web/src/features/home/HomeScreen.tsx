import { useCallback, useEffect, useRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useContainer } from '../../app/AppContext';
import { t } from '../../copy/ko';
import { webOnlyCopy } from '../../copy/webOnly';
import { useScreenView } from '../../core/analytics/useScreenView';
import { useOwnedViewModel } from '../../core/state/useOwnedViewModel';
import { useViewModel } from '../../core/state/useViewModel';
import { useShellContext } from '../shell/MainShell';
import type { BannerFeedState } from './BannerFeed';
import type { HomeState, HomeViewModel, RankingKey, RankingSection } from './HomeViewModel';
import { RouterHomeNavigator } from './RouterHomeNavigator';
import type { NavigateFn } from './RouterHomeNavigator';
import { formatTopicHeaderDate } from './homeDates';
import type { Banner, PostSummary } from './homeModels';

/** 홈 탭 화면. 로직은 HomeViewModel에 있고 여기서는 그리기만 한다. 마운트마다 새 ViewModel을 만들고 문서가 다시 보일 때 갱신한다. */
export function HomeScreen(): ReactNode {
  const { mode } = useShellContext();
  const container = useContainer();
  const navigate = useNavigate();
  const navigateRef = useRef<NavigateFn>(navigate);
  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);
  useScreenView('home');

  const create = useCallback(
    () => container.createHomeViewModel(mode, new RouterHomeNavigator((to, options) => navigateRef.current(to, options))),
    [container, mode],
  );
  const vm = useOwnedViewModel(create);

  useEffect(() => {
    if (!vm) return;
    void vm.onShown();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') vm.onHidden();
      else void vm.onShown();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [vm]);

  return vm ? <HomeView vm={vm} mode={mode} /> : null;
}

const sectionStyle: CSSProperties = { padding: '12px 16px' };
const rowStyle: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 };
const headingStyle: CSSProperties = { margin: 0, fontSize: 18 };
const plainButton: CSSProperties = { border: 0, padding: 0, background: 'none', font: 'inherit', color: 'inherit', cursor: 'pointer', textAlign: 'left' };
const thumbStyle: CSSProperties = { display: 'block', width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', borderRadius: 8, background: '#e5e5e5' };
const placeholderStyle: CSSProperties = { width: '100%', aspectRatio: '1 / 1', borderRadius: 8, background: '#e5e5e5' };

function HomeView({ vm, mode }: { vm: HomeViewModel; mode: 'member' | 'guest' }): ReactNode {
  const state = useViewModel(vm);
  const banners = useViewModel(vm.banners);
  return (
    <div data-testid="home.root" data-mode={mode}>
      <div data-testid="home.scroll">
        <Header vm={vm} state={state} />
        {state.refreshing ? (
          <div data-testid="home.refresh-indicator" role="status" aria-busy="true" style={{ height: 3, background: '#111' }} />
        ) : null}
        <Hero vm={vm} state={state} />
        <AiCard vm={vm} state={state} />
        <Weekly vm={vm} state={state} />
        <Ranking vm={vm} state={state} which="yesterday" />
        <Ranking vm={vm} state={state} which="popular" />
        <Issues vm={vm} banners={banners} />
      </div>
    </div>
  );
}

function Header({ vm, state }: { vm: HomeViewModel; state: HomeState }): ReactNode {
  const topic = state.topic;
  return (
    <header style={sectionStyle}>
      <div style={rowStyle}>
        <div>
          {topic.status === 'ready' && topic.topic ? (
            <div data-testid="home.topic-date">{t('home.topic.header', { 'M월 d일': formatTopicHeaderDate(topic.topic.topicDate) })}</div>
          ) : null}
          <h1 data-testid="home.topic-title" style={headingStyle}>
            {topic.status === 'loading' ? t('home.topic.loading') : null}
            {topic.status === 'error' ? t('home.topic.error') : null}
            {topic.status === 'ready' ? (topic.topic ? topic.topic.title : t('home.topic.not-ready')) : null}
          </h1>
          {topic.status === 'error' ? (
            <button type="button" data-testid="home.retry-button" onClick={() => void vm.retryTopic()}>
              {t('common.retry')}
            </button>
          ) : null}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" aria-label={webOnlyCopy['home.refresh']} disabled={state.refreshing} onClick={() => void vm.refresh()}>
            <span aria-hidden="true">↻</span>
          </button>
          <button type="button" data-testid="home.notification-button" aria-label={t('noti.inbox.title')} style={{ position: 'relative' }} onClick={() => vm.onNotificationPress()}>
            <span aria-hidden="true">🔔</span>
            {state.hasUnread ? (
              <span data-testid="home.notification-unread-dot" style={{ position: 'absolute', top: 0, right: 0, width: 8, height: 8, borderRadius: 4, background: '#e53935' }} />
            ) : null}
          </button>
        </div>
      </div>
    </header>
  );
}

function Hero({ vm, state }: { vm: HomeViewModel; state: HomeState }): ReactNode {
  const { hero, topic } = state;
  return (
    <section style={sectionStyle}>
      {hero.kind === 'loading' ? (
        <div data-testid="home.hero-loading" role="status" aria-busy="true">
          {t('home.topic.loading')}
        </div>
      ) : null}
      {hero.kind === 'no-open-topic' ? <div data-testid="home.hero-no-open-topic">{t('home.hero.no-open-topic')}</div> : null}
      {hero.kind === 'empty' ? (
        <div data-testid="home.hero-empty">
          <p>{topic.status === 'ready' && topic.topic ? t('home.hero.empty', { 주제: topic.topic.title }) : topic.status === 'loading' ? t('home.topic.loading') : t('home.hero.no-topic')}</p>
          <button type="button" data-testid="home.hero-upload-button" onClick={() => vm.onHeroPress()}>
            {t('nav.tab.upload.a11y')}
          </button>
        </div>
      ) : null}
      {hero.kind === 'processing' ? <div data-testid="home.hero-processing">{t('home.hero.processing')}</div> : null}
      {hero.kind === 'photo' ? (
        <div data-testid="home.hero-photo" style={{ position: 'relative' }}>
          {hero.thumbnailUrl ? <img src={hero.thumbnailUrl} alt="" style={thumbStyle} /> : <div style={placeholderStyle} />}
          {hero.pending ? (
            <span data-testid="home.hero-pending-badge" style={{ position: 'absolute', top: 8, left: 8, padding: '2px 8px', borderRadius: 8, background: '#111', color: '#fff', fontSize: 12 }}>
              {t('home.hero.pending-badge')}
            </span>
          ) : null}
        </div>
      ) : null}
      {hero.kind === 'error' ? (
        <div>
          <p data-testid="home.hero-error">{t('home.hero.error')}</p>
          <button type="button" data-testid="home.hero-retry-button" onClick={() => void vm.retryHero()}>
            {t('home.hero.retry')}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function AiCard({ vm, state }: { vm: HomeViewModel; state: HomeState }): ReactNode {
  const ai = state.ai;
  if (ai.kind === 'hidden') return null;
  return (
    <section data-testid="home.ai-card" style={sectionStyle}>
      {ai.status === 'NONE' ? (
        <button type="button" data-testid="home.ai-request-button" disabled={ai.requesting} onClick={() => void vm.onAiRequestPress()}>
          {t('ai.card.request')}
        </button>
      ) : null}
      {ai.status === 'PROCESSING' ? <p data-testid="home.ai-processing">{t('ai.card.processing')}</p> : null}
      {ai.status === 'COMPLETED' ? (
        <div>
          <p data-testid="home.ai-completed">{t('ai.card.completed')}</p>
          <button type="button" data-testid="home.ai-detail-button" onClick={() => vm.onAiDetailPress()}>
            {t('ai.card.detail')}
          </button>
        </div>
      ) : null}
      {ai.status === 'FAILED' ? (
        <div>
          <p data-testid="home.ai-failed">{t('ai.card.failed')}</p>
          {ai.canRequestAgain ? (
            <button type="button" data-testid="home.ai-retry-button" disabled={ai.requesting} onClick={() => void vm.onAiRequestPress()}>
              {t('ai.card.retry')}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function Weekly({ vm, state }: { vm: HomeViewModel; state: HomeState }): ReactNode {
  const weekly = state.weekly;
  const labels = [...t('record.weekday')];
  return (
    <section data-testid="home.week-section" style={sectionStyle}>
      <div style={rowStyle}>
        <h2 style={headingStyle}>{t('home.weekly.title')}</h2>
        {weekly.status === 'ready' ? <span data-testid="home.week-count">{`${weekly.count}/7`}</span> : null}
        <button type="button" style={plainButton} onClick={() => vm.onWeeklyMorePress()}>
          {t('home.weekly.more')}
        </button>
      </div>
      {weekly.status === 'error' ? (
        <div>
          <p data-testid="home.week-error">{t('home.weekly.error')}</p>
          <button type="button" data-testid="home.week-retry-button" onClick={() => void vm.retryWeekly()}>
            {t('common.retry')}
          </button>
        </div>
      ) : null}
      {weekly.status === 'ready' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, textAlign: 'center' }}>
          {labels.map((label) => (
            <span key={label} aria-hidden="true">
              {label}
            </span>
          ))}
          {weekly.days.map((day) => (
            <button key={day.date} type="button" data-testid={`home.week-day-${day.date}`} disabled={!day.entry} style={{ ...plainButton, textAlign: 'center' }} onClick={() => vm.onWeekDayPress(day.date)}>
              <span>{Number(day.date.slice(8))}</span>
              {day.entry ? (
                <span data-testid={`home.week-photo-${day.date}`} style={{ display: 'block' }}>
                  {day.entry.thumbnailImageUrl ? <img src={day.entry.thumbnailImageUrl} alt="" style={thumbStyle} /> : <span style={{ ...placeholderStyle, display: 'block' }} />}
                  {day.entry.status === 'PENDING' ? <small>{t('home.weekly.pending')}</small> : null}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

// check-testids가 리터럴을 찾으므로 어제 랭킹/오늘 인기의 식별자는 맵으로 둔다.
const RANKING_IDS = {
  yesterday: {
    section: 'home.ranking-section',
    more: 'home.ranking-more-link',
    empty: 'home.ranking-empty',
    error: 'home.ranking-error',
    retry: 'home.ranking-retry-button',
    item: (id: string) => `home.ranking-item-${id}`,
  },
  popular: {
    section: 'home.popular-section',
    more: 'home.popular-more-link',
    empty: 'home.popular-empty',
    error: 'home.popular-error',
    retry: 'home.popular-retry-button',
    item: (id: string) => `home.popular-item-${id}`,
  },
} as const;

function Ranking({ vm, state, which }: { vm: HomeViewModel; state: HomeState; which: RankingKey }): ReactNode {
  const ids = RANKING_IDS[which];
  const section: RankingSection = state[which];
  const title = which === 'yesterday' ? t('home.ranking.yesterday-title') : t('home.ranking.today-title');
  return (
    <section data-testid={ids.section} style={sectionStyle}>
      <div style={rowStyle}>
        <h2 style={headingStyle}>{title}</h2>
        <button type="button" data-testid={ids.more} style={plainButton} onClick={() => vm.onRankingMorePress(which)}>
          {webOnlyCopy['home.ranking.more']}
        </button>
      </div>
      {section.status === 'loading' ? <div role="status" aria-busy="true" /> : null}
      {section.status === 'error' ? (
        <div>
          <p data-testid={ids.error}>{t('home.ranking.error', { '섹션 제목': title })}</p>
          <button type="button" data-testid={ids.retry} onClick={() => void vm.retryRanking(which)}>
            {t('common.retry')}
          </button>
        </div>
      ) : null}
      {section.status === 'ready' && section.posts.length === 0 ? <p data-testid={ids.empty}>{t('home.ranking.empty')}</p> : null}
      {section.status === 'ready' && section.posts.length > 0 ? (
        <ul style={{ display: 'flex', gap: 8, overflowX: 'auto', margin: 0, padding: 0, listStyle: 'none' }}>
          {section.posts.map((post) => (
            <RankingItem key={post.id} testId={ids.item(post.id)} post={post} onPress={() => vm.onRankingItemPress(which, post.id)} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function RankingItem({ testId, post, onPress }: { testId: string; post: PostSummary; onPress: () => void }): ReactNode {
  const src = post.thumbnailImageUrl ?? post.originalImageUrl;
  return (
    <li style={{ flex: '0 0 40%' }}>
      <button type="button" data-testid={testId} style={{ ...plainButton, width: '100%' }} onClick={onPress}>
        <img src={src} alt={post.title ?? ''} style={thumbStyle} />
        {post.title ? <span>{post.title}</span> : null}
      </button>
    </li>
  );
}

function Issues({ vm, banners }: { vm: HomeViewModel; banners: BannerFeedState }): ReactNode {
  if (banners.status === 'error') {
    return (
      <section style={sectionStyle}>
        <p data-testid="home.issue-error">{t('home.banner.error')}</p>
        <button type="button" data-testid="home.issue-retry-button" onClick={() => void vm.retryBanners()}>
          {t('common.retry')}
        </button>
      </section>
    );
  }
  if (banners.status !== 'ready' || banners.banners.length === 0) return null;
  return (
    <section data-testid="home.issue-section" style={sectionStyle}>
      <h2 style={headingStyle}>{t('home.banner.title')}</h2>
      <BannerStrip vm={vm} banners={banners.banners} />
    </section>
  );
}

/** 가로로 넘기는 배너 목록. 오른쪽 끝에서 두 번째 카드가 보이면 다음 페이지를 미리 읽는다(REQ-BANR-007). */
function BannerStrip({ vm, banners }: { vm: HomeViewModel; banners: Banner[] }): ReactNode {
  const listRef = useRef<HTMLUListElement | null>(null);
  const reportVisible = useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    const right = list.scrollLeft + list.clientWidth;
    let last = 0;
    Array.from(list.children).forEach((child, index) => {
      if ((child as HTMLElement).offsetLeft < right) last = index;
    });
    void vm.onBannerLastVisibleIndexChanged(last);
  }, [vm]);
  return (
    <ul ref={listRef} onScroll={reportVisible} style={{ display: 'flex', gap: 8, overflowX: 'auto', margin: 0, padding: 0, listStyle: 'none' }}>
      {banners.map((banner) => (
        <li key={banner.id} style={{ flex: '0 0 70%' }}>
          <button type="button" data-testid={`home.issue-item-${banner.id}`} style={{ ...plainButton, width: '100%' }} onClick={() => vm.onBannerPress(banner.id)}>
            {banner.thumbnailUrl ? <img src={banner.thumbnailUrl} alt="" style={thumbStyle} /> : <span style={{ ...placeholderStyle, display: 'block' }} />}
            <strong style={{ display: 'block' }}>{banner.title}</strong>
            <span>{banner.subtitle}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
