import { CancelledError } from '../../core/http/ApiError';
import { Observable } from '../../core/state/Observable';
import { POST_IMAGE_MAX_LONG_EDGE } from '../../shared/constants';
import { t } from '../../shared/copy';
import type { LocalFiles } from '../../core/media/LocalFiles';
import type { ImageEngine } from './ImageEngine';
import type { ImageFile, RgbaImage, Size } from './ImageTypes';
import {
  aspectRatioOf,
  cropRectToWindow,
  fitLargestCrop,
  moveCrop,
  resizeCrop,
  windowToCropRect,
  type AspectKey,
  type CropHandle,
  type CropRect,
} from './CropGeometry';
import { analyzeAutoAdjust } from './PhotoAutoAdjuster';
import {
  clearedLayers,
  effectiveAdjustValues,
  withAutoStrength,
  withAutoValues,
  withUserValue,
} from './PhotoAdjustmentLayers';
import { renderPixels } from './PhotoPixelRenderer';
import { rotatedSize } from './PhotoEditTransform';
import {
  ZERO_ADJUST_VALUES,
  identityEdit,
  isFullCrop,
  isIdentityEdit,
  type AdjustItem,
  type AdjustValues,
  type AdjustmentLayers,
  type PhotoEdit,
  type PhotoFilter,
  type QuarterTurns,
} from './PhotoEdit';

export type EditTab = 'crop' | 'adjust' | 'filter';

export type PhotoEditState = {
  /** 편집용 이미지를 준비하는 동안 'loading', 실패하면 'error'(편집기는 닫히지 않는다, REQ-EDIT-006). */
  status: 'loading' | 'ready' | 'error';
  errorMessage: string | null;
  tab: EditTab;
  /** EXIF가 반영되고 긴 변이 4096 이하인 편집용 이미지(준비 전 null). */
  editable: ImageFile | null;
  quarterTurns: QuarterTurns;
  aspect: AspectKey;
  /** 돌린 사진 기준 자르기 영역. */
  cropRect: CropRect;
  filter: PhotoFilter;
  /** 처음 선택된 항목은 'auto'. */
  selectedAdjust: 'auto' | AdjustItem;
  adjustments: AdjustmentLayers;
  /** 항목별로 지금 적용되는 값(-1~1). 화면에는 100배한 정수. */
  adjustValues: AdjustValues;
  /** 자동 보정이 켜져 있는지(강도 > 0). */
  autoOn: boolean;
  /** 지금 상태가 편집하지 않은 사진과 같은지. */
  isIdentity: boolean;
  rendering: boolean;
};

export type PhotoEditViewModelDeps = {
  engine: Pick<ImageEngine, 'prepareEditable' | 'samplePixels'>;
  /** 편집용 임시 JPEG를 닫을 때 지운다(REQ-UPL-048). */
  files: Pick<LocalFiles, 'delete'>;
  /** 편집할 원본(EXIF가 반영되기 전일 수 있다). */
  sourceUri: string;
  sourceSize: Size;
  /** 다시 편집이면 저장된 편집값, 처음이면 null(REQ-UPL-021). */
  initialEdit: PhotoEdit | null;
  /** 확정: 정규화한 편집값만 넘긴다. 픽셀은 업로드 준비 때 원본에서 다시 그린다(REQ-EDIT-002). */
  onDone: (edit: PhotoEdit) => void;
  /** 이번 편집의 모든 변경을 버리고 닫는다. */
  onCancel: () => void;
};

/**
 * 사진 편집기 상태(자르기·조정·필터). 편집값만 만들고 실제 픽셀은 만들지 않는다.
 * 한 번 확정(done)하거나 취소(cancel)하면 끝난 상태라 이후 입력은 무시한다.
 * 모델은 Android PhotoEditStateHolder/CropEditor를 따른다(고정 비율은 선택 때 정한 값을 회전 뒤에도 쓰고, 자유는 원본의 같은 영역이 따라 돈다).
 */
