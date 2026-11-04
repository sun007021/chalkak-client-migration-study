import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useContainer } from '../../app/AppContext';
import { FIRST_TOPIC_DATE } from '../../constants';
import { t } from '../../copy/ko';
import { webOnlyCopy } from '../../copy/webOnly';
import { useScreenView } from '../../core/analytics/useScreenView';
import { useViewModel } from '../../core/state/useViewModel';
import { color, font, radius, space } from '../../design/tokens';
import { Button } from '../../core/ui/Button';
import { IcDisplayArrowLeft, IcDisplayArrowRight, IcPhotoLibrary } from '../../core/ui/icons.generated';
import { Masonry, MasonryItem } from '../../core/ui/Masonry';
import { Skeleton } from '../../core/ui/Skeleton';
import { EmptyState, ErrorState, LoadingIndicator } from '../../core/ui/StateViews';
import { useDialogFocus } from '../../core/ui/useDialogFocus';
import { useScrollRestore } from '../../core/ui/useScrollRestore';
import type { DateString } from '../../core/time/kst';
import { formatTopicHeaderDate } from '../home/homeDates';
import { VisibilitySentinel } from '../../core/ui/VisibilitySentinel';
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

const plainButton: CSSProperties = { border: 0, padding: 0, background: 'none', font: 'inherit', color: 'inherit', cursor: 'pointer', textAlign: 'left' };

function DisplayView({ vm, state }: { vm: DisplayViewModel; state: DisplayState }): ReactNode {
  const { body } = state;
  return (
    <div data-testid="display.root">
      <DateHeader vm={vm} state={state} />
      {body.status === 'ready' ? <Description archive={state.archive} /> : null}
      {body.status === 'ready' && !state.archive ? <SortTabs vm={vm} state={state} /> : null}
      {body.status === 'ready' && body.refreshing ? (
        <div data-testid="display.refresh-indicator" role="status" aria-busy="true" style={{ height: 3 }}>
          <Skeleton style={{ height: 3, width: '100%' }} />
          <span className="visually-hidden">{webOnlyCopy['display.refresh-indicator']}</span>
        </div>
      ) : null}
      {body.status === 'loading' ? <LoadingIndicator screenId="display" variant="grid" /> : null}
      {body.status === 'empty' ? (
        <EmptyState screenId="display" icon={<IcPhotoLibrary size={34} />}>
          {t('display.empty')}
        </EmptyState>
      ) : null}
      {body.status === 'error' ? <ErrorState screenId="display" message={body.network ? t('common.error.network') : t('display.error')} onRetry={() => void vm.retry()} /> : null}
      {body.status === 'ready' ? <Featured vm={vm} state={state} items={body.featured} /> : null}
      {body.status === 'ready' ? <Grid vm={vm} posts={body.posts} hasNext={body.hasNext} paging={body.paging} refreshing={body.refreshing} pageFailures={body.pageFailures} /> : null}
    </div>
  );
}

const chevronButton = (disabled: boolean): CSSProperties => ({ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, padding: 0, border: 0, background: 'none', color: color.iconPrimary, opacity: disabled ? 0.35 : 1, cursor: disabled ? 'default' : 'pointer' });

