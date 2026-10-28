/** 비어 있거나 손상돼 읽을 수 없는 사진 데이터(TC-UPL-021). 지원하지 않는 형식도 같다(TC-UPL-044). */
export class ImageDecodeError extends Error {
  constructor(message = 'cannot decode image') {
    super(message);
    this.name = 'ImageDecodeError';
  }
}
