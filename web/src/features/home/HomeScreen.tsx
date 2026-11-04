import { useEffect } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { useContainer } from '../../app/AppContext';
import { HOME_BELOW_STATE, displayPath } from '../../app/paths';
import { t } from '../../copy/ko';
import { webOnlyCopy } from '../../copy/webOnly';
import { useScreenView } from '../../core/analytics/useScreenView';
import { useViewModel } from '../../core/state/useViewModel';
import { AiStartSheet } from '../aireview/AiStartSheet';
import { useShellContext } from '../shell/MainShell';
import type { BannerFeedState } from './BannerFeed';
import { bannerSentinelIndex } from './BannerFeed';
import type { HomeState, HomeViewModel, RankingKey, RankingSection } from './HomeViewModel';
import { LikeButton } from '../like/LikeButton';
import { color, font, radius, space } from '../../design/tokens';
import { Button } from '../../core/ui/Button';
import { Logo } from '../../core/ui/Logo';
import { Skeleton } from '../../core/ui/Skeleton';
import { IcBottomWrite, IcChevronRight, IcNotification, IcRotateRight } from '../../core/ui/icons.generated';
import { useScrollRestore } from '../../core/ui/useScrollRestore';
import { VisibilitySentinel } from '../../core/ui/VisibilitySentinel';
import { RouterHomeNavigator } from './RouterHomeNavigator';
import { formatTopicHeaderDate } from './homeDates';
import type { PostSummary } from './homeModels';
import type { VisibilityObserverFactory } from '../../core/ui/VisibilityObserver';

/**
 * 홈 탭 화면. 로직은 HomeViewModel에 있고 여기서는 그리기만 한다.
 * ViewModel은 컨테이너가 모드별로 보관하므로(REQ-HOME-040) 화면은 붙고 떨어질 뿐이다: 붙으면 이동 수단을 꽂고 onShown(처음이면 전체 로드, 아니면 조용한 갱신),
 * 문서가 다시 보일 때 onShown, 숨겨지거나 떨어지면 onHidden.
 */
export function HomeScreen(): ReactNode {
  const { mode } = useShellContext();
  const container = useContainer();
  const navigate = useNavigate();
  useScreenView('home');
  const { viewModel: vm, navigator } = container.homeSession(mode);

  useEffect(() => {
    const detach = navigator.attach(new RouterHomeNavigator((to, options) => navigate(to, options)));
    void vm.onShown();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') vm.onHidden();
      else void vm.onShown();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      vm.onHidden();
      detach();
    };
  }, [vm, navigator, navigate]);

  return <HomeView vm={vm} mode={mode} />;
}

// 원본 홈(screens-a §7): 화면 좌우 25, 섹션 위 간격은 sm=8 xl=24 xxl=40 토큰.
const sectionStyle = (top: number | string): CSSProperties => ({ padding: `${typeof top === 'number' ? `${top}px` : top} var(--space-screen-horizontal) 0` });
const rowStyle: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 };
const headingStyle: CSSProperties = { margin: 0, ...font('headline'), fontWeight: 700 };
const plainButton: CSSProperties = { border: 0, padding: 0, background: 'none', font: 'inherit', color: 'inherit', cursor: 'pointer', textAlign: 'left' };
const thumbStyle: CSSProperties = { display: 'block', width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', borderRadius: radius.small, background: color.calendarCell };
const placeholderStyle: CSSProperties = { width: '100%', aspectRatio: '1 / 1', borderRadius: radius.small, background: color.calendarCell };
const moreLinkStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 2, minHeight: 44, color: color.textPrimary, textDecoration: 'none', ...font('caption') };
const statusTextStyle: CSSProperties = { color: color.textSecondary, ...font('subheadline'), textAlign: 'center' };
const heroFrame: CSSProperties = { position: 'relative', width: '100%', aspectRatio: '5 / 6', overflow: 'hidden', borderRadius: radius.photoCard, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: space.md, background: color.surface, border: `1px solid ${color.border}` };

