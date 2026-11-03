import { useCallback, useEffect, useId, useRef } from 'react';
import type { CSSProperties, KeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { t } from '../../../copy/ko';
import { webOnlyCopy } from '../../../copy/webOnly';
import { useOwnedViewModel } from '../../../core/state/useOwnedViewModel';
import { useViewModel } from '../../../core/state/useViewModel';
import { useDialogFocus } from '../../../core/ui/useDialogFocus';
import { useRovingTabIndex } from '../../../core/ui/useRovingTabIndex';
import { PHOTO_FILTERS } from '../editModel';
import type { AdjustmentKey, PhotoFilter } from '../editModel';
import type { ImageDecoder } from '../imagePorts';
import type { PhotoEditorComponent, PhotoEditorProps } from '../photoEditor';
import { fromDisplayValue, keyboardAdjustDisplay, toDisplayValue } from './adjustments';
import { CROP_RATIO_IDS } from './cropGeometry';
import type { CropHandle, CropRatioId, CropRect } from './cropGeometry';
import type { AutoAnalyzer, PreviewRenderer, RenderScheduler } from './editorPorts';
import { ADJUST_ITEMS, EDITOR_TOOLS, PhotoEditorViewModel } from './PhotoEditorViewModel';
import type { AdjustItem, EditorTool, PhotoEditorState } from './PhotoEditorViewModel';

export interface PhotoEditorScreenDeps {
  decoder: ImageDecoder;
  preview: PreviewRenderer;
  analyzer: AutoAnalyzer;
  scheduler?: RenderScheduler;
  lazyThumbnails?: boolean;
}

/**
 * 사진 편집기 화면(업로드 화면 위 전체 화면 모달, 내비게이션 목적지 아님). 마운트마다 PhotoEditorViewModel을 만들어 start()하고 언마운트에서 dispose한다
 * (StrictMode 이중 마운트에서도 디코드는 마운트된 인스턴스당 한 번). screen_view는 보내지 않는다.
 *
 * 접근성: 루트 `photo-edit.root`는 role="dialog" aria-modal="true"이고 useDialogFocus(Esc = "취소", 처리 중에는 Esc 무시)로 포커스를 가둔다.
 * 닫히면 열기 전 포커스(미리보기/사진 선택 트리거)로 돌아간다.
 *
 * testid(testids.md photo-edit 행만):
 * - `photo-edit.cancel-button`, `photo-edit.done-button`("완료"; phase가 ready가 아니거나 confirming이면 disabled). 문구는 edit.top.*.
 * - 탭 `photo-edit.tab-crop|tab-adjust|tab-filter`(role="tab", aria-selected). 처음 선택은 자르기. 문구 edit.tab.*.
 * - `photo-edit.preview-image`: <img src=state.preview.src alt="">, 미리보기가 생긴 뒤에만 있다.
 * - 자르기 탭: `photo-edit.crop-area`(미리보기 사진이 보이는 상자를 덮는 포인터 대상, data-center-x/-center-y/-width/-height에 cropRect를 소수 넷째 자리까지, 자식으로
 *   모서리 손잡이 `[data-handle="top-left|top-right|bottom-left|bottom-right"]` 4개와 영역 이동 `[data-handle="move"]`, 3×3 격자선 `[data-grid-line]` 4개),
 *   `photo-edit.rotate-button`, `photo-edit.reset-button`, 비율 `photo-edit.ratio-original|free|1-1|4-5|5-4|3-4|4-3|9-16|16-9`(role="radio" aria-checked, 9개를 이 순서로, role="radiogroup" 안).
 *   손잡이 pointerdown(시작 지점·시작 영역 기억) → pointermove(buttons≠0이면 crop-area의 getBoundingClientRect 크기로 delta를 비율로 바꿔 dragRect → vm.setCropRect) → pointerup/cancel.
 * - 조정 탭: 항목 줄 `photo-edit.adjust-item-auto|exposure|contrast|highlights|shadows|black-point|saturation|warmth`(role="tab", aria-selected, 이 순서),
 *   선택된 항목의 슬라이더 하나만: `photo-edit.adjust-<exposure|contrast|highlights|shadows|black-point|saturation|warmth>-slider` = <input type="range" min=-100 max=100 step=1>,
 *   value·aria-valuetext는 표시값(정수), aria-label은 항목 문구, onKeyDown: ←/↓ -1, →/↑ +1, PageDown -10, PageUp +10, Home -100, End +100(기본 동작은 막음).
 *   'auto' 선택 시: `photo-edit.adjust-auto-toggle`(role="switch", aria-checked = 강도 > 0), `photo-edit.adjust-auto-strength-slider`(range 0~1 step 0.01).
 *   `photo-edit.adjust-reset-button`("초기화", edit.adjust.reset)은 조정 탭에서 항상 보인다.
 * - 필터 탭: `photo-edit.filter-original|mono|warm|cool|vintage|vivid`(role="radio" aria-checked, 이 순서, role="radiogroup" 안, 안에 썸네일 <img>와 문구).
 * - `photo-edit.rendering-indicator`(role="status", confirming 동안만), `photo-edit.error-dialog`(role="alertdialog", 문구 edit.error.render) 안의 `photo-edit.error-retry-button`(열리면 포커스가 여기로). 오류 알림이 열려 있는 동안 완료는 비활성이다.
 */
export function PhotoEditorScreen({ source, initialEdit, onConfirm, onCancel, deps }: PhotoEditorProps & { deps: PhotoEditorScreenDeps }): ReactNode {
  const confirmRef = useRef(onConfirm);
  const cancelRef = useRef(onCancel);
  useEffect(() => {
    confirmRef.current = onConfirm;
    cancelRef.current = onCancel;
  }, [onConfirm, onCancel]);
  const create = useCallback(() => {
    const vm = new PhotoEditorViewModel({
      source,
      initialEdit,
      decoder: deps.decoder,
      preview: deps.preview,
      analyzer: deps.analyzer,
      scheduler: deps.scheduler,
      lazyThumbnails: deps.lazyThumbnails,
      onConfirm: (edit) => confirmRef.current(edit),
      onCancel: () => cancelRef.current(),
    });
    vm.start();
    return vm;
  }, [source, initialEdit, deps]);
  const vm = useOwnedViewModel(create);
  const vmRef = useRef<PhotoEditorViewModel | null>(null);
  useEffect(() => {
    vmRef.current = vm;
  }, [vm]);
  const rootRef = useRef<HTMLDivElement | null>(null);
  // Esc는 "취소"다. 완료 처리 중에는 ViewModel이 무시한다.
  useDialogFocus(rootRef, () => vmRef.current?.cancel());
  return (
    <div ref={rootRef} data-testid="photo-edit.root" role="dialog" aria-modal="true" aria-label={webOnlyCopy['edit.dialog.label']} tabIndex={-1} style={rootStyle}>
      {vm && <EditorBody vm={vm} />}
    </div>
  );
}

/** 컨테이너가 photoEditor로 꽂는 컴포넌트를 만든다. */
export function createPhotoEditor(deps: PhotoEditorScreenDeps): PhotoEditorComponent {
  const Editor: PhotoEditorComponent = (props) => <PhotoEditorScreen {...props} deps={deps} />;
  Editor.displayName = 'PhotoEditor';
  return Editor;
}

const rootStyle: CSSProperties = { position: 'relative', boxSizing: 'border-box', height: '100dvh', display: 'flex', flexDirection: 'column', background: 'Canvas', color: 'CanvasText', outline: 'none' };
const headerStyle: CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 8px', height: 56, flex: 'none' };
const topButtonStyle: CSSProperties = { minHeight: 48, minWidth: 64, padding: '0 12px', fontSize: 16, background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' };
const stageStyle: CSSProperties = { position: 'relative', overflow: 'hidden', flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px 16px', background: '#111' };
const frameBoxStyle: CSSProperties = { position: 'relative', display: 'inline-block', lineHeight: 0, touchAction: 'none' };
const imageStyle: CSSProperties = { display: 'block', maxWidth: 'calc(100vw - 32px)', maxHeight: 'calc(100dvh - 330px)', userSelect: 'none', WebkitUserSelect: 'none' };
const panelStyle: CSSProperties = { flex: 'none', minHeight: 120, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12, boxSizing: 'border-box' };
const rowStyle: CSSProperties = { display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 };
const chipStyle = (selected: boolean): CSSProperties => ({
  flex: 'none',
  minHeight: 44,
  minWidth: 44,
  padding: '0 12px',
  borderRadius: 22,
  border: selected ? '2px solid currentColor' : '1px solid #888',
  background: 'none',
  color: 'inherit',
  fontWeight: selected ? 700 : 400,
  cursor: 'pointer',
});
const tabBarStyle: CSSProperties = { flex: 'none', display: 'flex', borderTop: '1px solid #8884' };
const tabStyle = (selected: boolean): CSSProperties => ({ flex: 1, minHeight: 56, background: 'none', border: 'none', color: 'inherit', fontSize: 16, fontWeight: selected ? 700 : 400, borderBottom: selected ? '3px solid currentColor' : '3px solid transparent', cursor: 'pointer' });
const sliderStyle: CSSProperties = { width: '100%', minHeight: 44 };

/** testids.md의 식별자(템플릿 문자열로 조립하지 않고 표로 둔다: check-testids가 정적 문자열을 기준으로 검사한다). */
const TAB_TESTID: Record<EditorTool, string> = { crop: 'photo-edit.tab-crop', adjust: 'photo-edit.tab-adjust', filter: 'photo-edit.tab-filter' };
const RATIO_TESTID: Record<CropRatioId, string> = {
  original: 'photo-edit.ratio-original',
  free: 'photo-edit.ratio-free',
  '1-1': 'photo-edit.ratio-1-1',
  '4-5': 'photo-edit.ratio-4-5',
  '5-4': 'photo-edit.ratio-5-4',
  '3-4': 'photo-edit.ratio-3-4',
  '4-3': 'photo-edit.ratio-4-3',
  '9-16': 'photo-edit.ratio-9-16',
  '16-9': 'photo-edit.ratio-16-9',
};
const FILTER_TESTID: Record<PhotoFilter, string> = {
  original: 'photo-edit.filter-original',
  mono: 'photo-edit.filter-mono',
  warm: 'photo-edit.filter-warm',
  cool: 'photo-edit.filter-cool',
  vintage: 'photo-edit.filter-vintage',
  vivid: 'photo-edit.filter-vivid',
};
const ADJUST_ITEM_TESTID: Record<AdjustItem, string> = {
  auto: 'photo-edit.adjust-item-auto',
  exposure: 'photo-edit.adjust-item-exposure',
  contrast: 'photo-edit.adjust-item-contrast',
  highlights: 'photo-edit.adjust-item-highlights',
  shadows: 'photo-edit.adjust-item-shadows',
  blackPoint: 'photo-edit.adjust-item-black-point',
  saturation: 'photo-edit.adjust-item-saturation',
  warmth: 'photo-edit.adjust-item-warmth',
};
const ADJUST_SLIDER_TESTID: Record<AdjustmentKey, string> = {
  exposure: 'photo-edit.adjust-exposure-slider',
  contrast: 'photo-edit.adjust-contrast-slider',
  highlights: 'photo-edit.adjust-highlights-slider',
  shadows: 'photo-edit.adjust-shadows-slider',
  blackPoint: 'photo-edit.adjust-black-point-slider',
  saturation: 'photo-edit.adjust-saturation-slider',
  warmth: 'photo-edit.adjust-warmth-slider',
};
const TOOL_COPY: Record<EditorTool, 'edit.tab.crop' | 'edit.tab.adjust' | 'edit.tab.filter'> = { crop: 'edit.tab.crop', adjust: 'edit.tab.adjust', filter: 'edit.tab.filter' };
/** 조정 항목 → testid·문구 키 조각. */
const ADJUST_SLUG: Record<AdjustItem, 'auto' | 'exposure' | 'contrast' | 'highlights' | 'shadows' | 'black-point' | 'saturation' | 'warmth'> = {
  auto: 'auto',
  exposure: 'exposure',
  contrast: 'contrast',
  highlights: 'highlights',
  shadows: 'shadows',
  blackPoint: 'black-point',
  saturation: 'saturation',
  warmth: 'warmth',
};

function EditorBody({ vm }: { vm: PhotoEditorViewModel }): ReactNode {
  const state = useViewModel(vm);
  const onTabKeyDown = useRovingTabIndex('tab');
  const locked = state.confirming;
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }} inert={state.error !== null}>
        <header style={headerStyle}>
          <button type="button" data-testid="photo-edit.cancel-button" style={topButtonStyle} disabled={locked} onClick={() => vm.cancel()}>
            {t('edit.top.cancel')}
          </button>
          <button type="button" data-testid="photo-edit.done-button" style={{ ...topButtonStyle, fontWeight: 700 }} disabled={state.phase !== 'ready' || locked || state.error !== null} onClick={() => void vm.confirm()}>
            {t('edit.top.done')}
          </button>
        </header>
        <div style={stageStyle}>
          {state.preview && (
            <div style={frameBoxStyle}>
              <img data-testid="photo-edit.preview-image" src={state.preview.src} alt="" draggable={false} style={imageStyle} />
              {state.tool === 'crop' && <CropArea vm={vm} state={state} />}
            </div>
          )}
          {/* 상태 알림 영역은 처음부터 있어야 안에 생기는 문구가 읽힌다. */}
          <div role="status">
            {state.confirming && (
              <div data-testid="photo-edit.rendering-indicator" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0008', color: '#fff' }}>
                {webOnlyCopy['edit.rendering']}
              </div>
            )}
          </div>
        </div>
        <div style={panelStyle}>
          {state.tool === 'crop' && <CropPanel vm={vm} state={state} />}
          {state.tool === 'adjust' && <AdjustPanel vm={vm} state={state} />}
          {state.tool === 'filter' && <FilterPanel vm={vm} state={state} />}
        </div>
        <div role="tablist" style={tabBarStyle} onKeyDown={onTabKeyDown}>
          {EDITOR_TOOLS.map((tool) => (
            <button key={tool} type="button" role="tab" tabIndex={state.tool === tool ? 0 : -1} data-testid={TAB_TESTID[tool]} aria-selected={state.tool === tool} disabled={locked || state.phase !== 'ready'} style={tabStyle(state.tool === tool)} onClick={() => vm.selectTool(tool)}>
              {t(TOOL_COPY[tool])}
            </button>
          ))}
        </div>
      </div>
      {state.error !== null && <ErrorDialog onRetry={() => vm.retry()} />}
    </>
  );
}