/** 날짜 헤더(원본 DisplayDateHeader): 높이 52, ‹ 날짜(headline) ›. 주제 헤더는 그 아래(구분선 포함). */
function DateHeader({ vm, state }: { vm: DisplayViewModel; state: DisplayState }): ReactNode {
  const [pickerOpen, setPickerOpen] = useState(false);
  const title = state.body.status === 'ready' ? state.body.topicTitle : '';
  return (
    <header>
      <div style={{ display: 'flex', alignItems: 'center', minHeight: 52, padding: `var(--safe-top) calc(var(--space-screen-horizontal) - 13px) 0`, background: color.background }}>
        <button type="button" className="ck-press" data-testid="display.prev-date-button" aria-label={t('display.nav.previous')} disabled={!state.canGoPrevious} style={chevronButton(!state.canGoPrevious)} onClick={() => void vm.selectPreviousDate()}>
          <IcDisplayArrowLeft size={24} />
        </button>
        <button type="button" className="ck-press" data-testid="display.date-picker-button" aria-label={`${formatTopicHeaderDate(state.date)} ${t('display.picker.title')}`} style={{ ...plainButton, minHeight: 44, padding: '0 var(--space-xs)', ...font('headline') }} onClick={() => setPickerOpen(true)}>
          <span data-testid="display.date-label">{formatTopicHeaderDate(state.date)}</span>
        </button>
        <button type="button" className="ck-press" data-testid="display.next-date-button" aria-label={t('display.nav.next')} disabled={!state.canGoNext} style={chevronButton(!state.canGoNext)} onClick={() => void vm.selectNextDate()}>
          <IcDisplayArrowRight size={24} />
        </button>
      </div>
      <TopicHeader title={title} />
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

/** 주제 헤더(원본 DisplayTopic): 위 15 아래 24 좌우 25, title2. 바닥에 border 구분선. 설명은 Description이 아래에 이어 붙는다. */
function TopicHeader({ title }: { title: string }): ReactNode {
  return (
    <div style={{ padding: `15px var(--space-screen-horizontal) 0` }}>
      <h1 data-testid="display.topic-title" style={{ margin: 0, ...font('title2') }}>
        {title}
      </h1>
    </div>
  );
}

function Description({ archive }: { archive: boolean }): ReactNode {
  return (
    <div style={{ padding: `12px var(--space-screen-horizontal) 24px`, borderBottom: `1px solid ${color.border}` }}>
      <p data-testid="display.description" style={{ margin: 0, color: color.textInactive, ...font('subheadline') }}>
        {archive ? t('display.header.desc-archive') : t('display.header.desc-latest')}
      </p>
    </div>
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

/** 정렬 선택기(원본 ChalkakSortSelector): 항목 사이 16, subheadline, 선택은 textPrimary + 아래 1px 밑줄, 비선택 textInactive. */
function SortTabs({ vm, state }: { vm: DisplayViewModel; state: DisplayState }): ReactNode {
  return (
    <div role="tablist" style={{ display: 'flex', gap: space.lg, padding: `0 var(--space-screen-horizontal)` }}>
      {DISPLAY_SORTS.map((sort) => {
        const selected = state.sort === sort;
        return (
          <button
            key={sort}
            type="button"
            role="tab"
            data-testid={SORT_TAB_IDS[sort]}
            aria-selected={selected}
            style={{ ...plainButton, minHeight: 44, padding: '0 0 4px', ...font('subheadline'), color: selected ? color.textPrimary : color.textInactive, boxShadow: selected ? `inset 0 -1px 0 ${color.textPrimary}` : 'none', alignSelf: 'flex-end' }}
            onClick={() => void vm.selectSort(sort)}
          >
            {SORT_LABELS[sort]}
          </button>
        );
      })}
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
    <section style={{ padding: '15px 0 4px' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 0, padding: `0 calc(var(--space-screen-horizontal) - 10px)` }}>
        <button type="button" className="ck-press" aria-label={webOnlyCopy['display.featured.previous']} disabled={page <= 0} style={{ ...chevronButton(page <= 0), width: 36, height: 36 }} onClick={() => go(page - 1)}>
          <IcDisplayArrowLeft size={22} />
        </button>
        <button type="button" className="ck-press" aria-label={webOnlyCopy['display.featured.next']} disabled={page >= last} style={{ ...chevronButton(page >= last), width: 36, height: 36 }} onClick={() => go(page + 1)}>
          <IcDisplayArrowRight size={22} />
        </button>
      </div>
      <div
        ref={ref}
        className="ck-hscroll"
        data-testid="display.featured-pager"
        role="group"
        aria-label={webOnlyCopy['display.featured.a11y']}
        tabIndex={0}
        style={{ display: 'flex', overflowX: 'auto', scrollSnapType: 'x mandatory', marginTop: space.sm }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowRight') go(page + 1);
          else if (event.key === 'ArrowLeft') go(page - 1);
          else return;
          event.preventDefault();
        }}
      >
        {items.map((post) => (
          <div key={post.id} style={{ flex: '0 0 100%', scrollSnapAlign: 'start', display: 'flex', justifyContent: 'center' }}>
            {/* 원본 대표 카드: 3:4, 검정 바탕, 라운드 12, 사진 fit, 서명 48×36, 제목 handwriting 하단 가운데, 좋아요 좌하단 */}
            <div style={{ position: 'relative', width: 'calc(100% - 64px)', aspectRatio: '3 / 4', overflow: 'hidden', borderRadius: radius.photoCard, background: '#000' }}>
              <button type="button" className="ck-press" data-testid={`display.featured-item-${post.id}`} style={{ ...plainButton, display: 'block', width: '100%', height: '100%' }} onClick={() => vm.onPostPress(post.id)}>
                <Photo post={post} fit="contain" signatureSize={{ width: 48, height: 36 }} />
                {post.title ? (
                  <span style={{ position: 'absolute', left: space.xxl, right: space.xxl, bottom: 10, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: color.textOnImage, ...font('handwriting') }}>{post.title}</span>
                ) : null}
              </button>
              <div style={{ position: 'absolute', left: 6, bottom: 4 }}>
                <LikeButton
                  buttonTestId={`display.featured-like-button-${post.id}`}
                  countTestId={`display.featured-like-count-${post.id}`}
                  isLiked={post.isLiked}
                  likeCount={post.likeCount}
                  size={18}
                  tone="onImage"
                  onPress={() => void vm.onLikePress(post.id)}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
      {/* 페이지 표시기(원본 DisplayPageIndicator): 선택 24×7 actionPrimary, 비선택 7×7 textMuted 45% */}
      {items.length > 1 ? (
        <div aria-hidden="true" style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: space.lg }}>
          {items.map((post, index) => (
            <span key={post.id} style={{ width: index === page ? 24 : 7, height: 7, borderRadius: radius.pill, background: index === page ? color.actionPrimary : color.textMuted, opacity: index === page ? 1 : 0.45 }} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

/** 사진 + 서명(원본 ChalkakSignedImage: 우하단, 안쪽 8). 서명 크기는 화면별(그리드 40×30, 대표 48×36). */
function Photo({ post, fit = 'cover', signatureSize }: { post: PostItem; fit?: 'cover' | 'contain'; signatureSize: { width: number; height: number } }): ReactNode {
  const signature = post.signatureThumbnailImageUrl ?? post.signatureOriginalImageUrl;
  return (
    <>
      <img src={post.thumbnailImageUrl ?? post.originalImageUrl} alt={post.title ? '' : webOnlyCopy['display.photo-alt']} style={{ display: 'block', width: '100%', height: '100%', objectFit: fit }} />
      {signature ? <img src={signature} alt="" style={{ position: 'absolute', right: 8, bottom: 8, width: signatureSize.width, height: signatureSize.height, objectFit: 'contain' }} /> : null}
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
  // 사진 비율(세로/가로)은 썸네일이 뜬 뒤 한 번 잰다. 그 전에는 원본 기본값 4/3.
  const [ratios, setRatios] = useState<Readonly<Record<string, number>>>({});
  return (
    <section style={{ padding: `${space.md} var(--space-screen-horizontal) ${space.xxl}` }}>
      <Masonry testId="display.grid" gap={12}>
        {posts.map((post, index) => (
          <MasonryItem key={post.id} ratio={ratios[post.id] ?? 4 / 3}>
            <div style={{ position: 'relative', overflow: 'hidden', borderRadius: radius.photoCard, background: '#000', aspectRatio: `1 / ${ratios[post.id] ?? 4 / 3}` }}>
              <button type="button" data-testid={`display.item-${post.id}`} style={{ ...plainButton, display: 'block', width: '100%', height: '100%' }} onClick={() => vm.onPostPress(post.id)}>
                <PhotoMeasured post={post} onRatio={(r) => setRatios((prev) => (prev[post.id] === r ? prev : { ...prev, [post.id]: r }))} />
                {showSentinel && index === sentinelAt ? (
                  // 목록이 늘거나 다음 페이지가 실패할 때마다 새로 세워 다시 보이면 요청하게 한다.
                  <VisibilitySentinel key={`${posts.length}:${pageFailures}`} observe={visibilityObserver} onVisible={() => void vm.onSentinelVisible()} />
                ) : null}
              </button>
              {/* 좋아요 배지(원본 DisplayLikeBadge): 좌하단, 하트 18 + 숫자, 흰색 + 그림자 */}
              <div style={{ position: 'absolute', left: 6, bottom: 4 }}>
                <LikeButton
                  buttonTestId={`display.like-button-${post.id}`}
                  countTestId={`display.like-count-${post.id}`}
                  isLiked={post.isLiked}
                  likeCount={post.likeCount}
                  size={18}
                  tone="onImage"
                  onPress={() => void vm.onLikePress(post.id)}
                />
              </div>
            </div>
          </MasonryItem>
        ))}
      </Masonry>
      {paging ? (
        <div data-testid="display.load-more-indicator" role="status" aria-busy="true" style={{ display: 'flex', justifyContent: 'center', padding: `${space.md} 0` }}>
          <Skeleton style={{ width: 96, height: 8, borderRadius: radius.pill }} />
          <span className="visually-hidden">{webOnlyCopy['display.load-more']}</span>
        </div>
      ) : null}
    </section>
  );
}

/** 그리드 카드의 사진: 로딩 중에는 스켈레톤 쉬머, 뜨면 자연 비율을 알려 준다. */
function PhotoMeasured({ post, onRatio }: { post: PostItem; onRatio: (ratio: number) => void }): ReactNode {
  const [loaded, setLoaded] = useState(false);
  const signature = post.signatureThumbnailImageUrl ?? post.signatureOriginalImageUrl;
  return (
    <>
      {loaded ? null : <Skeleton style={{ position: 'absolute', inset: 0 }} />}
      <img
        src={post.thumbnailImageUrl ?? post.originalImageUrl}
        alt={post.title ? '' : webOnlyCopy['display.photo-alt']}
        style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover', opacity: loaded ? 1 : 0, transition: 'opacity 0.2s ease-out' }}
        onLoad={(event) => {
          const { naturalWidth, naturalHeight } = event.currentTarget;
          if (naturalWidth > 0 && naturalHeight > 0) onRatio(Math.round((naturalHeight / naturalWidth) * 100) / 100);
          setLoaded(true);
        }}
      />
      {signature ? <img src={signature} alt="" style={{ position: 'absolute', right: 8, bottom: 8, width: 40, height: 30, objectFit: 'contain' }} /> : null}
    </>
  );
}

/** 연·월·일 select 세 개와 확인 버튼(원본 DisplayDatePickerSheet 틀: 하단 시트 + 제목 + 3열). 연·월을 바꾸면 선택 가능한 범위에 맞춘다(2월 30일 → 말일 등). Esc·닫기로 닫으면 포커스가 날짜 버튼으로 돌아온다. */
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
    <div className="ck-overlay ck-overlay--sheet" style={{ zIndex: 200 }} onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div ref={ref} data-testid="display.date-picker-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} className="ck-sheet">
        <div className="ck-sheet__handle" aria-hidden="true" />
        <h2 id={titleId} style={{ margin: `${space.sm} 0 ${space.lg}`, ...font('title3') }}>
          {t('display.picker.title')}
        </h2>
        <div style={{ display: 'flex', gap: space.lg }}>
          <select className="ck-select" data-testid="display.date-picker-year" aria-label={webOnlyCopy['display.picker.year-label']} value={picked.year} onChange={(e) => change({ year: Number(e.target.value) })}>
            {options.years.map((year) => (
              <option key={year} value={year}>
                {t('display.picker.year', { n: year })}
              </option>
            ))}
          </select>
          <select className="ck-select" data-testid="display.date-picker-month" aria-label={webOnlyCopy['display.picker.month-label']} value={picked.month} onChange={(e) => change({ month: Number(e.target.value) })}>
            {options.months.map((month) => (
              <option key={month} value={month}>
                {t('display.picker.month', { n: month })}
              </option>
            ))}
          </select>
          <select className="ck-select" data-testid="display.date-picker-day" aria-label={webOnlyCopy['display.picker.day-label']} value={picked.day} onChange={(e) => change({ day: Number(e.target.value) })}>
            {options.days.map((day) => (
              <option key={day} value={day}>
                {t('display.picker.day', { n: day })}
              </option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: space.sm, marginTop: space.xl }}>
          <Button fill data-testid="display.date-picker-confirm-button" onClick={() => onConfirm(normalizePickedDate(picked, today))}>
            {t('common.confirm')}
          </Button>
          <Button variant="outlined" fill onClick={onClose}>
            {t('common.close')}
          </Button>
        </div>
      </div>
    </div>
  );
}