function SectionHeader({ title, count, more, children }: { title: string; count?: ReactNode; more?: ReactNode; children?: ReactNode }): ReactNode {
  return (
    <div style={{ ...rowStyle, marginBottom: space.sm }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: space.xs }}>
        <h2 style={headingStyle}>{title}</h2>
        {count}
      </div>
      {more}
      {children}
    </div>
  );
}

function HomeView({ vm, mode }: { vm: HomeViewModel; mode: 'member' | 'guest' }): ReactNode {
  const container = useContainer();
  const state = useViewModel(vm);
  const banners = useViewModel(vm.banners);
  useScrollRestore(state.topic.status !== 'loading');
  return (
    <div data-testid="home.root" data-mode={mode}>
      <TopBar vm={vm} state={state} />
      <div data-testid="home.scroll" style={{ paddingBottom: space.xxl }}>
        {state.refreshing ? (
          <div data-testid="home.refresh-indicator" role="status" aria-busy="true" style={{ height: 3 }}>
            <Skeleton style={{ height: 3, width: '100%' }} />
            <span className="visually-hidden">{webOnlyCopy['home.refresh-indicator']}</span>
          </div>
        ) : null}
        <Header vm={vm} state={state} />
        <Hero vm={vm} state={state} />
        <AiCard vm={vm} state={state} />
        <Weekly vm={vm} state={state} hasAiCard={state.ai.kind !== 'hidden'} />
        <Ranking vm={vm} state={state} which="yesterday" />
        <Ranking vm={vm} state={state} which="popular" />
        <Issues vm={vm} banners={banners} observe={container.visibilityObserver} />
      </div>
    </div>
  );
}

/** 상단 바(원본 HomeTopBar): 높이 55, 로고 + 알림. 배경 background 96% + 하단 구분선. 새로고침은 당겨서 새로고침이 없는 웹의 대체 수단. */
function TopBar({ vm, state }: { vm: HomeViewModel; state: HomeState }): ReactNode {
  return (
    <div
      style={{ position: 'sticky', top: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 'calc(55px + var(--safe-top))', padding: '0 var(--space-screen-horizontal)', paddingTop: 'var(--safe-top)', background: 'rgba(247, 246, 243, 0.96)', borderBottom: `1px solid ${color.border}`, backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
    >
      <div style={{ transform: 'translateY(5px)' }}>
        <Logo />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', marginRight: -10 }}>
        <button type="button" className="ck-icon-btn" aria-label={webOnlyCopy['home.refresh']} disabled={state.refreshing} style={{ opacity: state.refreshing ? 0.4 : 1 }} onClick={() => void vm.refresh()}>
          <IcRotateRight size={22} />
        </button>
        <button type="button" className="ck-icon-btn" data-testid="home.notification-button" aria-label={t('noti.inbox.title')} style={{ position: 'relative' }} onClick={() => vm.onNotificationPress()}>
          <IcNotification size={24} />
          {state.hasUnread ? (
            <span data-testid="home.notification-unread-dot" style={{ position: 'absolute', top: 9, right: 9, width: 7, height: 7, borderRadius: '50%', background: color.inputCursor }} />
          ) : null}
        </button>
      </div>
    </div>
  );
}

function Header({ vm, state }: { vm: HomeViewModel; state: HomeState }): ReactNode {
  const topic = state.topic;
  return (
    <header style={sectionStyle(32)}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: space.sm }}>
        {topic.status === 'ready' && topic.topic ? (
          <div data-testid="home.topic-date" style={{ ...font('subheadline'), color: color.textPrimary }}>
            {t('home.topic.header', { 'M월 d일': formatTopicHeaderDate(topic.topic.topicDate) })}
          </div>
        ) : null}
        <h1 data-testid="home.topic-title" style={{ margin: 0, ...font('title2'), color: topic.status === 'ready' && topic.topic ? color.textPrimary : color.textSecondary }}>
          {topic.status === 'loading' ? t('home.topic.loading') : null}
          {topic.status === 'error' ? t('home.topic.error') : null}
          {topic.status === 'ready' ? (topic.topic ? topic.topic.title : t('home.topic.not-ready')) : null}
        </h1>
        {topic.status === 'error' ? (
          <div>
            <Button variant="outlined" compact data-testid="home.retry-button" onClick={() => void vm.retryTopic()}>
              {t('common.retry')}
            </Button>
          </div>
        ) : null}
      </div>
    </header>
  );
}