export class PhotoEditViewModel extends Observable<PhotoEditState> {
  private loading: Promise<void> | null = null;
  private finished = false;
  private editableDeleted = false;
  private confirming = false;
  private abort = new AbortController();
  /** 마지막으로 분석한 (회전, 자르기). 같으면 다시 분석하지 않는다(REQ-EDIT-025). */
  private analyzedKey: string | null;
  private analysisGeneration = 0;
  /** 고정 비율(가로/세로). 자유는 null. */
  private fixedRatio: number | null = null;
  /** 색 미리보기의 기반이 되는 작은 표본(사진 전체, 회전 전). 한 번만 읽는다. */
  private previewBase: Promise<RgbaImage | null> | null = null;

  constructor(private readonly deps: PhotoEditViewModelDeps) {
    super(initialPhotoEditState(deps));
    const initial = deps.initialEdit;
    this.analyzedKey =
      initial && initial.adjustments.autoStrength > 0 ? this.keyOf(this.getSnapshot()) : null;
  }

  /** 편집용 이미지 준비와 첫 자동 보정 분석. 여러 번 불러도 한 번만 일어나며, 실패 뒤에는 다시 시도한다. */
  start(): Promise<void> {
    if (this.finished) return Promise.resolve();
    if (!this.loading) {
      this.loading = this.load().finally(() => {
        if (this.getSnapshot().status === 'error') this.loading = null;
      });
    }
    return this.loading;
  }

  private async load(): Promise<void> {
    const { signal } = this.abort;
    this.setState({ ...this.getSnapshot(), status: 'loading', errorMessage: null });
    try {
      const editable = await this.deps.engine.prepareEditable(
        this.deps.sourceUri,
        POST_IMAGE_MAX_LONG_EDGE,
        signal,
      );
      if (signal.aborted) {
        void this.deps.files.delete(editable.uri);
        return;
      }
      this.setState({ ...this.getSnapshot(), status: 'ready', editable });
    } catch (error) {
      if (signal.aborted || error instanceof CancelledError) return;
      this.setState({
        ...this.getSnapshot(),
        status: 'error',
        errorMessage: t('edit.error.render'),
      });
      return;
    }
    if (this.analyzedKey === null) await this.refreshAutoAdjustments();
  }

  private get ready(): boolean {
    return !this.finished && this.getSnapshot().status === 'ready';
  }

  private keyOf(state: PhotoEditState): string {
    return JSON.stringify([
      state.quarterTurns,
      cropRectToWindow(state.cropRect, state.quarterTurns),
    ]);
  }

  /** 자른 영역 기준으로 자동 보정값을 다시 분석한다. 분석할 수 없으면 아무것도 바꾸지 않는다(REQ-EDIT-027). */
  private async refreshAutoAdjustments(): Promise<void> {
    const state = this.getSnapshot();
    const editable = state.editable;
    if (!editable) return;
    const key = this.keyOf(state);
    if (key === this.analyzedKey) return;
    const generation = ++this.analysisGeneration;
    const { signal } = this.abort;
    let sample = null;
    try {
      sample = await this.deps.engine.samplePixels(
        {
          sourceUri: editable.uri,
          sourceSize: { width: editable.width, height: editable.height },
          quarterTurns: state.quarterTurns,
          crop: cropRectToWindow(state.cropRect, state.quarterTurns),
          maxLongEdge: 256,
        },
        signal,
      );
    } catch {
      sample = null;
    }
    if (signal.aborted || generation !== this.analysisGeneration) return;
    this.analyzedKey = key;
    if (sample) {
      this.patch({
        adjustments: withAutoValues(this.getSnapshot().adjustments, analyzeAutoAdjust(sample)),
      });
    }
  }