function ErrorDialog({ onRetry }: { onRetry: () => void }): ReactNode {
  const retryRef = useRef<HTMLButtonElement | null>(null);
  const messageId = useId();
  useEffect(() => {
    retryRef.current?.focus();
  }, []);
  return (
    <div data-testid="photo-edit.error-dialog" role="alertdialog" aria-modal="true" aria-labelledby={messageId} style={{ position: 'absolute', left: 16, right: 16, top: '40%', padding: 16, background: 'Canvas', border: '1px solid #888', borderRadius: 12, boxShadow: '0 4px 24px #0006', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p id={messageId} style={{ margin: 0 }}>
        {t('edit.error.render')}
      </p>
      <button ref={retryRef} type="button" data-testid="photo-edit.error-retry-button" style={{ minHeight: 48 }} onClick={onRetry}>
        {t('common.retry')}
      </button>
    </div>
  );
}

// ── 자르기 ──

const HANDLE_SIZE = 44;
const CORNERS: readonly { handle: Exclude<CropHandle, 'move'>; style: CSSProperties }[] = [
  { handle: 'top-left', style: { left: -HANDLE_SIZE / 2, top: -HANDLE_SIZE / 2 } },
  { handle: 'top-right', style: { right: -HANDLE_SIZE / 2, top: -HANDLE_SIZE / 2 } },
  { handle: 'bottom-left', style: { left: -HANDLE_SIZE / 2, bottom: -HANDLE_SIZE / 2 } },
  { handle: 'bottom-right', style: { right: -HANDLE_SIZE / 2, bottom: -HANDLE_SIZE / 2 } },
];
const GRID_LINES: readonly CSSProperties[] = [
  { left: '33.333%', top: 0, bottom: 0, width: 1 },
  { left: '66.667%', top: 0, bottom: 0, width: 1 },
  { top: '33.333%', left: 0, right: 0, height: 1 },
  { top: '66.667%', left: 0, right: 0, height: 1 },
];
const CROP_KEY_STEP = 0.01;
const CROP_KEY_STEP_LARGE = 0.1;
const CROP_KEY_DELTA: Readonly<Record<string, { x: number; y: number }>> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};
const CORNER_LABEL = {
  'top-left': 'edit.crop.handle.top-left',
  'top-right': 'edit.crop.handle.top-right',
  'bottom-left': 'edit.crop.handle.bottom-left',
  'bottom-right': 'edit.crop.handle.bottom-right',
} as const;
const fixed4 = (value: number): string => value.toFixed(4);

interface DragStart {
  handle: CropHandle;
  pointerId: number;
  x: number;
  y: number;
  rect: CropRect;
}

function CropArea({ vm, state }: { vm: PhotoEditorViewModel; state: PhotoEditorState }): ReactNode {
  const areaRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragStart | null>(null);
  const { cropRect: rect } = state;
  const begin = (handle: CropHandle, event: ReactPointerEvent<HTMLElement>) => {
    event.stopPropagation();
    dragRef.current = { handle, pointerId: event.pointerId, x: event.clientX, y: event.clientY, rect: vm.state.cropRect };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const move = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    const box = areaRef.current?.getBoundingClientRect();
    if (!drag || drag.pointerId !== event.pointerId || event.buttons === 0 || !box || box.width === 0 || box.height === 0) return;
    vm.dragCrop(drag.rect, drag.handle, { x: (event.clientX - drag.x) / box.width, y: (event.clientY - drag.y) / box.height });
  };
  const end = (event: ReactPointerEvent<HTMLElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  };
  // 키보드: 방향키 1%, Shift+방향키 10%. 포인터 끌기와 같은 계산(dragCrop)을 거친다.
  const nudge = (handle: CropHandle, event: KeyboardEvent<HTMLElement>) => {
    const delta = CROP_KEY_DELTA[event.key];
    if (!delta) return;
    event.preventDefault();
    const step = event.shiftKey ? CROP_KEY_STEP_LARGE : CROP_KEY_STEP;
    vm.dragCrop(vm.state.cropRect, handle, { x: delta.x * step, y: delta.y * step });
  };
  const valueText = `${Math.round(rect.width * 100)}% × ${Math.round(rect.height * 100)}%`;
  return (
    <div
      ref={areaRef}
      data-testid="photo-edit.crop-area"
      role="group"
      aria-label={webOnlyCopy['edit.crop.area']}
      data-center-x={fixed4(rect.centerX)}
      data-center-y={fixed4(rect.centerY)}
      data-width={fixed4(rect.width)}
      data-height={fixed4(rect.height)}
      style={{ position: 'absolute', inset: 0, overflow: 'visible' }}
    >
      <div
        style={{
          position: 'absolute',
          left: `${(rect.centerX - rect.width / 2) * 100}%`,
          top: `${(rect.centerY - rect.height / 2) * 100}%`,
          width: `${rect.width * 100}%`,
          height: `${rect.height * 100}%`,
          boxSizing: 'border-box',
          border: '2px solid #fff',
          boxShadow: '0 0 0 9999px #0009',
        }}
      >
        <div data-handle="move" role="slider" tabIndex={0} aria-label={webOnlyCopy['edit.crop.move']} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(rect.width * 100)} aria-valuetext={valueText} onKeyDown={(event) => nudge('move', event)} onPointerDown={(event) => begin('move', event)} onPointerMove={move} onPointerUp={end} onPointerCancel={end} style={{ position: 'absolute', inset: 0, cursor: 'move', touchAction: 'none' }} />
        {GRID_LINES.map((line, index) => (
          <div key={index} data-grid-line="" aria-hidden="true" style={{ position: 'absolute', background: '#fff8', pointerEvents: 'none', ...line }} />
        ))}
        {CORNERS.map(({ handle, style }) => (
          <div key={handle} data-handle={handle} role="slider" tabIndex={0} aria-label={webOnlyCopy[CORNER_LABEL[handle]]} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(rect.width * 100)} aria-valuetext={valueText} onKeyDown={(event) => nudge(handle, event)} onPointerDown={(event) => begin(handle, event)} onPointerMove={move} onPointerUp={end} onPointerCancel={end} style={{ position: 'absolute', width: HANDLE_SIZE, height: HANDLE_SIZE, display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'none', ...style }}>
            <div style={{ width: 16, height: 16, borderRadius: 8, background: '#fff', pointerEvents: 'none' }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function CropPanel({ vm, state }: { vm: PhotoEditorViewModel; state: PhotoEditorState }): ReactNode {
  const onRadioKeyDown = useRovingTabIndex('radio');
  return (
    <>
      <div role="radiogroup" aria-label={webOnlyCopy['edit.ratio.label']} style={rowStyle} onKeyDown={onRadioKeyDown}>
        {CROP_RATIO_IDS.map((ratio) => (
          <button key={ratio} type="button" role="radio" tabIndex={state.ratio === ratio ? 0 : -1} data-testid={RATIO_TESTID[ratio]} aria-checked={state.ratio === ratio} style={chipStyle(state.ratio === ratio)} onClick={() => vm.selectRatio(ratio)}>
            {t(`edit.ratio.${ratio}`)}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" data-testid="photo-edit.rotate-button" style={chipStyle(false)} onClick={() => vm.rotate()}>
          {t('edit.crop.rotate')}
        </button>
        <button type="button" data-testid="photo-edit.reset-button" style={chipStyle(false)} onClick={() => vm.resetCrop()}>
          {t('edit.crop.reset')}
        </button>
      </div>
    </>
  );
}

// ── 조정 ──

function AdjustPanel({ vm, state }: { vm: PhotoEditorViewModel; state: PhotoEditorState }): ReactNode {
  const item = state.adjustItem;
  const onTabKeyDown = useRovingTabIndex('tab');
  return (
    <>
      <div role="tablist" aria-label={t('edit.tab.adjust')} style={rowStyle} onKeyDown={onTabKeyDown}>
        {ADJUST_ITEMS.map((entry) => (
          <button key={entry} type="button" role="tab" tabIndex={item === entry ? 0 : -1} data-testid={ADJUST_ITEM_TESTID[entry]} aria-selected={item === entry} style={chipStyle(item === entry)} onClick={() => vm.selectAdjustItem(entry)}>
            {t(`edit.adjust.${ADJUST_SLUG[entry]}`)}
          </button>
        ))}
      </div>
      {item === 'auto' ? <AutoControls vm={vm} state={state} /> : <AdjustSlider vm={vm} state={state} item={item} />}
      <button type="button" data-testid="photo-edit.adjust-reset-button" style={{ ...chipStyle(false), alignSelf: 'flex-start' }} onClick={() => vm.resetAdjust()}>
        {t('edit.adjust.reset')}
      </button>
    </>
  );
}

function AutoControls({ vm, state }: { vm: PhotoEditorViewModel; state: PhotoEditorState }): ReactNode {
  const strength = state.adjustmentLayers.autoStrength;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <button type="button" role="switch" data-testid="photo-edit.adjust-auto-toggle" aria-checked={strength > 0} aria-label={t('edit.adjust.auto')} style={chipStyle(strength > 0)} onClick={() => vm.toggleAuto()}>
        {t('edit.adjust.auto')}
      </button>
      <input
        type="range"
        data-testid="photo-edit.adjust-auto-strength-slider"
        aria-label={t('edit.adjust.auto')}
        aria-valuetext={`${Math.round(strength * 100)}%`}
        min={0}
        max={1}
        step={0.01}
        value={strength}
        style={sliderStyle}
        onChange={(event) => vm.setAutoStrength(Number(event.target.value))}
      />
    </div>
  );
}

function AdjustSlider({ vm, state, item }: { vm: PhotoEditorViewModel; state: PhotoEditorState; item: Exclude<AdjustItem, 'auto'> }): ReactNode {
  const key: AdjustmentKey = item;
  const display = toDisplayValue(state.adjustValues[key]);
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const next = keyboardAdjustDisplay(display, event.key);
    if (next === null) return;
    event.preventDefault();
    vm.setAdjustValue(key, fromDisplayValue(next));
  };
  return (
    <input
      type="range"
      data-testid={ADJUST_SLIDER_TESTID[key]}
      aria-label={t(`edit.adjust.${ADJUST_SLUG[item]}`)}
      aria-valuetext={String(display)}
      min={-100}
      max={100}
      step={1}
      value={display}
      style={sliderStyle}
      onChange={(event) => vm.setAdjustValue(key, fromDisplayValue(Number(event.target.value)))}
      onKeyDown={onKeyDown}
    />
  );
}

// ── 필터 ──

function FilterPanel({ vm, state }: { vm: PhotoEditorViewModel; state: PhotoEditorState }): ReactNode {
  const onRadioKeyDown = useRovingTabIndex('radio');
  return (
    <div role="radiogroup" aria-label={t('edit.tab.filter')} style={rowStyle} onKeyDown={onRadioKeyDown}>
      {PHOTO_FILTERS.map((filter) => {
        const selected = state.filter === filter;
        const thumbnail = state.thumbnails[filter];
        return (
          <button key={filter} type="button" role="radio" tabIndex={selected ? 0 : -1} data-testid={FILTER_TESTID[filter]} aria-checked={selected} onClick={() => vm.selectFilter(filter)} style={{ flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: 4, background: 'none', color: 'inherit', border: selected ? '2px solid currentColor' : '1px solid transparent', borderRadius: 8, cursor: 'pointer', fontWeight: selected ? 700 : 400 }}>
            {thumbnail ? <img src={thumbnail} alt="" draggable={false} style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 6 }} /> : <span aria-hidden="true" style={{ width: 64, height: 64, borderRadius: 6, background: '#8883' }} />}
            <span>{t(`edit.filter.${filter}`)}</span>
          </button>
        );
      })}
    </div>
  );
}