function Hero({ vm, state }: { vm: HomeViewModel; state: HomeState }): ReactNode {
  const { hero, topic } = state;
  return (
    <section style={sectionStyle(24)}>
      {hero.kind === 'loading' ? (
        <div data-testid="home.hero-loading" role="status" aria-busy="true" style={{ ...heroFrame, border: 0 }}>
          <Skeleton style={{ position: 'absolute', inset: 0 }} />
          <span style={{ position: 'relative', ...statusTextStyle }}>{t('home.topic.loading')}</span>
        </div>
      ) : null}
      {hero.kind === 'no-open-topic' ? (
        <div data-testid="home.hero-no-open-topic" style={{ ...heroFrame, ...statusTextStyle }}>
          {t('home.hero.no-open-topic')}
        </div>
      ) : null}
      {hero.kind === 'empty' ? (
        <div data-testid="home.hero-empty" style={{ ...heroFrame, gap: space.xl }}>
          <p style={{ ...font('subheadline'), fontWeight: 600, color: color.textPrimary, textAlign: 'center', padding: '0 var(--space-lg)' }}>
            {topic.status === 'ready' && topic.topic ? t('home.hero.empty', { 주제: topic.topic.title }) : topic.status === 'loading' ? t('home.topic.loading') : t('home.hero.no-topic')}
          </p>
          <button type="button" className="ck-press" data-testid="home.hero-upload-button" aria-label={t('nav.tab.upload.a11y')} style={{ ...plainButton, lineHeight: 0, borderRadius: '50%' }} onClick={() => vm.onHeroPress()}>
            <IcBottomWrite size={36} />
          </button>
        </div>
      ) : null}
      {hero.kind === 'processing' ? (
        <div data-testid="home.hero-processing" style={{ ...heroFrame, ...statusTextStyle }}>
          {t('home.hero.processing')}
        </div>
      ) : null}
      {hero.kind === 'photo' ? (
        <div data-testid="home.hero-photo" style={{ ...heroFrame, border: 0, background: color.surfaceElevated }}>
          {hero.thumbnailUrl ? <img src={hero.thumbnailUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} /> : <Skeleton style={{ position: 'absolute', inset: 0 }} />}
          {hero.pending ? (
            <span
              data-testid="home.hero-pending-badge"
              style={{ position: 'absolute', top: space.md, right: space.md, padding: `${space.xs} ${space.md}`, borderRadius: radius.pill, background: color.scrim, color: color.textOnImage, ...font('caption'), fontWeight: 600 }}
            >
              {t('home.hero.pending-badge')}
            </span>
          ) : null}
        </div>
      ) : null}
      {hero.kind === 'error' ? (
        <div style={{ ...heroFrame, gap: space.md }}>
          <p data-testid="home.hero-error" style={statusTextStyle}>{t('home.hero.error')}</p>
          <Button variant="outlined" compact data-testid="home.hero-retry-button" onClick={() => void vm.retryHero()}>
            {t('home.hero.retry')}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

/** AI 피드백 막대 아이콘(원본 ChalkakAudioWaveIcon): 막대 5개 높이 9/15/11/18/8, 폭 2, 간격 2. 움직임 줄이기면 정지(global.css). */
function AudioWave(): ReactNode {
  const heights = [9, 15, 11, 18, 8];
  return (
    <span aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: '50%', background: color.actionPrimary }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, height: 18 }}>
        {heights.map((h, i) => (
          <span key={i} className="ck-wave-bar" style={{ width: 2, height: h, borderRadius: 1, background: color.onActionPrimary, animationDelay: `${i * -0.17}s` }} />
        ))}
      </span>
    </span>
  );
}

/** 원본 HomeFeedbackCard: surfaceElevated, 라운드 18, 테두리 1, 그림자 actionPrimary 8%, 헤더 최소 높이 64, callout semibold. */
const aiCardStyle: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space.sm, width: '100%', minHeight: 64, padding: `0 ${space.sm} 0 ${space.lg}`, color: color.textPrimary, ...font('callout'), fontWeight: 600, textAlign: 'left' };

