import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useContainer } from '../../app/AppContext';
import { t } from '../../copy/ko';
import { webOnlyCopy } from '../../copy/webOnly';
import { useScreenView } from '../../core/analytics/useScreenView';
import { useViewModel } from '../../core/state/useViewModel';
import { EmptyState, ErrorState, LoadingIndicator } from '../../core/ui/StateViews';
import { useScrollRestore } from '../../core/ui/useScrollRestore';
import type { DateString } from '../../core/time/kst';
import { formatTopicHeaderDate } from '../home/homeDates';
import { VisibilitySentinel } from '../home/HomeScreen';
import { LikeButton } from '../like/LikeButton';
import type { PostItem } from '../post/postModels';
import { RouterPostNavigator } from '../post/postNavigation';
import { useShellContext } from '../shell/MainShell';
import { DISPLAY_SORTS, displaySentinelIndex, normalizePickedDate, parseDisplayRoute, pickerOptions, toPickedDate } from './displayDates';
import type { DisplaySort, PickedDate } from './displayDates';
import type { DisplayState, DisplayViewModel } from './DisplayViewModel';

/**
 * 전시 탭 화면. 로직은 DisplayViewModel에 있고 여기서는 그리기만 한다.
 * ViewModel은 컨테이너가 모드별로 보관하므로(REQ-DISP 세션) 화면은 붙고 떨어질 뿐이다: 붙으면 이동 수단을 꽂고 URL의 date·sort를 반영해 onShown,
 * 문서가 다시 보이면 onShown, 숨겨지거나 떨어지면 onHidden. 상태가 바뀌면 URL의 date·sort를 replace로 맞춘다(state는 그대로 넘긴다).
 */
export function DisplayScreen(): ReactNode {
  const { mode, shell } = useShellContext();
  const container = useContainer();
  const navigate = useNavigate();
  const location = useLocation();
  useScreenView('display');
  const { viewModel: vm, navigator } = container.displaySession(mode);
  const latest = useRef(location);
  useEffect(() => {
    latest.current = location;
  }, [location]);

  // URL → 상태(마운트, Link·주소 변경). 같은 값이면 ViewModel이 아무 일도 하지 않는다.
  useEffect(() => {
    void vm.applyRoute(parseDisplayRoute(location.search));
  }, [vm, location.search]);

  useEffect(() => {
    const detach = navigator.attach(new RouterPostNavigator((to, options) => navigate(to, options)));
    void vm.onShown();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') vm.onHidden();
      else void vm.onShown();
    };
    document.addEventListener('visibilitychange', onVisibility);
    const offReselect = shell.subscribeReselect((tab) => {
      if (tab === 'display') void vm.onTabReselect();
    });
    return () => {
      offReselect();
      document.removeEventListener('visibilitychange', onVisibility);
      vm.onHidden();
      detach();
    };
  }, [vm, navigator, navigate, shell]);

  const state = useViewModel(vm);

  // 상태 → URL. 기본값(오늘, 최신순)은 파라미터가 없는 URL과 같은 뜻이라 쓰지 않는다.
  // 같은 커밋에서 applyRoute가 막 바꾼 값을 되돌리지 않도록 렌더 시점의 state가 아니라 ViewModel의 지금 값을 읽는다.
  useEffect(() => {
    const { date, sort, today } = vm.state;
    const now = latest.current;
    const route = parseDisplayRoute(now.search);
    if ((route.date ?? today) === date && (route.sort ?? 'recent') === sort) return;
    const params = new URLSearchParams(now.search);
    params.set('date', date);
    params.set('sort', sort);
    void navigate({ pathname: now.pathname, search: `?${params.toString()}` }, { replace: true, state: now.state });
  }, [vm, state.date, state.sort, state.today, navigate]);

  // 탭 재선택: 맨 위로.
  const seenScrollToTop = useRef(state.scrollToTop);
  useEffect(() => {
    if (state.scrollToTop === seenScrollToTop.current) return;
    seenScrollToTop.current = state.scrollToTop;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [state.scrollToTop]);

  useScrollRestore(state.body.status === 'ready');

  return <DisplayView vm={vm} state={state} />;
}

