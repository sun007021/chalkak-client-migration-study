import { ViewModel } from '../../../core/state/ViewModel';
import { POST_IMAGE_MAX_LONG_EDGE } from '../../../constants';
import { IDENTITY_EDIT, isIdentityEdit } from '../editModel';
import { PHOTO_FILTERS, FULL_CROP } from '../editModel';
import type { AdjustmentKey, AdjustmentLayers, CropRegion, PhotoEdit, PhotoFilter } from '../editModel';
import type { DecodedImage, ImageDecoder } from '../imagePorts';
import type { Size } from '../imageSizing';
import { clearedLayers, effectiveValues, withAutoStrength, withAutoValues, withManualValue } from './adjustments';
import type { AdjustmentValues } from './adjustments';
import { AUTO_ANALYSIS_LONG_EDGE } from './autoAdjust';
import { FULL_RECT, clampRect, cropRegionToRect, dragRect, largestRect, ratioValue, rectToCropRegion, rotateCrop, rotatedSize } from './cropGeometry';
import type { CropHandle, CropRatioId, CropRect, Point } from './cropGeometry';
import type { AutoAnalyzer, PreviewFrame, PreviewRenderer } from './editorPorts';
import { normalizeEdit } from './normalizeEdit';

export type EditorTool = 'crop' | 'adjust' | 'filter';
export const EDITOR_TOOLS: readonly EditorTool[] = ['crop', 'adjust', 'filter'];
export type AdjustItem = 'auto' | AdjustmentKey;
/** 항목 줄 순서(REQ-EDIT-019). */
export const ADJUST_ITEMS: readonly AdjustItem[] = ['auto', 'exposure', 'contrast', 'highlights', 'shadows', 'blackPoint', 'saturation', 'warmth'];

/** 편집용 이미지 디코드 긴 변 상한(REQ-EDIT-018). */
export const EDITOR_DECODE_LONG_EDGE = POST_IMAGE_MAX_LONG_EDGE;
/** 미리보기 긴 변 상한(REQ-EDIT-007). */
export const PREVIEW_MAX_LONG_EDGE = 1440;
/** 필터 썸네일 긴 변. 임시: 명세에 크기가 없다. */
export const FILTER_THUMBNAIL_LONG_EDGE = 96;

export interface PreviewState {
  src: string;
  width: number;
  height: number;
}

export type PhotoEditorPhase =
  /** 편집용 이미지를 읽는 중(처음 렌더 전). */
  | 'loading'
  | 'ready'
  /** 읽지 못했다(손상·지원하지 않는 형식). error가 'render'. */
  | 'failed';

export interface PhotoEditorState {
  phase: PhotoEditorPhase;
  tool: EditorTool;
  /** 디코드한 원본 크기(회전 전). 읽기 전 null. */
  imageSize: Size | null;
  quarterTurns: 0 | 1 | 2 | 3;
  /** 돌린 사진 기준 자르기 영역(화면 프레임이 그린다). */
  cropRect: CropRect;
  ratio: CropRatioId;
  filter: PhotoFilter;
  adjustmentLayers: AdjustmentLayers;
  /** 항목별 지금 적용되는 값(직접 값 또는 자동값 × 강도). */
  adjustValues: AdjustmentValues;
  adjustItem: AdjustItem;
  preview: PreviewState | null;
  /** 필터별 썸네일 src. 아직 없으면 null. */
  thumbnails: Readonly<Record<PhotoFilter, string | null>>;
  /** "완료"를 누르고 마지막 렌더를 기다리는 중(rendering-indicator). 이 동안 완료·취소·도구 조작은 무시된다. */
  confirming: boolean;
  /** 오류 알림이 열려 있나: 읽기 실패 또는 "완료" 때 렌더 실패. 문구는 edit.error.render. */
  error: 'render' | null;
  /** 지금 편집값이 편집하지 않은 사진인가. */
  identity: boolean;
}

export interface PhotoEditorDeps {
  source: Blob;
  initialEdit: PhotoEdit;
  decoder: ImageDecoder;
  preview: PreviewRenderer;
  analyzer: AutoAnalyzer;
  onConfirm(edit: PhotoEdit): void;
  onCancel(): void;
}

