import { ViewModel } from '../../../core/state/ViewModel';
import { POST_IMAGE_MAX_LONG_EDGE } from '../../../constants';
import { IDENTITY_EDIT } from '../editModel';
import type { AdjustmentKey, AdjustmentLayers, PhotoEdit, PhotoFilter } from '../editModel';
import type { ImageDecoder } from '../imagePorts';
import type { Size } from '../imageSizing';
import type { AdjustmentValues } from './adjustments';
import { FULL_RECT } from './cropGeometry';
import type { CropRatioId, CropRect } from './cropGeometry';
import type { AutoAnalyzer, PreviewRenderer } from './editorPorts';

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
  constructor(protected readonly deps: PhotoEditorDeps) {
    super(INITIAL);
  }

  start(): void {
    throw new Error('not implemented');
  }

  /** 지금 편집값(정규화 전). */
  draft(): PhotoEdit {
    throw new Error('not implemented');
  }

  selectTool(_tool: EditorTool): void {
    throw new Error('not implemented');
  }

  /** 비율 선택(REQ-EDIT-011): 고정 비율/원본은 전체 사진에서 가장 크게 다시 시작, 자유는 현재 영역 유지·고정 해제. */
  selectRatio(_ratio: CropRatioId): void {
    throw new Error('not implemented');
  }

  /** 끌기 결과 영역을 반영한다(clampRect로 한 번 더 보정). */
  setCropRect(_rect: CropRect): void {
    throw new Error('not implemented');
  }

  /** 시계 방향 90도(REQ-EDIT-014, 015). */
  rotate(): void {
    throw new Error('not implemented');
  }

  /** 자르기 "초기화": 회전·자르기 영역·비율만 처음으로(REQ-EDIT-016). 필터·조정은 유지. */
  resetCrop(): void {
    throw new Error('not implemented');
  }

  /** 항목 선택(REQ-EDIT-021): 다른 항목에서 'auto'로 오면 꺼져 있을 때만 강도 1, 이미 'auto'가 선택된 채 다시 누르면 1과 0을 번갈아. */
  selectAdjustItem(_item: AdjustItem): void {
    throw new Error('not implemented');
  }

  setAdjustValue(_key: AdjustmentKey, _value: number): void {
    throw new Error('not implemented');
  }

  setAutoStrength(_strength: number): void {
    throw new Error('not implemented');
  }

  /** 자동 보정 토글: 켜짐(1) ↔ 꺼짐(0). */
  toggleAuto(): void {
    throw new Error('not implemented');
  }

  /** 조정 "초기화"(REQ-EDIT-024). */
  resetAdjust(): void {
    throw new Error('not implemented');
  }

  selectFilter(_filter: PhotoFilter): void {
    throw new Error('not implemented');
  }

  confirm(): Promise<void> {
    throw new Error('not implemented');
  }

  cancel(): void {
    throw new Error('not implemented');
  }

  /** 오류 알림의 "다시 시도": 읽기 실패면 디코드부터, "완료" 실패였으면 미리보기를 다시 그리고 성공하면 이어서 완료한다. */
  retry(): void {
    throw new Error('not implemented');
  }
}