  /**
   * 색(조정·필터) 미리보기 픽셀: 사진 전체의 작은 표본에 지금의 조정·필터만 적용한 것(회전·자르기는 화면이 겹쳐 그린다).
   * 표본을 읽을 수 없거나 끝난 편집기면 null.
   */
  async renderPreview(maxLongEdge = 512): Promise<RgbaImage | null> {
    const state = this.getSnapshot();
    const editable = state.editable;
    if (this.finished || !editable) return null;
    this.previewBase ??= this.deps.engine
      .samplePixels(
        {
          sourceUri: editable.uri,
          sourceSize: { width: editable.width, height: editable.height },
          quarterTurns: 0,
          crop: identityEdit().crop,
          maxLongEdge,
        },
        this.abort.signal,
      )
      .catch(() => null);
    const base = await this.previewBase;
    if (!base || this.finished) return null;
    const current = this.getSnapshot();
    return renderPixels(base, {
      ...identityEdit(),
      filter: current.filter,
      adjustments: current.adjustments,
    });
  }

  async selectTab(tab: EditTab): Promise<void> {
    if (!this.ready) return;
    this.patch({ tab });
    await this.refreshAutoAdjustments();
  }

  private rotated(quarterTurns = this.getSnapshot().quarterTurns) {
    return rotatedSize(this.deps.sourceSize, quarterTurns);
  }

  selectAspect(aspect: AspectKey): void {
    if (!this.ready) return;
    if (aspect === 'free') {
      this.fixedRatio = null;
      this.patch({ aspect });
      return;
    }
    const ratio = aspectRatioOf(aspect, this.rotated());
    this.fixedRatio = ratio;
    this.patch({ aspect, cropRect: fitLargestCrop(this.rotated(), ratio) });
  }

  rotate(): void {
    if (!this.ready) return;
    const state = this.getSnapshot();
    const quarterTurns = ((state.quarterTurns + 1) % 4) as QuarterTurns;
    const size = this.rotated(quarterTurns);
    let cropRect: CropRect;
    if (state.aspect === 'free') {
      // 원본의 같은 영역이 사진과 함께 돈다.
      cropRect = windowToCropRect(
        cropRectToWindow(state.cropRect, state.quarterTurns),
        quarterTurns,
      );
    } else if (state.aspect === 'original') {
      this.fixedRatio = size.width / size.height;
      cropRect = fitLargestCrop(size, this.fixedRatio);
    } else {
      cropRect = fitLargestCrop(size, this.fixedRatio);
    }
    this.patch({ quarterTurns, cropRect });
  }

  /** 비율 단위로 영역을 옮긴다. */
  moveCrop(dx: number, dy: number): void {
    if (!this.ready) return;
    this.patch({ cropRect: moveCrop(this.getSnapshot().cropRect, dx, dy) });
  }

  resizeCrop(handle: CropHandle, dx: number, dy: number): void {
    if (!this.ready) return;
    const state = this.getSnapshot();
    this.patch({
      cropRect: resizeCrop({
        rect: state.cropRect,
        handle,
        dx,
        dy,
        rotated: this.rotated(),
        ratio: this.fixedRatio,
      }),
    });
  }

  /** 자르기 "초기화": 회전과 자르기 영역·비율만 처음으로(필터·조정 유지). */
  resetCrop(): void {
    if (!this.ready) return;
    this.fixedRatio = null;
    this.patch({
      quarterTurns: 0,
      aspect: 'free',
      cropRect: { centerX: 0.5, centerY: 0.5, width: 1, height: 1 },
    });
  }

  /** REQ-EDIT-021: 다른 항목에서 "자동"으로 오면 꺼져 있을 때만 1로 켜고, "자동"을 다시 누르면 켜짐/꺼짐을 번갈아 바꾼다. */
  async selectAdjust(item: 'auto' | AdjustItem): Promise<void> {
    if (!this.ready) return;
    const state = this.getSnapshot();
    let strength = state.adjustments.autoStrength;
    if (item === 'auto') {
      if (state.selectedAdjust === 'auto') strength = strength > 0 ? 0 : 1;
      else if (strength <= 0) strength = 1;
    }
    this.patch({
      selectedAdjust: item,
      adjustments: withAutoStrength(state.adjustments, strength),
    });
  }