function AiCard({ vm, state }: { vm: HomeViewModel; state: HomeState }): ReactNode {
  const ai = state.ai;
  if (ai.kind === 'hidden') return null;
  const trailingText: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 2, color: color.textSecondary, ...font('footnote'), fontWeight: 400 };
  return (
    <section data-testid="home.ai-card" style={sectionStyle(16)}>
      <div style={{ overflow: 'hidden', borderRadius: radius.xlarge, background: color.surfaceElevated, border: `1px solid ${color.border}`, boxShadow: 'var(--shadow-card)' }}>
        {ai.status === 'NONE' ? (
          <button type="button" className="ck-press" data-testid="home.ai-request-button" disabled={ai.requesting} style={{ ...plainButton, ...aiCardStyle }} onClick={() => void vm.onAiRequestPress()}>
            <span>{t('ai.card.request')}</span>
            <span aria-hidden="true" style={{ display: 'inline-flex', width: 44, height: 44, alignItems: 'center', justifyContent: 'center', color: color.iconSecondary }}>
              <IcChevronRight size={16} />
            </span>
          </button>
        ) : null}
        {ai.status === 'PROCESSING' ? (
          <div style={aiCardStyle}>
            <p data-testid="home.ai-processing" style={{ margin: 0 }}>{t('ai.card.processing')}</p>
            <AudioWave />
          </div>
        ) : null}
        {ai.status === 'COMPLETED' ? (
          <div style={aiCardStyle}>
            <p data-testid="home.ai-completed" style={{ margin: 0 }}>{t('ai.card.completed')}</p>
            <button type="button" className="ck-press" data-testid="home.ai-detail-button" style={{ ...plainButton, ...trailingText, minHeight: 44, padding: '0 var(--space-xs) 0 var(--space-sm)' }} onClick={() => vm.onAiDetailPress()}>
              {t('ai.card.detail')}
              <IcChevronRight size={16} />
            </button>
          </div>
        ) : null}
        {ai.status === 'FAILED' ? (
          <div style={aiCardStyle}>
            <p data-testid="home.ai-failed" style={{ margin: 0 }}>{t('ai.card.failed')}</p>
            {ai.canRequestAgain ? (
              <button type="button" className="ck-press" data-testid="home.ai-retry-button" disabled={ai.requesting} style={{ ...plainButton, ...trailingText, minHeight: 44, padding: '0 var(--space-md)', color: color.textPrimary, fontWeight: 600 }} onClick={() => void vm.onAiRequestPress()}>
                {t('ai.card.retry')}
              </button>
            ) : null}
          </div>
        ) : null}
        {/* 폴링 창(300초)이 끝났는데도 진행 중이면 안내한다(REQ-AIR-027, REQ-HOME-036). */}
        {ai.status === 'PROCESSING' && ai.stalled ? (
          <p role="status" style={{ padding: `0 ${space.lg} ${space.md}`, color: color.textSecondary, ...font('footnote') }}>
            {t('ai.poll.timeout')}
          </p>
        ) : null}
      </div>
      {state.aiStartSheet ? <AiStartSheet retry={false} onConfirm={() => void vm.confirmAiStart()} onClose={() => vm.closeAiStartSheet()} /> : null}
    </section>
  );
}

/** "10월 27일 화요일"(대기면 뒤에 "대기"). 요일 글자는 일요일 시작 7칸의 순서와 같다. */
function weekDayLabel(date: string, weekday: string, pending: boolean): string {
  const base = `${formatTopicHeaderDate(date)} ${weekday}${webOnlyCopy['home.week.weekday-suffix']}`;
  return pending ? `${base} ${t('home.weekly.pending')}` : base;
}

