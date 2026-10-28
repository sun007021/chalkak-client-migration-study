export type Size = { width: number; height: number };

/** 임시 파일로 존재하는 이미지와 그 표시 크기(EXIF 방향 반영). */
export type ImageFile = { uri: string } & Size;

/** 8비트 RGBA 픽셀 버퍼(행 우선, `data.length === width * height * 4`). */
export type RgbaImage = Size & { data: Uint8ClampedArray };