const INITIAL: PhotoEditorState = {
  phase: 'loading',
  tool: 'crop',
  imageSize: null,
  quarterTurns: 0,
  cropRect: FULL_RECT,
  ratio: 'free',
  filter: 'original',
  adjustmentLayers: IDENTITY_EDIT.adjustmentLayers,
  adjustValues: IDENTITY_EDIT.adjustmentLayers.autoValues,
  adjustItem: 'auto',
  preview: null,
  thumbnails: { original: null, mono: null, warm: null, cool: null, vintage: null, vivid: null },
  confirming: false,
  error: null,
  identity: true,
};

/**
 * 사진 편집기 ViewModel(REQ-EDIT-001~029). 화면은 이 상태를 그리기만 한다.
 *
 * 생명주기: 만들기만 해서는 디코드·렌더·분석을 하지 않는다. `start()`가 처음 한 번만 source를 디코드(긴 변 EDITOR_DECODE_LONG_EDGE)하고, 끝나면 initialEdit을 상태로 옮기고
 * 첫 미리보기·필터 썸네일을 요청한다. start()를 또 불러도 디코드·분석은 다시 하지 않는다(TC-EDIT-001). dispose()는 진행 중 작업을 abort하고 디코드한 이미지·미리보기·썸네일을 release한다.
 *
 * 처음 상태(initialEdit이 IDENTITY_EDIT): 도구 'crop', 비율 'free', 조정 항목 'auto'(강도 0). 다시 열면 initialEdit의 회전·자르기·필터·조정을 복원한다. 복원한 비율은 'free'.
 *
 * 미리보기: 상태가 바뀔 때마다 이전 요청을 abort하고 새로 요청한다(마지막 것만 반영). 자르기 도구에서는 자르기 프레임이 얹히므로 영역을 전체로 둔 편집값으로 그리고,
 * 다른 도구에서는 자른 영역으로 그린다(TC-EDIT-022). 썸네일은 현재 회전·자르기·조정에 필터만 바꿔 FILTER_THUMBNAIL_LONG_EDGE로 그린다(6장; 회전·자르기(도구 이동 뒤)·조정이 바뀔 때 다시 그리고, 필터 선택만으로는 다시 그리지 않는다).
 *
 * 자동 보정값 분석(AutoAnalyzer, 긴 변 256): start 직후(initialEdit이 autoStrength > 0이면 저장값을 쓰고 분석하지 않음), 자르기가 바뀐 뒤 도구를 옮길 때,
 * 자동 보정을 켠 채 완료할 때. 같은 회전·자르기로 이미 분석했으면 다시 하지 않는다(TC-EDIT-037). 분석 결과가 null이면 아무것도 바꾸지 않는다(REQ-EDIT-027).
 *
 * "완료": 이미 완료·취소 중이면 무시. 마지막 미리보기 요청이 진행 중이면 기다린다(confirming=true). 렌더가 실패했으면 닫지 않고 error='render'. 성공하면
 * normalizeEdit한 편집값 하나로 onConfirm을 한 번 부른다. 편집값만 넘기고 EditRenderer는 부르지 않는다(실제 픽셀은 업로드 준비가 같은 값으로 다시 그린다, REQ-EDIT-002).
 * 편집하지 않은 값이면 미리보기를 다시 그리지 않고 곧바로 확정한다(TC-EDIT-011). "취소": 변경을 모두 버리고 onCancel만 부른다(렌더 없음). 한 번만.
 */
export class PhotoEditorViewModel extends ViewModel<PhotoEditorState> {
  private started = false;
  private gone = false;
  /** 완료·취소 중 하나가 이미 나갔다. */
  private closed = false;
  private image: DecodedImage | null = null;
  private decodeController: AbortController | null = null;
  /** 저장된 자르기 값. 사용자가 영역·회전을 바꾸기 전까지 그대로 내보내 값이 어긋나지 않게 한다(sameEdit). */
  private cropOverride: CropRegion | null;

  private previewController: AbortController | null = null;
  private previewKey: string | null = null;
  private previewFrame: PreviewFrame | null = null;
  /** 마지막 미리보기 요청: 진행 중이면 settled=false, 끝나면 ok가 결과. */
  private lastPreview: { promise: Promise<void>; settled: boolean; ok: boolean } | null = null;

  private thumbController: AbortController | null = null;
  private thumbKey: string | null = null;
  private readonly thumbFrames: Partial<Record<PhotoFilter, PreviewFrame>> = {};

  private analysisController: AbortController | null = null;
  private analyzedKey: string | null = null;
  private analysisPromise: Promise<void> | null = null;

  constructor(protected readonly deps: PhotoEditorDeps) {
    super(INITIAL);
    this.cropOverride = deps.initialEdit.crop;
  }

