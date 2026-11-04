import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { CSSProperties, FormEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { useContainer } from '../../app/AppContext';
import { t } from '../../copy/ko';
import { webOnlyCopy } from '../../copy/webOnly';
import { useScreenView } from '../../core/analytics/useScreenView';
import { useOwnedViewModel } from '../../core/state/useOwnedViewModel';
import { useViewModel } from '../../core/state/useViewModel';
import { color, font, space } from '../../design/tokens';
import { Button } from '../../core/ui/Button';
import { IcArrowBack, IcDelete, IcEdit } from '../../core/ui/icons.generated';
import { LoadingIndicator } from '../../core/ui/StateViews';
import { useDialogFocus } from '../../core/ui/useDialogFocus';
import { useScrollRestore } from '../../core/ui/useScrollRestore';
import { readOpenAiReview } from '../aireview/aiEntry';
import { FeedAiSection } from '../aireview/FeedAiSection';
import type { FeedAiViewModel } from '../aireview/FeedAiViewModel';
import { LikeButton } from '../like/LikeButton';
import { readRecordFeedEntry } from '../record/recordNavigation';
import type { FeedPost, FeedState, FeedViewModel } from './FeedViewModel';
import { planFeedClose, readFeedSeed } from './feedNavigation';
import { MAX_ZOOM, clampZoomScale, pinchScale, releaseZoom, zoomAroundPoint } from './photoZoom';
import type { Point } from './photoZoom';

/**
 * 게시물 상세 화면(탭 셸 밖, 하단 바 없음). 로직은 FeedViewModel에 있고 여기서는 그리기만 한다.
 * 화면이 열릴 때마다 ViewModel을 새로 만들고(시드는 location.state) 닫힐 때 dispose한다. 닫기는 앱 안에서 push한 항목이면 뒤로,
 * 새로고침·딥링크로 첫 항목이 됐으면 홈으로 replace한다(planFeedClose).
 */
export function FeedScreen(): ReactNode {
  const { postId = '' } = useParams();
  const container = useContainer();
  const navigate = useNavigate();
  const location = useLocation();
  useScreenView('feed');
  // 진입 때 한 번만 읽는다: 브라우저가 history.state를 복제해 돌려주므로(openAiReview 정리용 replace 등) 참조가 바뀌어 상세가 다시 만들어지지 않게 한다.
  // 시드와 기록에서 연 상세(assumeMine, 썸네일)를 한 상자에 담는다.
  const readEntry = () => ({ postId, seed: readFeedSeed(location.state, postId), recordEntry: readRecordFeedEntry(location.state) });
  const [entryBox, setEntryBox] = useState(readEntry);
  if (entryBox.postId !== postId) setEntryBox(readEntry());
  const { seed, recordEntry } = entryBox.postId === postId ? entryBox : readEntry();
  const assumeMine = recordEntry ? true : undefined;
  const previewUrl = recordEntry?.thumbnailImageUrl ?? null;

  const closeRef = useRef<() => void>(() => undefined);
  useEffect(() => {
    closeRef.current = () => {
      const plan = planFeedClose(location);
      if (plan.kind === 'back') void navigate(-1);
      else void navigate(plan.to, { replace: true });
    };
  }, [location, navigate]);
  const close = useCallback(() => closeRef.current(), []);

  // 생성은 부작용이 없다. 마운트 효과에서 load를 시작한다: 시드가 있으면 그 효과 안에서 content가 되므로 loading 프레임이 그려지지 않는다.
  const create = useCallback(() => container.createFeedViewModel({ postId, seed, assumeMine, navigator: { close } }), [container, postId, seed, assumeMine, close]);
  const vm = useOwnedViewModel(create, startFeed);
  // AI 영역(알약·시트)은 상세 로직과 따로 둔다. 홈 "자세히 보기"로 들어왔으면 첫 GET 뒤 시트를 자동으로 연다(REQ-AIR-047).
  // 진입 때 한 번만 읽는다: 소비 뒤 state에서 지워도 AI ViewModel이 다시 만들어지지 않게 postId별로 고정한다.
  const [entered, setEntered] = useState({ postId, open: readOpenAiReview(location.state) });
  if (entered.postId !== postId) setEntered({ postId, open: readOpenAiReview(location.state) });
  const openAiReview = entered.postId === postId ? entered.open : readOpenAiReview(location.state);
  const locationRef = useRef(location);
  useEffect(() => {
    locationRef.current = location;
  }, [location]);
  const consumeOpenAiReview = useCallback(() => {
    const current = locationRef.current;
    const rest = typeof current.state === 'object' && current.state !== null ? { ...(current.state as Record<string, unknown>) } : {};
    if (!('openAiReview' in rest)) return;
    delete rest['openAiReview'];
    void navigate(current.pathname + current.search, { replace: true, state: rest });
  }, [navigate]);
  const createAi = useCallback(
    (): FeedAiViewModel => container.createFeedAiViewModel({ postId, openAiReview, onOpenAiReviewConsumed: consumeOpenAiReview }),
    [container, postId, openAiReview, consumeOpenAiReview],
  );
  const aiVm = useOwnedViewModel(createAi);

  return vm && aiVm ? <FeedBody vm={vm} aiVm={aiVm} previewUrl={previewUrl} onClose={close} /> : null;
}

function startFeed(vm: FeedViewModel): void {
  void vm.load();
}

function FeedBody({ vm, aiVm, previewUrl, onClose }: { vm: FeedViewModel; aiVm: FeedAiViewModel; previewUrl: string | null; onClose: () => void }): ReactNode {
  const state = useViewModel(vm);
  useScrollRestore(state.view.kind !== 'loading');
  // 다른 탭·앱에서 돌아와 문서가 다시 보이면 내용을 조용히 재검증한다(실패하면 내용 유지 + 토스트).
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void vm.refresh();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [vm]);
  const { view } = state;
  const showActions = view.kind === 'content' && state.post !== null;
  return (
    <div data-testid="feed.root" className="ck-screen" style={{ paddingBottom: 'calc(var(--space-xxl) + var(--safe-bottom))' }}>
      {/* 상단 바(원본 FeedTopBar): 뒤로(48) + 오른쪽 수정(ic_edit, actionPrimary)·삭제(ic_delete, error) 아이콘 버튼 */}
      <header style={{ position: 'sticky', top: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 72, padding: `var(--safe-top) var(--space-md)`, background: 'rgba(247, 246, 243, 0.96)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}>
        <button type="button" className="ck-icon-btn" style={{ width: 48, height: 48 }} data-testid="feed.back-button" aria-label={t('common.close')} onClick={onClose}>
          <IcArrowBack size={24} />
        </button>
        {showActions ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: space.xs }}>
            {state.canEditTitle ? (
              <button type="button" className="ck-icon-btn" style={{ width: 48, height: 48, color: color.actionPrimary }} data-testid="feed.edit-title-button" aria-label={t('feed.edit.title')} onClick={() => vm.openTitleEdit()}>
                <IcEdit size={24} />
              </button>
            ) : null}
            {state.isMine ? (
              <button type="button" className="ck-icon-btn" style={{ width: 48, height: 48, color: color.error }} data-testid="feed.delete-button" aria-label={t('feed.delete.title')} disabled={!state.canDelete} onClick={() => vm.openDelete()}>
                <IcDelete size={24} />
              </button>
            ) : null}
          </div>
        ) : null}
      </header>
      {view.kind === 'loading' && previewUrl ? <img src={previewUrl} alt={webOnlyCopy['feed.preview-alt']} style={{ display: 'block', width: '100%', maxHeight: '60vh', objectFit: 'contain', background: color.calendarCell }} /> : null}
      {view.kind === 'loading' ? <LoadingIndicator screenId="feed" /> : null}
      {view.kind === 'not-found' ? (
        <div data-testid="feed.not-found-state" className="ck-state" style={{ paddingTop: 96 }}>
          <span className="ck-state__title">{t('feed.not-found')}</span>
        </div>
      ) : null}
      {view.kind === 'error' ? (
        <div className="ck-state" style={{ gap: space.xl, paddingTop: 96 }}>
          <p data-testid="feed.error-state" className="ck-state__title">{view.reason === 'network' ? t('common.error.network') : view.reason === 'invalid' ? t('feed.error.invalid') : t('feed.error.load')}</p>
          <Button variant="outlined" compact data-testid="feed.retry-button" onClick={() => void vm.retry()}>
            {t('common.retry')}
          </Button>
        </div>
      ) : null}
      {view.kind === 'content' && state.post ? <Content vm={vm} aiVm={aiVm} state={state} post={state.post} /> : null}
      {state.titleDialog.open ? <TitleDialog vm={vm} state={state} /> : null}
      {state.deleteDialog.open ? <DeleteDialog vm={vm} state={state} /> : null}
    </div>
  );
}