const rowStyle: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 };
const plainButton: CSSProperties = { border: 0, padding: 0, background: 'none', font: 'inherit', color: 'inherit', cursor: 'pointer', textAlign: 'left' };
const thumbStyle: CSSProperties = { display: 'block', width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', borderRadius: 8, background: '#e5e5e5' };

function DisplayView({ vm, state }: { vm: DisplayViewModel; state: DisplayState }): ReactNode {
  const { body } = state;
  return (
    <div data-testid="display.root">
      <DateHeader vm={vm} state={state} />
      {body.status === 'ready' ? <Description archive={state.archive} /> : null}
      {body.status === 'ready' && !state.archive ? <SortTabs vm={vm} state={state} /> : null}
      {body.status === 'ready' && body.refreshing ? (
        <div data-testid="display.refresh-indicator" role="status" aria-busy="true" style={{ padding: '4px 16px', fontSize: 12, background: '#f2f2f2' }}>
          {webOnlyCopy['display.refresh-indicator']}
        </div>
      ) : null}
      {body.status === 'loading' ? <LoadingIndicator screenId="display" /> : null}
      {body.status === 'empty' ? <EmptyState screenId="display">{t('display.empty')}</EmptyState> : null}
      {body.status === 'error' ? <ErrorState screenId="display" message={body.network ? t('common.error.network') : t('display.error')} onRetry={() => void vm.retry()} /> : null}
      {body.status === 'ready' ? <Featured vm={vm} state={state} items={body.featured} /> : null}
      {body.status === 'ready' ? <Grid vm={vm} posts={body.posts} hasNext={body.hasNext} paging={body.paging} refreshing={body.refreshing} pageFailures={body.pageFailures} /> : null}
    </div>
  );
}

function DateHeader({ vm, state }: { vm: DisplayViewModel; state: DisplayState }): ReactNode {
  const [pickerOpen, setPickerOpen] = useState(false);
  const title = state.body.status === 'ready' ? state.body.topicTitle : '';
  return (
    <header style={{ padding: '12px 16px' }}>
      <div style={rowStyle}>
        <button type="button" data-testid="display.prev-date-button" aria-label={t('display.nav.previous')} disabled={!state.canGoPrevious} onClick={() => void vm.selectPreviousDate()}>
          <span aria-hidden="true">‹</span>
        </button>
        <button type="button" data-testid="display.date-picker-button" aria-label={t('display.picker.title')} style={plainButton} onClick={() => setPickerOpen(true)}>
          <span data-testid="display.date-label">{formatTopicHeaderDate(state.date)}</span>
        </button>
        <button type="button" data-testid="display.next-date-button" aria-label={t('display.nav.next')} disabled={!state.canGoNext} onClick={() => void vm.selectNextDate()}>
          <span aria-hidden="true">›</span>
        </button>
      </div>
      <h1 data-testid="display.topic-title" style={{ margin: '8px 0 0', fontSize: 20 }}>
        {title}
      </h1>
      {pickerOpen ? (
        <DatePickerSheet
          current={state.date}
          today={state.today}
          onConfirm={(date) => {
            setPickerOpen(false);
            void vm.selectDate(date);
          }}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}
    </header>
  );
}

function Description({ archive }: { archive: boolean }): ReactNode {
  return (
    <p data-testid="display.description" style={{ margin: '0 16px 8px' }}>
      {archive ? t('display.header.desc-archive') : t('display.header.desc-latest')}
    </p>
  );
}

// check-testids가 리터럴을 찾으므로 정렬 탭의 식별자와 문구는 맵으로 둔다.
const SORT_TAB_IDS: Readonly<Record<DisplaySort, string>> = {
  recent: 'display.sort-recent-tab',
  popular: 'display.sort-popular-tab',
  random: 'display.sort-random-tab',
};
const SORT_LABELS: Readonly<Record<DisplaySort, string>> = {
  recent: t('display.sort.recent'),
  popular: t('display.sort.popular'),
  random: t('display.sort.random'),
};

function SortTabs({ vm, state }: { vm: DisplayViewModel; state: DisplayState }): ReactNode {
  return (
    <div role="tablist" style={{ display: 'flex', gap: 8, padding: '0 16px 8px' }}>
      {DISPLAY_SORTS.map((sort) => (
        <button
          key={sort}
          type="button"
          role="tab"
          data-testid={SORT_TAB_IDS[sort]}
          aria-selected={state.sort === sort}
          style={{ ...plainButton, fontWeight: state.sort === sort ? 700 : 400 }}
          onClick={() => void vm.selectSort(sort)}
        >
          {SORT_LABELS[sort]}
        </button>
      ))}
    </div>
  );
}

function Featured({ vm, state, items }: { vm: DisplayViewModel; state: DisplayState; items: PostItem[] }): ReactNode {
  const ref = useRef<HTMLDivElement | null>(null);
  const page = state.featuredPage;
  // 보던 페이지로 되돌린다(같은 날짜를 다시 불러와도 유지, 다른 날짜는 0).
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && typeof el.scrollTo === 'function' && el.clientWidth > 0) el.scrollTo({ left: page * el.clientWidth });
  }, [page, items.length]);
  if (items.length === 0) return null;
  return (
    <section aria-label={webOnlyCopy['display.featured.a11y']} style={{ padding: '0 16px' }}>
      <div
        ref={ref}
        data-testid="display.featured-pager"
        style={{ display: 'flex', overflowX: 'auto', scrollSnapType: 'x mandatory', gap: 8 }}
        onScroll={(event) => {
          const el = event.currentTarget;
          if (el.clientWidth <= 0) return;
          const next = Math.round(el.scrollLeft / el.clientWidth);
          if (next !== page && next >= 0 && next < items.length) vm.setFeaturedPage(next);
        }}
      >
        {items.map((post) => (
          <div key={post.id} style={{ flex: '0 0 100%', scrollSnapAlign: 'start' }}>
            <button type="button" data-testid={`display.featured-item-${post.id}`} style={{ ...plainButton, width: '100%' }} onClick={() => vm.onPostPress(post.id)}>
              <Photo post={post} />
            </button>
            <LikeButton
              buttonTestId={`display.featured-like-button-${post.id}`}
              countTestId={`display.featured-like-count-${post.id}`}
              isLiked={post.isLiked}
              likeCount={post.likeCount}
              onPress={() => void vm.onLikePress(post.id)}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

function Photo({ post }: { post: PostItem }): ReactNode {
  return (
    <>
      <img src={post.thumbnailImageUrl ?? post.originalImageUrl} alt={post.title ? '' : webOnlyCopy['display.photo-alt']} style={thumbStyle} />
      {post.title ? <span>{post.title}</span> : null}
    </>
  );
}

function Grid({
  vm,
  posts,
  hasNext,
  paging,
  refreshing,
  pageFailures,
}: {
  vm: DisplayViewModel;
  posts: PostItem[];
  hasNext: boolean;
  paging: boolean;
  refreshing: boolean;
  pageFailures: number;
}): ReactNode {
  const { visibilityObserver } = useContainer();
  const sentinelAt = displaySentinelIndex(posts.length);
  const showSentinel = hasNext && !paging && !refreshing;
  return (
    <section style={{ padding: '8px 16px' }}>
      <ul data-testid="display.grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, margin: 0, padding: 0, listStyle: 'none' }}>
        {posts.map((post, index) => (
          <li key={post.id}>
            <button type="button" data-testid={`display.item-${post.id}`} style={{ ...plainButton, width: '100%' }} onClick={() => vm.onPostPress(post.id)}>
              <Photo post={post} />
              {showSentinel && index === sentinelAt ? (
                // 목록이 늘거나 다음 페이지가 실패할 때마다 새로 세워 다시 보이면 요청하게 한다.
                <VisibilitySentinel key={`${posts.length}:${pageFailures}`} observe={visibilityObserver} onVisible={() => void vm.onSentinelVisible()} />
              ) : null}
            </button>
            <LikeButton
              buttonTestId={`display.like-button-${post.id}`}
              countTestId={`display.like-count-${post.id}`}
              isLiked={post.isLiked}
              likeCount={post.likeCount}
              onPress={() => void vm.onLikePress(post.id)}
            />
          </li>
        ))}
      </ul>
      {paging ? (
        <p data-testid="display.load-more-indicator" role="status" aria-busy="true">
          {webOnlyCopy['display.load-more']}
        </p>
      ) : null}
    </section>
  );
}

/** 연·월·일 select 세 개와 확인 버튼. 연·월을 바꾸면 선택 가능한 범위에 맞춘다(2월 30일 → 말일 등). */
function DatePickerSheet({ current, today, onConfirm, onClose }: { current: DateString; today: DateString; onConfirm: (date: DateString) => void; onClose: () => void }): ReactNode {
  const [picked, setPicked] = useState<PickedDate>(() => toPickedDate(current) ?? { year: 2026, month: 1, day: 1 });
  const options = pickerOptions(picked, today);
  const change = (patch: Partial<PickedDate>) => {
    const next = toPickedDate(normalizePickedDate({ ...picked, ...patch }, today));
    if (next) setPicked(next);
  };
  return (
    <div data-testid="display.date-picker-sheet" role="dialog" aria-modal="true" aria-label={t('display.picker.title')} style={{ padding: 12, background: '#fff', border: '1px solid #e5e5e5', borderRadius: 8 }}>
      <h2 style={{ margin: '0 0 8px', fontSize: 16 }}>{t('display.picker.title')}</h2>
      <div style={{ display: 'flex', gap: 8 }}>
        <select data-testid="display.date-picker-year" aria-label={t('display.picker.year', { n: '' }).trim()} value={picked.year} onChange={(e) => change({ year: Number(e.target.value) })}>
          {options.years.map((year) => (
            <option key={year} value={year}>
              {t('display.picker.year', { n: year })}
            </option>
          ))}
        </select>
        <select data-testid="display.date-picker-month" aria-label={t('display.picker.month', { n: '' }).trim()} value={picked.month} onChange={(e) => change({ month: Number(e.target.value) })}>
          {options.months.map((month) => (
            <option key={month} value={month}>
              {t('display.picker.month', { n: month })}
            </option>
          ))}
        </select>
        <select data-testid="display.date-picker-day" aria-label={t('display.picker.day', { n: '' }).trim()} value={picked.day} onChange={(e) => change({ day: Number(e.target.value) })}>
          {options.days.map((day) => (
            <option key={day} value={day}>
              {t('display.picker.day', { n: day })}
            </option>
          ))}
        </select>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button type="button" onClick={onClose}>
          {t('common.close')}
        </button>
        <button type="button" data-testid="display.date-picker-confirm-button" onClick={() => onConfirm(normalizePickedDate(picked, today))}>
          {t('common.confirm')}
        </button>
      </div>
    </div>
  );
}
