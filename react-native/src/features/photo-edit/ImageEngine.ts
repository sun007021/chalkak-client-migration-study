import type { ImageFile, RgbaImage, Size } from './ImageTypes';
import type { CropWindow, PhotoEdit, QuarterTurns } from './PhotoEdit';

export type WebpEncodeRequest = {
  sourceUri: string;
  /** 원본의 표시 크기(EXIF 방향 반영). */
  sourceSize: Size;
  /** 편집을 적용하기 전에 원본을 줄여 둘 크기(sourceSize 이하, 확대 없음). 자르기 비율은 이 크기에 대한 것이다. */
  targetSize: Size;
  /** 편집하지 않은 사진(identity)은 null: 다시 그리지 않고 그대로 인코딩한다(REQ-UPL-028). */
  edit: PhotoEdit | null;
  quality: number;
};

export type EncodedImage = ImageFile & { byteLength: number };

export type AnalysisSampleRequest = {
  /** EXIF가 반영된 편집용 이미지. */
  sourceUri: string;
  sourceSize: Size;
  quarterTurns: QuarterTurns;
  crop: CropWindow;
  /** 자른 영역을 이 긴 변으로 줄여 돌려준다(256). */
  maxLongEdge: number;
};

/**
 * 네이티브 이미지 작업의 경계(구현 예: expo-image-manipulator + 픽셀 파이프라인).
 * 모든 결과 파일은 임시 파일이고 지우는 책임은 호출한 쪽에 있다. 실패는 ImageDecodeError(읽을 수 없는 사진) 등으로 던진다.
 * 작업은 signal이 abort되면 CancelledError로 끝난다.
 */
export interface ImageEngine {
  /** 크기만 읽는다(전체 해상도 비트맵 금지). EXIF 방향을 반영한 표시 크기. 비어 있거나 손상되면 ImageDecodeError. */
  readBounds(uri: string, signal?: AbortSignal): Promise<Size>;
  /** 편집기용 정방향 이미지: EXIF 방향 반영, 긴 변이 maxLongEdge 이하(확대 없음). */
  prepareEditable(uri: string, maxLongEdge: number, signal?: AbortSignal): Promise<ImageFile>;
  /** 자동 보정 분석용 표본. 분석할 수 없으면 null(REQ-EDIT-027). */
  samplePixels(request: AnalysisSampleRequest, signal?: AbortSignal): Promise<RgbaImage | null>;
  /** 원본에서 한 번에 손실 WebP로: 디코드 -> EXIF 회전 -> targetSize -> 편집 -> 인코딩(중간 손실 압축 없음, 메타데이터 제거). */
  encodeWebp(request: WebpEncodeRequest, signal?: AbortSignal): Promise<EncodedImage>;
  /**
   * 한 라운드(같은 사진·크기·편집)의 중간 결과를 놓는다. 품질 사다리 동안 같은 라운드는 다시 만들지 않고 WebP 저장만 되풀이하므로,
   * 인코더가 라운드를 마치면(성공·실패·취소) 부른다. 중간 결과가 없는 구현은 구현하지 않아도 된다.
   */
  releaseRound?(): void;
}
