import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useContainer } from '../../app/AppContext';
import { FIRST_TOPIC_DATE } from '../../constants';
import { t } from '../../copy/ko';
import { webOnlyCopy } from '../../copy/webOnly';
import { useScreenView } from '../../core/analytics/useScreenView';
import { useViewModel } from '../../core/state/useViewModel';
import { EmptyState, ErrorState, LoadingIndicator } from '../../core/ui/StateViews';
import { useDialogFocus } from '../../core/ui/useDialogFocus';
import { useScrollRestore } from '../../core/ui/useScrollRestore';
import type { DateString } from '../../core/time/kst';
import { formatTopicHeaderDate } from '../home/homeDates';
import { VisibilitySentinel } from '../home/HomeScreen';
import { LikeButton } from '../like/LikeButton';
import type { PostItem } from '../post/postModels';
import { RouterPostNavigator } from '../post/postNavigation';
import { useShellContext } from '../shell/MainShell';
import { useDisplayUrlSync } from './useDisplayUrlSync';
import { DISPLAY_SORTS, displaySentinelIndex, normalizePickedDate, pickerOptions, toPickedDate } from './displayDates';
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
  useScreenView('display');
  const { viewModel: vm, navigator } = container.displaySession(mode);

  // URL ↔ 상태(마운트, Link·주소 변경, 날짜·정렬 선택). applyRoute가 먼저 돌도록 라이프사이클 효과보다 앞에 둔다.
  const state = useViewModel(vm);
  useDisplayUrlSync(vm, state);

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
        <button type="button" data-testid="display.date-picker-button" aria-label={`${formatTopicHeaderDate(state.date)} ${t('display.picker.title')}`} style={plainButton} onClick={() => setPickerOpen(true)}>
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

/** 두 값이 이 거리(px) 안이면 같은 위치로 본다. */
const SNAP_EPSILON = 2;

function Featured({ vm, state, items }: { vm: DisplayViewModel; state: DisplayState; items: PostItem[] }): ReactNode {
  const ref = useRef<HTMLDivElement | null>(null);
  const page = state.featuredPage;
  /** 프로그램이 시작한 스크롤의 도착 위치. 도착하기 전의 중간 scroll 이벤트가 페이지를 되돌려 놓지 않게 한다. */
  const target = useRef<number | null>(null);
  const last = items.length - 1;

  const scrollToPage = useCallback((next: number, smooth: boolean) => {
    const el = ref.current;
    if (!el || el.clientWidth <= 0 || typeof el.scrollTo !== 'function') return;
    target.current = next * el.clientWidth;
    el.scrollTo({ left: target.current, behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  // 상태가 바깥에서 바뀐 경우(다른 날짜로 가면 0)에만 스크롤한다. 사용자가 넘기는 중에는 위치와 page의 차이가 반 페이지 이내라 건드리지 않는다.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || el.clientWidth <= 0) return;
    if (Math.abs(el.scrollLeft - page * el.clientWidth) > el.clientWidth / 2) scrollToPage(page, false);
  }, [page, items.length, scrollToPage]);

  // 스크롤이 멈춘 위치의 페이지를 상태에 반영한다: scrollend(멈춤 신호)와, 신호가 없는 브라우저를 위해 scroll 중 스냅 지점에 놓였을 때. 둘 다 같은 값을 쓰므로 겹쳐도 무해하다.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const commit = (settledOnly: boolean) => {
      if (el.clientWidth <= 0) return;
      if (target.current !== null) {
        if (Math.abs(el.scrollLeft - target.current) > SNAP_EPSILON) return;
        target.current = null;
      }
      const index = Math.round(el.scrollLeft / el.clientWidth);
      if (settledOnly && Math.abs(el.scrollLeft - index * el.clientWidth) > SNAP_EPSILON) return;
      if (index !== vm.state.featuredPage && index >= 0 && index <= last) vm.setFeaturedPage(index);
    };
    const onScroll = () => commit(true);
    const onScrollEnd = () => commit(false);
    el.addEventListener('scrollend', onScrollEnd);
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scrollend', onScrollEnd);
      el.removeEventListener('scroll', onScroll);
    };
  }, [vm, last]);

  if (items.length === 0) return null;
  const go = (next: number) => scrollToPage(Math.min(last, Math.max(0, next)), true);
  return (
    <section style={{ padding: '0 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
        <button type="button" aria-label={webOnlyCopy['display.featured.previous']} disabled={page <= 0} onClick={() => go(page - 1)}>
          <span aria-hidden="true">‹</span>
        </button>
        <button type="button" aria-label={webOnlyCopy['display.featured.next']} disabled={page >= last} onClick={() => go(page + 1)}>
          <span aria-hidden="true">›</span>
        </button>
      </div>
      <div
        ref={ref}
        data-testid="display.featured-pager"
        role="group"
        aria-label={webOnlyCopy['display.featured.a11y']}
        tabIndex={0}
        style={{ display: 'flex', overflowX: 'auto', scrollSnapType: 'x mandatory', gap: 8 }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowRight') go(page + 1);
          else if (event.key === 'ArrowLeft') go(page - 1);
          else return;
          event.preventDefault();
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

/** 연·월·일 select 세 개와 확인 버튼. 연·월을 바꾸면 선택 가능한 범위에 맞춘다(2월 30일 → 말일 등). Esc·닫기로 닫으면 포커스가 날짜 버튼으로 돌아온다. */
function DatePickerSheet({ current, today, onConfirm, onClose }: { current: DateString; today: DateString; onConfirm: (date: DateString) => void; onClose: () => void }): ReactNode {
  const ref = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  useDialogFocus(ref, onClose);
  const [picked, setPicked] = useState<PickedDate>(() => toPickedDate(current) ?? toPickedDate(FIRST_TOPIC_DATE)!);
  const options = pickerOptions(picked, today);
  const change = (patch: Partial<PickedDate>) => {
    const next = toPickedDate(normalizePickedDate({ ...picked, ...patch }, today));
    if (next) setPicked(next);
  };
  return (
    <div ref={ref} data-testid="display.date-picker-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} style={{ padding: 12, background: '#fff', border: '1px solid #e5e5e5', borderRadius: 8 }}>
      <h2 id={titleId} style={{ margin: '0 0 8px', fontSize: 16 }}>
        {t('display.picker.title')}
      </h2>
      <div style={{ display: 'flex', gap: 8 }}>
        <select data-testid="display.date-picker-year" aria-label={webOnlyCopy['display.picker.year-label']} value={picked.year} onChange={(e) => change({ year: Number(e.target.value) })}>
          {options.years.map((year) => (
            <option key={year} value={year}>
              {t('display.picker.year', { n: year })}
            </option>
          ))}
        </select>
        <select data-testid="display.date-picker-month" aria-label={webOnlyCopy['display.picker.month-label']} value={picked.month} onChange={(e) => change({ month: Number(e.target.value) })}>
          {options.months.map((month) => (
            <option key={month} value={month}>
              {t('display.picker.month', { n: month })}
            </option>
          ))}
        </select>
        <select data-testid="display.date-picker-day" aria-label={webOnlyCopy['display.picker.day-label']} value={picked.day} onChange={(e) => change({ day: Number(e.target.value) })}>
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