function Weekly({ vm, state, hasAiCard }: { vm: HomeViewModel; state: HomeState; hasAiCard: boolean }): ReactNode {
  const weekly = state.weekly;
  const labels = [...t('record.weekday')];
  return (
    <section data-testid="home.week-section" style={sectionStyle(hasAiCard ? space.xl : space.xxl)}>
      <SectionHeader
        title={t('home.weekly.title')}
        count={weekly.status === 'ready' ? <span data-testid="home.week-count" style={{ color: color.textSecondary, ...font('caption'), fontWeight: 600 }}>{`${weekly.count}/7`}</span> : null}
        more={
          <button type="button" className="ck-press" aria-label={`${t('home.weekly.title')} ${t('home.weekly.more')}`} style={{ ...plainButton, ...moreLinkStyle }} onClick={() => vm.onWeeklyMorePress()}>
            {t('home.weekly.more')}
            <IcChevronRight size={12} />
          </button>
        }
      />
      {weekly.status === 'loading' ? (
        <div role="status" aria-busy="true" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: space.sm }}>
          {labels.map((label) => (
            <Skeleton key={label} style={{ aspectRatio: '1 / 1', borderRadius: radius.small }} />
          ))}
        </div>
      ) : null}
      {weekly.status === 'error' ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space.md, minHeight: 48 }}>
          <p data-testid="home.week-error" style={{ color: color.textSecondary, ...font('footnote') }}>{t('home.weekly.error')}</p>
          <Button variant="outlined" compact data-testid="home.week-retry-button" onClick={() => void vm.retryWeekly()}>
            {t('common.retry')}
          </Button>
        </div>
      ) : null}
      {weekly.status === 'ready' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: space.sm, textAlign: 'center' }}>
          {labels.map((label) => (
            <span key={label} aria-hidden="true" style={{ color: color.textMuted, ...font('caption') }}>
              {label}
            </span>
          ))}
          {weekly.days.map((day, index) => (
            <button
              key={day.date}
              type="button"
              data-testid={`home.week-day-${day.date}`}
              aria-label={weekDayLabel(day.date, labels[index] ?? '', day.entry?.status === 'PENDING')}
              disabled={!day.entry}
              className="ck-press"
              style={{ ...plainButton, position: 'relative', overflow: 'hidden', aspectRatio: '1 / 1', borderRadius: radius.small, background: color.calendarCell, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', color: color.textSecondary, ...font('caption') }}
              onClick={() => vm.onWeekDayPress(day.date)}
            >
              {day.entry ? null : <span>{Number(day.date.slice(8))}</span>}
              {day.entry ? (
                <span data-testid={`home.week-photo-${day.date}`} style={{ position: 'absolute', inset: 0, display: 'block' }}>
                  {day.entry.thumbnailImageUrl ? <img src={day.entry.thumbnailImageUrl} alt="" style={{ ...thumbStyle, height: '100%', borderRadius: 0 }} /> : <span style={{ ...placeholderStyle, display: 'block', height: '100%', borderRadius: 0 }} />}
                  {day.entry.status === 'PENDING' ? (
                    <small style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '1px 0', background: color.scrim, color: color.textOnImage, textAlign: 'center', ...font('caption'), fontWeight: 600 }}>
                      {t('home.weekly.pending')}
                    </small>
                  ) : null}
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
    likeButton: (id: string) => `home.ranking-like-button-${id}`,
    likeCount: (id: string) => `home.ranking-like-count-${id}`,
  },
  popular: {
    section: 'home.popular-section',
    more: 'home.popular-more-link',
    empty: 'home.popular-empty',
    error: 'home.popular-error',
    retry: 'home.popular-retry-button',
    item: (id: string) => `home.popular-item-${id}`,
    likeButton: (id: string) => `home.popular-like-button-${id}`,
    likeCount: (id: string) => `home.popular-like-count-${id}`,
  },
} as const;

function Ranking({ vm, state, which }: { vm: HomeViewModel; state: HomeState; which: RankingKey }): ReactNode {
  const ids = RANKING_IDS[which];
  const section: RankingSection = state[which];
  const title = which === 'yesterday' ? t('home.ranking.yesterday-title') : t('home.ranking.today-title');
  return (
    <section data-testid={ids.section} style={sectionStyle(space.xxl)}>
      <SectionHeader
        title={title}
        more={
          <Link
            to={displayPath(which === 'yesterday' ? state.yesterdayDate : state.todayDate, 'popular')}
            state={HOME_BELOW_STATE}
            data-testid={ids.more}
            aria-label={`${title} ${webOnlyCopy['home.ranking.more']}`}
            style={moreLinkStyle}
          >
            {webOnlyCopy['home.ranking.more']}
            <IcChevronRight size={12} />
          </Link>
        }
      />
      {section.status === 'loading' ? (
        <div role="status" aria-busy="true" style={{ display: 'flex', gap: space.lg }}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} style={{ flex: 'none', width: 82, height: 82, borderRadius: radius.small }} />
          ))}
        </div>
      ) : null}
      {section.status === 'error' ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space.md, minHeight: 48 }}>
          <p data-testid={ids.error} style={{ color: color.textSecondary, ...font('footnote') }}>{t('home.ranking.error', { '섹션 제목': title })}</p>
          <Button variant="outlined" compact data-testid={ids.retry} onClick={() => void vm.retryRanking(which)}>
            {t('common.retry')}
          </Button>
        </div>
      ) : null}
      {section.status === 'ready' && section.posts.length === 0 ? (
        <p data-testid={ids.empty} style={{ minHeight: 48, display: 'flex', alignItems: 'center', color: color.textSecondary, ...font('footnote') }}>
          {t('home.ranking.empty')}
        </p>
      ) : null}
      {section.status === 'ready' && section.posts.length > 0 ? (
        <ul className="ck-hscroll" style={{ display: 'flex', gap: space.lg, overflowX: 'auto', margin: `0 calc(-1 * var(--space-screen-horizontal))`, padding: `0 var(--space-screen-horizontal)`, listStyle: 'none' }}>
          {section.posts.map((post) => (
            <RankingItem
              key={post.id}
              testId={ids.item(post.id)}
              likeButtonTestId={ids.likeButton(post.id)}
              likeCountTestId={ids.likeCount(post.id)}
              post={post}
              onPress={() => vm.onRankingItemPress(which, post.id)}
              onLikePress={() => void vm.onRankingLikePress(which, post.id)}
            />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function RankingItem({
  testId,
  likeButtonTestId,
  likeCountTestId,
  post,
  onPress,
  onLikePress,
}: {
  testId: string;
  likeButtonTestId: string;
  likeCountTestId: string;
  post: PostSummary;
  onPress: () => void;
  onLikePress: () => void;
}): ReactNode {
  const src = post.thumbnailImageUrl ?? post.originalImageUrl;
  // 원본 랭킹 카드: 82×82, calendarCell, 라운드 small, 눌림 효과 없음.
  return (
    <li style={{ flex: 'none', width: 82 }}>
      <button type="button" data-testid={testId} style={{ ...plainButton, display: 'block', width: 82 }} onClick={onPress}>
        <img src={src} alt={post.title ? '' : webOnlyCopy['home.ranking.photo-alt']} style={{ ...thumbStyle, width: 82, height: 82 }} />
        {post.title ? <span className="visually-hidden">{post.title}</span> : null}
      </button>
      <LikeButton buttonTestId={likeButtonTestId} countTestId={likeCountTestId} isLiked={post.isLiked} likeCount={post.likeCount} size={18} onPress={onLikePress} />
    </li>
  );
}

function Issues({ vm, banners, observe }: { vm: HomeViewModel; banners: BannerFeedState; observe: VisibilityObserverFactory | null }): ReactNode {
  if (banners.status === 'error') {
    return (
      <section style={sectionStyle(space.xxl)}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space.md, minHeight: 44 }}>
          <p data-testid="home.issue-error" style={{ color: color.textSecondary, ...font('subheadline') }}>{t('home.banner.error')}</p>
          <Button variant="outlined" compact data-testid="home.issue-retry-button" onClick={() => void vm.retryBanners()}>
            {t('common.retry')}
          </Button>
        </div>
      </section>
    );
  }
  if (banners.status !== 'ready' || banners.banners.length === 0) return null;
  const sentinelAt = bannerSentinelIndex(banners.banners.length);
  const showSentinel = banners.hasNext && !banners.loadingMore && !banners.moreFailed;
  return (
    <section data-testid="home.issue-section" style={sectionStyle(space.xxl)}>
      <h2 style={{ ...headingStyle, marginBottom: space.lg }}>{t('home.banner.title')}</h2>
      <ul style={{ display: 'flex', flexDirection: 'column', gap: space.xxl, margin: 0, padding: 0, listStyle: 'none' }}>
        {banners.banners.map((banner, index) => (
          <li key={banner.id}>
            {showSentinel && index === sentinelAt ? <VisibilitySentinel key={banners.banners.length} observe={observe} onVisible={() => void vm.onBannerSentinelVisible()} /> : null}
            <BannerCard vm={vm} id={banner.id} title={banner.title} subtitle={banner.subtitle} thumbnailUrl={banner.thumbnailUrl} />
          </li>
        ))}
      </ul>
      {banners.loadingMore ? (
        <div role="status" aria-busy="true" style={{ marginTop: space.xl }}>
          <Skeleton style={{ aspectRatio: '1672 / 941', borderRadius: radius.large, background: color.surfaceElevated }} />
          <span className="visually-hidden">{webOnlyCopy['home.banner.loading-more']}</span>
        </div>
      ) : null}
      {banners.moreFailed ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space.md, marginTop: space.xl }}>
          <span style={{ color: color.textSecondary, ...font('subheadline') }}>{webOnlyCopy['home.banner.more-error']}</span>
          <Button variant="outlined" compact onClick={() => void vm.retryBannerMore()}>
            {t('common.retry')}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function BannerCard({ vm, id, title, subtitle, thumbnailUrl }: { vm: HomeViewModel; id: string; title: string; subtitle: string; thumbnailUrl: string | null }): ReactNode {
  const link = vm.bannerLinkFor(id);
  // 원본 배너: 이미지 aspect 1672/941, surfaceElevated 바탕, 라운드 large. 텍스트는 간격 lg 아래에 sm 간격으로.
  const content = (
    <>
      {thumbnailUrl ? (
        <img src={thumbnailUrl} alt="" loading="lazy" style={{ display: 'block', width: '100%', aspectRatio: '1672 / 941', objectFit: 'cover', borderRadius: radius.large, background: color.surfaceElevated }} />
      ) : (
        <Skeleton style={{ aspectRatio: '1672 / 941', borderRadius: radius.large, background: color.surfaceElevated }} />
      )}
      <span style={{ display: 'flex', flexDirection: 'column', gap: space.sm, marginTop: space.lg }}>
        <strong style={{ display: 'block', ...font('subheadline'), fontWeight: 700, color: color.textPrimary }}>{title}</strong>
        <span style={{ color: color.textSecondary, ...font('caption') }}>{subtitle}</span>
      </span>
    </>
  );
  const testId = `home.issue-item-${id}`;
  if (link?.kind === 'link') {
    // 새 탭은 브라우저가 연다(noopener라 window.open 성공 여부를 알 수 없는 한계를 피한다).
    return (
      <a href={link.href} target="_blank" rel="noopener noreferrer" data-testid={testId} className="ck-press" style={{ display: 'block', color: 'inherit', textDecoration: 'none' }}>
        {content}
      </a>
    );
  }
  // 열 수 없는 주소(방어): 링크가 아니라 안내만 한다.
  return (
    <button type="button" data-testid={testId} className="ck-press" style={{ ...plainButton, width: '100%' }} onClick={() => vm.onBlockedBannerPress()}>
      {content}
    </button>
  );
}
