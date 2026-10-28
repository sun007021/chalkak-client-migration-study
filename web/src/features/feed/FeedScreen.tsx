import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode, WheelEvent } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { useContainer } from '../../app/AppContext';
import { t } from '../../copy/ko';
import { webOnlyCopy } from '../../copy/webOnly';
import { useScreenView } from '../../core/analytics/useScreenView';
import { useOwnedViewModel } from '../../core/state/useOwnedViewModel';
import { useViewModel } from '../../core/state/useViewModel';
import { LoadingIndicator } from '../../core/ui/StateViews';
import { useScrollRestore } from '../../core/ui/useScrollRestore';
import { LikeButton } from '../like/LikeButton';
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
  const seed = useMemo(() => readFeedSeed(location.state, postId), [location.state, postId]);

  const closeRef = useRef<() => void>(() => undefined);
  useEffect(() => {
    closeRef.current = () => {
      const plan = planFeedClose(location);
      if (plan.kind === 'back') void navigate(-1);
      else void navigate(plan.to, { replace: true });
    };
  }, [location, navigate]);
  const close = useCallback(() => closeRef.current(), []);

  const create = useCallback(() => container.createFeedViewModel({ postId, seed, navigator: { close } }), [container, postId, seed, close]);
  const vm = useOwnedViewModel(create);
  useEffect(() => {
    if (vm) void vm.load();
  }, [vm]);

  return vm ? <FeedBody vm={vm} onClose={close} /> : null;
}

function FeedBody({ vm, onClose }: { vm: FeedViewModel; onClose: () => void }): ReactNode {
  const state = useViewModel(vm);
  useScrollRestore(state.view.kind !== 'loading');
  const { view } = state;
  return (
    <div data-testid="feed.root">
      <header style={{ padding: '8px 16px' }}>
        <button type="button" data-testid="feed.back-button" aria-label={t('common.close')} onClick={onClose}>
          <span aria-hidden="true">‹</span>
        </button>
      </header>
      {view.kind === 'loading' ? <LoadingIndicator screenId="feed" /> : null}
      {view.kind === 'not-found' ? (
        <p data-testid="feed.not-found-state" style={{ padding: 16 }}>
          {t('feed.not-found')}
        </p>
      ) : null}
      {view.kind === 'error' ? (
        <div style={{ padding: 16 }}>
          <p data-testid="feed.error-state">{view.reason === 'network' ? t('common.error.network') : view.reason === 'invalid' ? t('feed.error.invalid') : t('feed.error.load')}</p>
          <button type="button" data-testid="feed.retry-button" onClick={() => void vm.retry()}>
            {t('common.retry')}
          </button>
        </div>
      ) : null}
      {view.kind === 'content' && state.post ? <Content vm={vm} state={state} post={state.post} /> : null}
      {state.titleDialog.open ? <TitleDialog vm={vm} state={state} /> : null}
      {state.deleteDialog.open ? <DeleteDialog vm={vm} state={state} /> : null}
    </div>
  );
}

function Content({ vm, state, post }: { vm: FeedViewModel; state: FeedState; post: FeedPost }): ReactNode {
  return (
    <article style={{ padding: '0 16px 16px' }}>
      <ZoomablePhoto post={post} />
      {post.topicDate ? (
        <p data-testid="feed.date-label" style={{ margin: '12px 0 0' }}>
          {t('feed.date-label', { M: Number(post.topicDate.slice(5, 7)), d: Number(post.topicDate.slice(8, 10)) })}
        </p>
      ) : null}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <h1 data-testid="feed.title" style={{ margin: '4px 0', fontSize: 20 }}>
          {post.title ?? t('feed.title-none')}
        </h1>
        <LikeButton buttonTestId="feed.like-button" countTestId="feed.like-count" isLiked={post.isLiked} likeCount={post.likeCount} disabled={!state.canLike} onPress={() => void vm.onLikePress()} />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {state.canEditTitle ? (
          <button type="button" data-testid="feed.edit-title-button" onClick={() => vm.openTitleEdit()}>
            {t('feed.edit.title')}
          </button>
        ) : null}
        {state.isMine ? (
          <button type="button" data-testid="feed.delete-button" disabled={!state.canDelete} onClick={() => vm.openDelete()}>
            {t('feed.delete.title')}
          </button>
        ) : null}
      </div>
    </article>
  );
}

const photoFrame: CSSProperties = { position: 'relative', overflow: 'hidden', touchAction: 'pan-y', borderRadius: 8, background: '#e5e5e5' };

