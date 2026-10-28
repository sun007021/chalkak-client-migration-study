import type { KstDate } from '../../core/time/KstDate';
import type { YearMonth } from '../../core/time/YearMonth';
import type { RecordPhoto } from '../../data/record/RecordModels';

// [가정] PR 7(업로드)의 core/media(GallerySaver, MediaPermissions)와 같은 개념이다. 그쪽이 main에 들어오면 구현자가 합친다.

export type CalendarImageInput = {
  month: YearMonth;
  photos: readonly RecordPhoto[];
  today: KstDate;
};

export type RenderedImage = { bytes: Uint8Array; width: number; height: number };

/** 현재 달 달력을 PNG로 그린다(REQ-REC-037). 화면 캡처 등 구현은 플랫폼 소관. */
export interface CalendarImageRenderer {
  render(input: CalendarImageInput): Promise<RenderedImage>;
}

/** 저장 권한이 거부됐다. */
export class ImagePermissionDeniedError extends Error {}

/** 사진 보관함에 PNG를 저장한다. 권한 거부는 ImagePermissionDeniedError, 그 밖의 실패는 아무 오류나 던진다. */
export interface CalendarImageSaver {
  save(image: { fileName: string; bytes: Uint8Array }): Promise<void>;
}
