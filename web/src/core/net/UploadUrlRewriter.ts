/**
 * presigned PUT 대상 주소를 바꾸는 훅. 브라우저가 S3로 직접 PUT하면 버킷에 CORS가 없을 수 있어(W4 확인 항목) 개발 프록시 경유가 필요하다.
 * 기본은 IdentityUploadUrlRewriter(그대로). 원본 URL의 허용 검사(https·loopback)는 바꾸기 전 주소로 한다.
 */
export interface UploadUrlRewriter {
  rewrite(url: string): string;
}

export class IdentityUploadUrlRewriter implements UploadUrlRewriter {
  rewrite(url: string): string {
    return url;
  }
}

/** 개발 프록시가 받는 경로 접두. Vite 프록시 설정(구현 단계)이 이 접두를 원래 호스트로 넘긴다. */
export const UPLOAD_PROXY_PREFIX = '/__upload-proxy';

/**
 * 절대 URL → 같은 출처 `/__upload-proxy/<원래 호스트[:포트]>/<경로>?<쿼리>`. 서명이 걸린 경로와 쿼리는 바이트 그대로 보존한다.
 * 스킴은 담지 않는다(프록시가 loopback 호스트는 http, 그 밖은 https로 본다 — 임시안). 절대 URL이 아니거나 이미 프록시 경로면 그대로 돌려준다.
 */
export class DevProxyUploadUrlRewriter implements UploadUrlRewriter {
  private readonly prefix: string;

  constructor(options: { prefix?: string } = {}) {
    this.prefix = options.prefix ?? UPLOAD_PROXY_PREFIX;
  }

  rewrite(url: string): string {
    // 서명된 경로·쿼리를 바이트 그대로 보존하려고 URL 객체로 다시 직렬화하지 않고 문자열을 자른다.
    const match = /^https?:\/\/([^/?#]+)([^?#]*)(\?[^#]*)?/i.exec(url);
    if (!match) return url;
    const authority = match[1]!;
    if (authority.includes('@')) return url;
    const path = match[2] ?? '';
    const query = match[3] && match[3].length > 1 ? match[3] : '';
    return `${this.prefix}/${authority.toLowerCase()}${path}${query}`;
  }
}