/** 원본 사진 위에 작가 사인. 핀치(두 손가락)·Ctrl+휠로 1~4배 확대하고 놓으면 돌아온다(REQ-FEED-011, 012). */
function ZoomablePhoto({ post }: { post: FeedPost }): ReactNode {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const pointers = useRef(new Map<number, Point>());
  const start = useRef<{ distance: number; scale: number } | null>(null);
  const [zoom, setZoom] = useState(releaseZoom);

  const frameSize = () => {
    const rect = frameRef.current?.getBoundingClientRect();
    return { width: rect?.width ?? 0, height: rect?.height ?? 0, left: rect?.left ?? 0, top: rect?.top ?? 0 };
  };
  const apply = (toScale: number, focalClient: Point) => {
    const frame = frameSize();
    const focal = { x: focalClient.x - frame.left - frame.width / 2, y: focalClient.y - frame.top - frame.height / 2 };
    setZoom((prev) => {
      const scale = clampZoomScale(toScale);
      if (scale <= 1) return releaseZoom();
      return { scale, translate: zoomAroundPoint({ focal, translate: prev.translate, fromScale: prev.scale, toScale: scale, size: frame }) };
    });
  };
  const distanceAndCenter = () => {
    const [a, b] = [...pointers.current.values()];
    if (!a || !b) return null;
    return { distance: Math.hypot(a.x - b.x, a.y - b.y), center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
  };
  const onPointerDown = (event: ReactPointerEvent) => {
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const pair = distanceAndCenter();
    if (pair && pointers.current.size === 2) start.current = { distance: pair.distance, scale: zoom.scale };
  };
  const onPointerMove = (event: ReactPointerEvent) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const pair = distanceAndCenter();
    if (pair && start.current) apply(pinchScale(start.current.scale, start.current.distance, pair.distance), pair.center);
  };
  const onPointerEnd = (event: ReactPointerEvent) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) start.current = null;
    if (pointers.current.size === 0) setZoom(releaseZoom());
  };
  const onWheel = (event: WheelEvent) => {
    if (!event.ctrlKey) return;
    apply(zoom.scale * Math.exp(-event.deltaY / 100), { x: event.clientX, y: event.clientY });
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
      onWheel={onWheel}
    >
      <div data-testid="feed.photo-content" style={content}>
        <img
          src={post.originalImageUrl}
          alt={post.title ? t('feed.photo-alt', { 제목: post.title }) : t('feed.photo-alt-none')}
          style={{ display: 'block', width: '100%', height: 'auto' }}
          draggable={false}
        />
        {post.signatureOriginalImageUrl ? (
          <img data-testid="feed.signature-image" src={post.signatureOriginalImageUrl} alt="" style={{ position: 'absolute', right: 8, bottom: 8, width: '30%', pointerEvents: 'none' }} draggable={false} />
        ) : (
          <span data-testid="feed.signature-image" />
        )}
      </div>
    </div>
  );
}

const overlay: CSSProperties = { position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)' };
const sheet: CSSProperties = { width: 'min(90vw, 360px)', padding: 16, borderRadius: 12, background: '#fff' };

function TitleDialog({ vm, state }: { vm: FeedViewModel; state: FeedState }): ReactNode {
  const dialog = state.titleDialog;
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  return (
    <div style={overlay}>
      <div data-testid="feed.title-dialog" role="dialog" aria-modal="true" aria-label={t('feed.edit.title')} style={sheet}>
        <h2 style={{ margin: '0 0 8px', fontSize: 16 }}>{t('feed.edit.title')}</h2>
        <input
          ref={inputRef}
          data-testid="feed.title-input"
          value={dialog.input}
          placeholder={t('feed.edit.placeholder')}
          disabled={dialog.saving}
          onChange={(event) => vm.setTitleInput(event.target.value)}
          style={{ width: '100%', boxSizing: 'border-box' }}
        />
        {dialog.error ? <p role="alert">{dialog.error}</p> : null}
        {dialog.saving ? <span data-testid="feed.title-saving" role="status" aria-busy="true" /> : null}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
          <button type="button" data-testid="feed.title-cancel-button" disabled={dialog.saving} onClick={() => vm.cancelTitleEdit()}>
            {t('feed.edit.cancel')}
          </button>
          <button type="button" data-testid="feed.title-save-button" disabled={dialog.saving} onClick={() => void vm.saveTitle()}>
            {dialog.saving ? t('feed.edit.saving') : t('feed.edit.save')}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteDialog({ vm, state }: { vm: FeedViewModel; state: FeedState }): ReactNode {
  const { deleting } = state.deleteDialog;
  return (
    <div style={overlay}>
      <div data-testid="feed.delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="feed-delete-title" style={sheet}>
        <h2 id="feed-delete-title" data-testid="feed.delete-title" style={{ margin: '0 0 8px', fontSize: 16 }}>
          {t('feed.delete.title')}
        </h2>
        <p data-testid="feed.delete-body">{t('feed.delete.body')}</p>
        {deleting ? (
          <span data-testid="feed.deleting" role="status" aria-busy="true">
            {webOnlyCopy['feed.deleting']}
          </span>
        ) : null}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
          <button type="button" data-testid="feed.delete-cancel-button" disabled={deleting} onClick={() => vm.cancelDelete()}>
            {t('feed.delete.cancel')}
          </button>
          <button type="button" data-testid="feed.delete-confirm-button" disabled={deleting} onClick={() => void vm.confirmDelete()}>
            {t('feed.delete.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