  start(): void {
    if (this.started || this.gone) return;
    this.started = true;
    void this.load();
  }

  /** 지금 편집값(정규화 전). */
  draft(): PhotoEdit {
    const { quarterTurns, filter, adjustmentLayers } = this.state;
    return { quarterTurns, crop: this.currentCrop(), filter, adjustmentLayers };
  }

  selectTool(tool: EditorTool): void {
    if (!this.canEdit() || tool === this.state.tool) return;
    this.setState({ tool });
    this.refresh();
    this.ensureAnalysis();
  }

  /** 비율 선택(REQ-EDIT-011): 고정 비율/원본은 전체 사진에서 가장 크게 다시 시작, 자유는 현재 영역 유지·고정 해제. */
  selectRatio(ratio: CropRatioId): void {
    if (!this.canEdit() || !this.state.imageSize) return;
    if (ratio === 'free') {
      this.setState({ ratio });
      return;
    }
    const rotated = rotatedSize(this.state.imageSize, this.state.quarterTurns);
    const value = ratioValue(ratio, rotated);
    this.cropOverride = null;
    this.setState({ ratio, cropRect: value === null ? FULL_RECT : largestRect(rotated, value) });
    this.refresh();
  }

  /** 끌기 결과 영역을 반영한다(clampRect로 한 번 더 보정). */
  setCropRect(rect: CropRect): void {
    if (!this.canEdit() || !this.state.imageSize) return;
    const rotated = rotatedSize(this.state.imageSize, this.state.quarterTurns);
    this.cropOverride = null;
    this.setState({ cropRect: clampRect(rect, rotated, ratioValue(this.state.ratio, rotated)) });
    this.refresh();
  }

  /** 프레임 끌기: 끌기 시작 때의 영역·손잡이·이동량(돌린 사진 비율)으로 새 영역을 계산해 반영한다(REQ-EDIT-013, 순수 계산은 dragRect). */
  dragCrop(start: CropRect, handle: CropHandle, delta: Point): void {
    if (!this.canEdit() || !this.state.imageSize) return;
    const rotated = rotatedSize(this.state.imageSize, this.state.quarterTurns);
    this.setCropRect(dragRect(start, handle, delta, rotated, ratioValue(this.state.ratio, rotated)));
  }

  /** 시계 방향 90도(REQ-EDIT-014, 015). */
  rotate(): void {
    if (!this.canEdit() || !this.state.imageSize) return;
    const quarterTurns = ((this.state.quarterTurns + 1) % 4) as PhotoEditorState['quarterTurns'];
    const rotated = rotatedSize(this.state.imageSize, quarterTurns);
    this.cropOverride = null;
    this.setState({ quarterTurns, cropRect: rotateCrop(this.state.cropRect, this.state.ratio, rotated) });
    this.refresh();
  }

  /** 자르기 "초기화": 회전·자르기 영역·비율만 처음으로(REQ-EDIT-016). 필터·조정은 유지. */
  resetCrop(): void {
    if (!this.canEdit()) return;
    this.cropOverride = null;
    this.setState({ quarterTurns: 0, cropRect: FULL_RECT, ratio: 'free' });
    this.refresh();
  }

  /** 항목 선택(REQ-EDIT-021): 다른 항목에서 'auto'로 오면 꺼져 있을 때만 강도 1, 이미 'auto'가 선택된 채 다시 누르면 1과 0을 번갈아. */
  selectAdjustItem(item: AdjustItem): void {
    if (!this.canEdit()) return;
    if (item !== 'auto') {
      this.setState({ adjustItem: item });
      return;
    }
    const strength = this.state.adjustmentLayers.autoStrength;
    const next = this.state.adjustItem === 'auto' ? (strength > 0 ? 0 : 1) : strength > 0 ? strength : 1;
    this.setState({ adjustItem: 'auto' });
    this.setLayers(withAutoStrength(this.state.adjustmentLayers, next));
  }

  setAdjustValue(key: AdjustmentKey, value: number): void {
    if (!this.canEdit()) return;
    this.setLayers(withManualValue(this.state.adjustmentLayers, key, value));
  }

  setAutoStrength(strength: number): void {
    if (!this.canEdit()) return;
    this.setLayers(withAutoStrength(this.state.adjustmentLayers, strength));
  }

