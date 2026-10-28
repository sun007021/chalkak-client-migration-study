import { Observable } from '../../core/state/Observable';
import type { ImageEngine } from './ImageEngine';
import type { ImageFile, Size } from './ImageTypes';
import type { AspectKey, CropHandle, CropRect } from './CropGeometry';
import type {
  AdjustItem,
  AdjustValues,
  AdjustmentLayers,
  PhotoEdit,
  PhotoFilter,
  QuarterTurns,
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
 */
export class PhotoEditViewModel extends Observable<PhotoEditState> {
  constructor(private readonly deps: PhotoEditViewModelDeps) {
    super(initialPhotoEditState(deps));
  }

  /** 편집용 이미지 준비와 첫 자동 보정 분석. 여러 번 불러도 한 번만 일어나며, 실패 뒤에는 다시 시도한다. */
  start(): Promise<void> {
    throw new Error('not implemented');
  }

  selectTab(tab: EditTab): Promise<void> {
    void tab;
    throw new Error('not implemented');
  }

  selectAspect(aspect: AspectKey): void {
    void aspect;
    throw new Error('not implemented');
  }

  rotate(): void {
    throw new Error('not implemented');
  }

  /** 비율 단위로 영역을 옮긴다. */
  moveCrop(dx: number, dy: number): void {
    void dx;
    void dy;
    throw new Error('not implemented');
  }

  resizeCrop(handle: CropHandle, dx: number, dy: number): void {
    void handle;
    void dx;
    void dy;
    throw new Error('not implemented');
  }

  /** 자르기 "초기화": 회전과 자르기 영역·비율만 처음으로(필터·조정 유지). */
  resetCrop(): void {
    throw new Error('not implemented');
  }

  selectAdjust(item: 'auto' | AdjustItem): Promise<void> {
    void item;
    throw new Error('not implemented');
  }

  setAdjustValue(item: AdjustItem, value: number): void {
    void item;
    void value;
    throw new Error('not implemented');
  }

  /** 자동 보정 강도(0~1)를 직접 정한다. */
  setAutoStrength(strength: number): void {
    void strength;
    throw new Error('not implemented');
  }

  /** 조정 "초기화": 자동 강도 0, 직접 값 삭제, 분석값 유지. */
  resetAdjustments(): void {
    throw new Error('not implemented');
  }

  selectFilter(filter: PhotoFilter): void {
    void filter;
    throw new Error('not implemented');
  }

  /** "완료": 편집값을 정규화해 onDone으로 넘긴다. 준비 실패 상태면 닫지 않고 다시 시도한다. */
  done(): Promise<void> {
    throw new Error('not implemented');
  }

  cancel(): void {
    throw new Error('not implemented');
  }
}

function initialPhotoEditState(deps: PhotoEditViewModelDeps): PhotoEditState {
  void deps;
  throw new Error('not implemented');
}