function Content({ vm, aiVm, state, post }: { vm: FeedViewModel; aiVm: FeedAiViewModel; state: FeedState; post: FeedPost }): ReactNode {
  return (
    <article>
      {/* 주제 영역(원본 FeedTopic): 좌우 25, 위 16, 아래 40. 날짜 라벨 subheadline + 주제 display */}
      <div style={{ padding: `${space.lg} var(--space-screen-horizontal) 40px` }}>
        {post.topicDate ? (
          <p data-testid="feed.date-label" style={{ margin: 0, ...font('subheadline') }}>
            {t('feed.date-label', { M: Number(post.topicDate.slice(5, 7)), d: Number(post.topicDate.slice(8, 10)) })}
          </p>
        ) : null}
        <h1 style={{ margin: `${space.sm} 0 0`, ...font('display'), minHeight: '2.5625rem' }}>{post.topicTitle ?? ' '}</h1>
      </div>
      <ZoomablePhoto post={post} />
      {/* 좋아요 행(원본 FeedLikeRow): 높이 57, 좌우 14. 왼쪽 하트 + 숫자, 오른쪽 제목(textSecondary, 1줄). 바닥 구분선 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space.md, minHeight: 57, padding: '0 14px', borderBottom: `1px solid ${color.border}` }}>
        <LikeButton buttonTestId="feed.like-button" countTestId="feed.like-count" isLiked={post.isLiked} likeCount={post.likeCount} disabled={!state.canLike} onPress={() => void vm.onLikePress()} />
        <p data-testid="feed.title" style={{ flex: 1, minWidth: 0, margin: 0, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: color.textSecondary, ...font('body') }}>
          {post.title ?? t('feed.title-none')}
        </p>
      </div>
      <div style={{ padding: `${space.lg} var(--space-screen-horizontal) 0` }}>
        <FeedAiSection vm={aiVm} isMine={state.isMine} topicDate={post.topicDate} />
      </div>
    </article>
  );
}

const photoFrame: CSSProperties = { position: 'relative', overflow: 'hidden', touchAction: 'pan-y', background: color.calendarCell };

/** 원본 사진 위에 작가 사인. 핀치(두 손가락)·Ctrl+휠로 1~4배 확대하고 놓으면 돌아온다(REQ-FEED-011, 012). */
function ZoomablePhoto({ post }: { post: FeedPost }): ReactNode {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const pointers = useRef(new Map<number, Point>());
  const start = useRef<{ distance: number; scale: number } | null>(null);
  const [zoom, setZoom] = useState(releaseZoom);
  const scaleRef = useRef(zoom.scale);
  useEffect(() => {
    scaleRef.current = zoom.scale;
  }, [zoom.scale]);

  const apply = useCallback((toScale: number, focalClient: Point) => {
    const rect = frameRef.current?.getBoundingClientRect();
    const frame = { width: rect?.width ?? 0, height: rect?.height ?? 0, left: rect?.left ?? 0, top: rect?.top ?? 0 };
    const focal = { x: focalClient.x - frame.left - frame.width / 2, y: focalClient.y - frame.top - frame.height / 2 };
    setZoom((prev) => {
      const scale = clampZoomScale(toScale);
      if (scale <= 1) return releaseZoom();
      return { scale, translate: zoomAroundPoint({ focal, translate: prev.translate, fromScale: prev.scale, toScale: scale, size: frame }) };
    });
  }, []);

  // Ctrl+휠(웹 데스크톱의 핀치): 브라우저 확대로 번지지 않게 preventDefault가 필요하므로 passive:false 네이티브 리스너로 단다.
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      apply(scaleRef.current * Math.exp(-event.deltaY / 100), { x: event.clientX, y: event.clientY });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [apply]);

  const pair = () => {
    const [a, b] = [...pointers.current.values()];
    if (!a || !b) return null;
    return { distance: Math.hypot(a.x - b.x, a.y - b.y), center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
  };
  const onPointerDown = (event: ReactPointerEvent) => {
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    // 손가락이 사진 밖으로 나가도 이동·해제 이벤트를 계속 받는다(없는 환경에서는 건너뛴다).
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const current = pair();
    if (current && pointers.current.size === 2) start.current = { distance: current.distance, scale: scaleRef.current };
  };
  const onPointerMove = (event: ReactPointerEvent) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const current = pair();
    if (current && start.current) apply(pinchScale(start.current.scale, start.current.distance, current.distance), current.center);
  };
  // 놓음·취소·캡처 상실 모두 같은 정리: 남은 포인터가 없으면 원래 크기로 돌아간다.
  const onPointerEnd = (event: ReactPointerEvent) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) start.current = null;
    if (pointers.current.size === 0) setZoom(releaseZoom());
  };
  const content: CSSProperties = {
    position: 'relative',
    transformOrigin: 'center',
    transform: `translate(${zoom.translate.x}px, ${zoom.translate.y}px) scale(${Math.min(zoom.scale, MAX_ZOOM)})`,
  };
  return (
    <div
      ref={frameRef}
      data-testid="feed.photo"
      style={photoFrame}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onLostPointerCapture={onPointerEnd}
    >
      <div data-testid="feed.photo-content" style={content}>
        <img
          src={post.originalImageUrl}
          alt={post.title ? t('feed.photo-alt', { 제목: post.title }) : t('feed.photo-alt-none')}
          style={{ display: 'block', width: '100%', height: 'auto' }}
          draggable={false}
        />
        {post.signatureOriginalImageUrl ? (
          <img data-testid="feed.signature-image" src={post.signatureOriginalImageUrl} alt="" style={{ position: 'absolute', right: 8, bottom: 8, width: 70, height: 52, objectFit: 'contain', pointerEvents: 'none' }} draggable={false} />
        ) : (
          <span data-testid="feed.signature-image" />
        )}
      </div>
    </div>
  );
}