  setAdjustValue(item: AdjustItem, value: number): void {
    if (!this.ready) return;
    const rounded = Math.round(Math.min(1, Math.max(-1, value)) * 100) / 100;
    this.patch({ adjustments: withUserValue(this.getSnapshot().adjustments, item, rounded) });
  }

  /** 자동 보정 강도(0~1)를 직접 정한다. */
  setAutoStrength(strength: number): void {
    if (!this.ready) return;
    this.patch({ adjustments: withAutoStrength(this.getSnapshot().adjustments, strength) });
  }

  /** 조정 "초기화": 자동 강도 0, 직접 값 삭제, 분석값 유지. */
  resetAdjustments(): void {
    if (!this.ready) return;
    this.patch({ adjustments: clearedLayers(this.getSnapshot().adjustments) });
  }

  selectFilter(filter: PhotoFilter): void {
    if (!this.ready) return;
    this.patch({ filter });
  }

  /** "완료": 편집값을 정규화해 onDone으로 넘긴다. 준비 실패 상태면 닫지 않고 다시 시도한다. */
  async done(): Promise<void> {
    if (this.finished || this.confirming) return;
    this.confirming = true;
    try {
      if (this.getSnapshot().status === 'error') {
        await this.start();
        return;
      }
      await this.start();
      if (!this.ready) return;
      if (this.getSnapshot().adjustments.autoStrength > 0) {
        this.patch({ rendering: true });
        await this.refreshAutoAdjustments();
        this.patch({ rendering: false });
      }
      if (this.finished) return;
      const edit = this.normalizedEdit();
      this.finish();
      this.deps.onDone(edit);
    } finally {
      this.confirming = false;
    }
  }

  cancel(): void {
    if (this.finished) return;
    this.finish();
    this.deps.onCancel();
  }

  override dispose(): void {
    this.finish();
    super.dispose();
  }

  private finish(): void {
    this.finished = true;
    this.abort.abort();
    const editable = this.getSnapshot().editable;
    if (editable && !this.editableDeleted) {
      this.editableDeleted = true;
      void this.deps.files.delete(editable.uri);
    }
  }

  private normalizedEdit(): PhotoEdit {
    const edit = buildEdit(this.getSnapshot());
    return {
      ...edit,
      crop: isFullCrop(edit.crop) ? identityEdit().crop : edit.crop,
      adjustments:
        edit.adjustments.autoStrength === 0
          ? { ...edit.adjustments, auto: { ...ZERO_ADJUST_VALUES } }
          : edit.adjustments,
    };
  }

  private patch(change: Partial<PhotoEditState>): void {
    const next = { ...this.getSnapshot(), ...change };
    const edit = buildEdit(next);
    this.setState({
      ...next,
      adjustValues: effectiveAdjustValues(next.adjustments),
      autoOn: next.adjustments.autoStrength > 0,
      isIdentity: isIdentityEdit(edit),
    });
  }
}

function buildEdit(state: PhotoEditState): PhotoEdit {
  return {
    quarterTurns: state.quarterTurns,
    crop: cropRectToWindow(state.cropRect, state.quarterTurns),
    straightenDegrees: 0,
    filter: state.filter,
    adjustments: state.adjustments,
  };
}

function initialPhotoEditState(deps: PhotoEditViewModelDeps): PhotoEditState {
  const initial = deps.initialEdit ?? identityEdit();
  const adjustments: AdjustmentLayers = {
    auto: { ...initial.adjustments.auto },
    autoStrength: initial.adjustments.autoStrength,
    user: { ...initial.adjustments.user },
  };
  return {
    status: 'loading',
    errorMessage: null,
    tab: 'crop',
    editable: null,
    quarterTurns: initial.quarterTurns,
    aspect: 'free',
    cropRect: windowToCropRect(initial.crop, initial.quarterTurns),
    filter: initial.filter,
    selectedAdjust: 'auto',
    adjustments,
    adjustValues: effectiveAdjustValues(adjustments),
    autoOn: adjustments.autoStrength > 0,
    isIdentity: isIdentityEdit({ ...initial, adjustments }),
    rendering: false,
  };
}