  /** 자동 보정 토글: 켜짐(1) ↔ 꺼짐(0). */
  toggleAuto(): void {
    if (!this.canEdit()) return;
    this.setLayers(withAutoStrength(this.state.adjustmentLayers, this.state.adjustmentLayers.autoStrength > 0 ? 0 : 1));
  }

  /** 조정 "초기화"(REQ-EDIT-024). */
  resetAdjust(): void {
    if (!this.canEdit()) return;
    this.setLayers(clearedLayers(this.state.adjustmentLayers));
  }

  selectFilter(filter: PhotoFilter): void {
    if (!this.canEdit() || filter === this.state.filter) return;
    this.setState({ filter });
    this.refresh();
  }

  async confirm(): Promise<void> {
    if (!this.canEdit() || this.state.error) return;
    if (this.state.identity) {
      this.finishConfirm();
      return;
    }
    this.setState({ confirming: true });
    try {
      // 자동 보정을 켠 채 완료하면 지금 자른 영역의 분석값을 저장한다(REQ-EDIT-025).
      if (this.state.adjustmentLayers.autoStrength > 0) {
        this.ensureAnalysis();
        await this.analysisPromise;
      }
      // 마지막 미리보기가 끝나기를 기다린다. 실패했으면 닫지 않는다(REQ-EDIT-006).
      await this.lastPreview?.promise;
    } finally {
      if (!this.gone) this.setState({ confirming: false });
    }
    if (this.gone || this.closed) return;
    if (this.lastPreview && !this.lastPreview.ok) {
      this.setState({ error: 'render' });
      return;
    }
    this.finishConfirm();
  }

  cancel(): void {
    if (this.gone || this.closed || this.state.confirming) return;
    this.closed = true;
    this.abortAll();
    this.deps.onCancel();
  }

  /** 오류 알림의 "다시 시도": 읽기 실패면 디코드부터, "완료" 실패였으면 미리보기를 다시 그리고 성공하면 이어서 완료한다. */
  retry(): void {
    if (this.gone || this.closed || !this.state.error || this.state.confirming) return;
    if (this.state.phase === 'failed') {
      this.setState({ phase: 'loading', error: null });
      void this.load();
      return;
    }
    this.setState({ error: null });
    this.requestPreview(true);
    void this.confirm();
  }

  override dispose(): void {
    this.gone = true;
    this.abortAll();
    this.image?.release();
    this.image = null;
    this.previewFrame?.release();
    this.previewFrame = null;
    for (const filter of PHOTO_FILTERS) {
      this.thumbFrames[filter]?.release();
      delete this.thumbFrames[filter];
    }
    super.dispose();
  }

  // ── 내부 ──

  private canEdit(): boolean {
    return !this.gone && !this.closed && !this.state.confirming && this.state.phase === 'ready';
  }

  private finishConfirm(): void {
    this.closed = true;
    this.abortAll();
    this.deps.onConfirm(normalizeEdit(this.draft()));
  }

  private abortAll(): void {
    this.decodeController?.abort();
    this.previewController?.abort();
    this.thumbController?.abort();
    this.analysisController?.abort();
  }

  private currentCrop(): CropRegion {
    if (this.cropOverride) return this.cropOverride;
    const { imageSize, quarterTurns, cropRect } = this.state;
    return imageSize ? rectToCropRegion(imageSize, quarterTurns, cropRect) : this.deps.initialEdit.crop;
  }

  private async load(): Promise<void> {
    const controller = new AbortController();
    this.decodeController = controller;
    let image: DecodedImage;
    try {
      image = await this.deps.decoder.decode(this.deps.source, { maxLongEdge: EDITOR_DECODE_LONG_EDGE }, controller.signal);
    } catch {
      if (controller.signal.aborted || this.gone) return;
      this.setState({ phase: 'failed', error: 'render' });
      return;
    }
    if (controller.signal.aborted || this.gone) {
      image.release();
      return;
    }
    this.image = image;
    const { initialEdit } = this.deps;
    const imageSize = { width: image.width, height: image.height };
    const layers = initialEdit.adjustmentLayers;
    this.setState({
      phase: 'ready',
      imageSize,
      quarterTurns: initialEdit.quarterTurns,
      cropRect: cropRegionToRect(imageSize, initialEdit.quarterTurns, initialEdit.crop),
      ratio: 'free',
      filter: initialEdit.filter,
      adjustmentLayers: layers,
      adjustValues: effectiveValues(layers),
      identity: isIdentityEdit(initialEdit),
    });
    // 저장해 둔 자동 보정값(강도 > 0)은 그대로 쓰고 분석하지 않는다.
    if (layers.autoStrength > 0) this.analyzedKey = this.analysisKey();
    this.refresh();
    this.ensureAnalysis();
  }

