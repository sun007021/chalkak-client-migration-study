import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { CSSProperties, FormEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { useContainer } from '../../app/AppContext';
import { t } from '../../copy/ko';
import { webOnlyCopy } from '../../copy/webOnly';
import { useScreenView } from '../../core/analytics/useScreenView';
import { useOwnedViewModel } from '../../core/state/useOwnedViewModel';
import { useViewModel } from '../../core/state/useViewModel';
import { LoadingIndicator } from '../../core/ui/StateViews';
import { useDialogFocus } from '../../core/ui/useDialogFocus';
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

  // 만들자마자 load를 시작한다: 시드가 있으면 같은 효과 안에서 content가 되므로 loading 프레임이 그려지지 않는다.
  const create = useCallback(() => {
    const created = container.createFeedViewModel({ postId, seed, navigator: { close } });
    void created.load();
    return created;
  }, [container, postId, seed, close]);
  const vm = useOwnedViewModel(create);

  return vm ? <FeedBody vm={vm} onClose={close} /> : null;
}

function FeedBody({ vm, onClose }: { vm: FeedViewModel; onClose: () => void }): ReactNode {
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
  const ref = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const inputId = useId();
  useDialogFocus(ref, { onClose: dialog.saving ? undefined : () => vm.cancelTitleEdit(), initialFocus: inputRef });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void vm.saveTitle();
  };
  return (
    <div style={overlay}>
      <div ref={ref} data-testid="feed.title-dialog" role="dialog" aria-modal="true" aria-labelledby={`${inputId}-title`} style={sheet}>
        <form onSubmit={submit}>
          <h2 id={`${inputId}-title`} style={{ margin: '0 0 8px', fontSize: 16 }}>
            {t('feed.edit.title')}
          </h2>
          <label htmlFor={inputId} style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
            {t('feed.edit.title')}
          </label>
          <input
            id={inputId}
            ref={inputRef}
            data-testid="feed.title-input"
            value={dialog.input}
            placeholder={t('feed.edit.placeholder')}
            readOnly={dialog.saving}
            onChange={(event) => vm.setTitleInput(event.target.value)}
            style={{ width: '100%', boxSizing: 'border-box' }}
          />
          {dialog.error ? <p role="alert">{dialog.error}</p> : null}
          {dialog.saving ? <span data-testid="feed.title-saving" role="status" aria-busy="true" /> : null}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
            <button type="button" data-testid="feed.title-cancel-button" disabled={dialog.saving} onClick={() => vm.cancelTitleEdit()}>
              {t('feed.edit.cancel')}
            </button>
            <button type="submit" data-testid="feed.title-save-button" disabled={dialog.saving}>
              {dialog.saving ? t('feed.edit.saving') : t('feed.edit.save')}
            </button>
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
  useDialogFocus(ref, { onClose: deleting ? undefined : () => vm.cancelDelete(), initialFocus: cancelRef });
  return (
    <div style={overlay}>
      <div ref={ref} data-testid="feed.delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="feed-delete-title" aria-describedby="feed-delete-body" style={sheet}>
        <h2 id="feed-delete-title" data-testid="feed.delete-title" style={{ margin: '0 0 8px', fontSize: 16 }}>
          {t('feed.delete.title')}
        </h2>
        <p id="feed-delete-body" data-testid="feed.delete-body">
          {t('feed.delete.body')}
        </p>
        {deleting ? (
          <span data-testid="feed.deleting" role="status" aria-busy="true">
            {webOnlyCopy['feed.deleting']}
          </span>
        ) : null}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
          {/* 되돌릴 수 없는 삭제라 처음 포커스는 취소에 둔다. */}
          <button ref={cancelRef} type="button" data-testid="feed.delete-cancel-button" disabled={deleting} onClick={() => vm.cancelDelete()}>
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
