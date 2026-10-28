/** 4라운드(품질 사다리 x 0.85 축소 3회)를 모두 써도 maxBytes 이하가 되지 못했다(REQ-UPL-032). */
export class SizeLimitExceededError extends Error {
  constructor(message = 'encoded image exceeds maxBytes') {
    super(message);
    this.name = 'SizeLimitExceededError';
  }
}

/** 정책 응답의 contentType이 image/webp가 아니다(REQ-UPL-026). */
export class UnsupportedContentTypeError extends Error {
  constructor(readonly contentType: string) {
    super(`unsupported upload content type: ${contentType}`);
    this.name = 'UnsupportedContentTypeError';
  }
}