  private setLayers(adjustmentLayers: AdjustmentLayers): void {
    this.setState({ adjustmentLayers });
    this.refresh();
  }

  /** 편집값에서 파생되는 상태를 맞추고, 바뀐 것만 미리보기·썸네일을 다시 요청한다. */
  private refresh(): void {
    const draft = this.draft();
    this.setState({ adjustValues: effectiveValues(draft.adjustmentLayers), identity: isIdentityEdit(draft) });
    this.requestPreview(false);
    this.requestThumbnails();
  }

  /** 미리보기·썸네일에 그릴 편집값. 자르기 도구에서는 프레임이 얹히므로 자르지 않은 사진이다(TC-EDIT-022). */
  private renderEdit(filter: PhotoFilter): PhotoEdit {
    const draft = this.draft();
    return { ...draft, filter, crop: this.state.tool === 'crop' ? FULL_CROP : draft.crop };
  }

  private requestPreview(force: boolean): void {
    const image = this.image;
    if (!image) return;
    const edit = this.renderEdit(this.state.filter);
    const key = JSON.stringify({ t: edit.quarterTurns, c: edit.crop, f: edit.filter, v: effectiveValues(edit.adjustmentLayers) });
    if (!force && key === this.previewKey) return;
    this.previewKey = key;
    this.previewController?.abort();
    const controller = new AbortController();
    this.previewController = controller;
    const record = { promise: Promise.resolve(), settled: false, ok: false };
    record.promise = this.deps.preview.render(image, edit, { maxLongEdge: PREVIEW_MAX_LONG_EDGE }, controller.signal).then(
      (frame) => {
        if (controller.signal.aborted || this.gone) {
          frame.release();
          return;
        }
        this.previewFrame?.release();
        this.previewFrame = frame;
        record.ok = true;
        record.settled = true;
        this.setState({ preview: { src: frame.src, width: frame.width, height: frame.height } });
      },
      () => {
        // 취소된 요청이 아니면 이전 미리보기를 유지한 채 실패로 기록한다(오류 알림은 "완료" 때, REQ-EDIT-006).
        record.settled = true;
        record.ok = controller.signal.aborted;
      },
    );
    this.lastPreview = record;
  }

  private requestThumbnails(): void {
    const image = this.image;
    if (!image) return;
    const base = this.renderEdit('original');
    const key = JSON.stringify({ t: base.quarterTurns, c: base.crop, v: effectiveValues(base.adjustmentLayers) });
    if (key === this.thumbKey) return;
    this.thumbKey = key;
    this.thumbController?.abort();
    const controller = new AbortController();
    this.thumbController = controller;
    for (const filter of PHOTO_FILTERS) {
      this.deps.preview.render(image, { ...base, filter }, { maxLongEdge: FILTER_THUMBNAIL_LONG_EDGE }, controller.signal).then(
        (frame) => {
          if (controller.signal.aborted || this.gone) {
            frame.release();
            return;
          }
          this.thumbFrames[filter]?.release();
          this.thumbFrames[filter] = frame;
          this.setState({ thumbnails: { ...this.state.thumbnails, [filter]: frame.src } });
        },
        () => undefined,
      );
    }
  }

  private analysisKey(): string {
    return JSON.stringify({ t: this.state.quarterTurns, c: this.currentCrop() });
  }

  /** 지금 회전·자른 영역으로 아직 분석하지 않았으면 분석한다(REQ-EDIT-025, 같은 영역은 다시 하지 않는다). */
  private ensureAnalysis(): void {
    const image = this.image;
    if (!image || this.gone) return;
    const key = this.analysisKey();
    if (key === this.analyzedKey) return;
    this.analyzedKey = key;
    this.analysisController?.abort();
    const controller = new AbortController();
    this.analysisController = controller;
    const region = { quarterTurns: this.state.quarterTurns, crop: this.currentCrop() };
    this.analysisPromise = this.deps.analyzer.analyze(image, region, AUTO_ANALYSIS_LONG_EDGE, controller.signal).then(
      (values) => {
        if (controller.signal.aborted || this.gone || !values) return;
        this.setLayers(withAutoValues(this.state.adjustmentLayers, values));
      },
      () => undefined,
    );
  }
}