function TitleDialog({ vm, state }: { vm: FeedViewModel; state: FeedState }): ReactNode {
  const dialog = state.titleDialog;
  const ref = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const inputId = useId();
  useDialogFocus(ref, dialog.saving ? undefined : () => vm.cancelTitleEdit(), inputRef);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void vm.saveTitle();
  };
  return (
    <div className="ck-overlay" style={{ zIndex: 200 }}>
      <div ref={ref} data-testid="feed.title-dialog" role="dialog" aria-modal="true" aria-labelledby={`${inputId}-title`} className="ck-dialog" style={{ maxWidth: 340, padding: space.xl, textAlign: 'left' }}>
        <form onSubmit={submit}>
          <h2 id={`${inputId}-title`} className="ck-dialog__title">
            {t('feed.edit.title')}
          </h2>
          <label htmlFor={inputId} className="visually-hidden">
            {t('feed.edit.title')}
          </label>
          <div className="ck-field" style={{ marginTop: space.lg }}>
            <input
              id={inputId}
              ref={inputRef}
              data-testid="feed.title-input"
              value={dialog.input}
              placeholder={t('feed.edit.placeholder')}
              readOnly={dialog.saving}
              onChange={(event) => vm.setTitleInput(event.target.value)}
              style={{ ...font('subheadline') }}
            />
          </div>
          {dialog.error ? <p role="alert" style={{ marginTop: space.md, color: color.error, ...font('footnote') }}>{dialog.error}</p> : null}
          {dialog.saving ? <span data-testid="feed.title-saving" role="status" aria-busy="true" /> : null}
          <div className="ck-dialog__actions" style={{ marginTop: 20 }}>
            <Button variant="secondary" data-testid="feed.title-cancel-button" disabled={dialog.saving} onClick={() => vm.cancelTitleEdit()}>
              {t('feed.edit.cancel')}
            </Button>
            <Button type="submit" data-testid="feed.title-save-button" disabled={dialog.saving}>
              {dialog.saving ? t('feed.edit.saving') : t('feed.edit.save')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DeleteDialog({ vm, state }: { vm: FeedViewModel; state: FeedState }): ReactNode {
  const { deleting } = state.deleteDialog;
  const ref = useRef<HTMLDivElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  useDialogFocus(ref, deleting ? undefined : () => vm.cancelDelete(), cancelRef);
  return (
    <div className="ck-overlay" style={{ zIndex: 200 }}>
      <div ref={ref} data-testid="feed.delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="feed-delete-title" aria-describedby="feed-delete-body" className="ck-dialog">
        <h2 id="feed-delete-title" data-testid="feed.delete-title" className="ck-dialog__title">
          {t('feed.delete.title')}
        </h2>
        <p id="feed-delete-body" data-testid="feed.delete-body" className="ck-dialog__message">
          {t('feed.delete.body')}
        </p>
        {deleting ? (
          <span data-testid="feed.deleting" role="status" aria-busy="true" style={{ display: 'block', marginTop: space.md, color: color.textMuted, ...font('footnote') }}>
            {webOnlyCopy['feed.deleting']}
          </span>
        ) : null}
        <div className="ck-dialog__actions">
          {/* 되돌릴 수 없는 삭제라 처음 포커스는 취소에 둔다. */}
          <Button ref={cancelRef} variant="secondary" data-testid="feed.delete-cancel-button" disabled={deleting} onClick={() => vm.cancelDelete()}>
            {t('feed.delete.cancel')}
          </Button>
          <Button variant="destructive" data-testid="feed.delete-confirm-button" disabled={deleting} onClick={() => void vm.confirmDelete()}>
            {t('feed.delete.confirm')}
          </Button>
        </div>
      </div>
    </div>
  );
}
