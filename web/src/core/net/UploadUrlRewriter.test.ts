import { DevProxyUploadUrlRewriter, IdentityUploadUrlRewriter, UPLOAD_PROXY_PREFIX } from './UploadUrlRewriter';

const S3 = 'https://chalkak-bucket.s3.ap-northeast-2.amazonaws.com/signatures/u1/original.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=300&X-Amz-Signature=abc123';

describe('IdentityUploadUrlRewriter', () => {
  it('기본 재작성은 주소를 그대로 돌려준다', () => {
    expect(new IdentityUploadUrlRewriter().rewrite(S3)).toBe(S3);
  });
});

describe('DevProxyUploadUrlRewriter', () => {
  const rewriter = new DevProxyUploadUrlRewriter();

  it('접두는 /__upload-proxy다', () => {
    expect(UPLOAD_PROXY_PREFIX).toBe('/__upload-proxy');
  });

  it('절대 URL을 같은 출처 /__upload-proxy/<원래 호스트>/<경로>?<쿼리>로 바꾼다', () => {
    expect(rewriter.rewrite(S3)).toBe(
      '/__upload-proxy/chalkak-bucket.s3.ap-northeast-2.amazonaws.com/signatures/u1/original.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=300&X-Amz-Signature=abc123',
    );
  });

  it('서명이 걸린 쿼리는 바이트 그대로 보존한다(퍼센트 인코딩, 순서, 중복 키 포함)', () => {
    const url = 'https://b.s3.amazonaws.com/k/a%20b.png?X-Amz-Credential=AKIA%2F20261027%2Fap-northeast-2%2Fs3%2Faws4_request&a=1&a=2&X-Amz-Signature=0f%2Bx';
    expect(rewriter.rewrite(url)).toBe('/__upload-proxy/b.s3.amazonaws.com/k/a%20b.png?X-Amz-Credential=AKIA%2F20261027%2Fap-northeast-2%2Fs3%2Faws4_request&a=1&a=2&X-Amz-Signature=0f%2Bx');
  });

  it('포트가 있으면 호스트에 포함한다(로컬 mock 서버)', () => {
    expect(rewriter.rewrite('http://localhost:4010/__upload/55555555-5555-4555-8555-555555555512?X-Amz-Expires=300')).toBe(
      '/__upload-proxy/localhost:4010/__upload/55555555-5555-4555-8555-555555555512?X-Amz-Expires=300',
    );
  });

  it('쿼리가 없으면 ?를 붙이지 않는다', () => {
    expect(rewriter.rewrite('https://b.s3.amazonaws.com/k/a.png')).toBe('/__upload-proxy/b.s3.amazonaws.com/k/a.png');
  });

  it('호스트는 소문자로 적고 경로의 대소문자는 바꾸지 않는다', () => {
    expect(rewriter.rewrite('https://B.S3.Amazonaws.com/Key/File.PNG?X=1')).toBe('/__upload-proxy/b.s3.amazonaws.com/Key/File.PNG?X=1');
  });

  it('이미 프록시 경로이거나 절대 URL이 아니면 그대로 둔다(두 번 바꾸지 않는다)', () => {
    const once = rewriter.rewrite(S3);
    expect(rewriter.rewrite(once)).toBe(once);
    expect(rewriter.rewrite('/relative/path?x=1')).toBe('/relative/path?x=1');
  });

  it('접두를 바꿀 수 있다', () => {
    expect(new DevProxyUploadUrlRewriter({ prefix: '/up' }).rewrite('https://h.example/p?q=1')).toBe('/up/h.example/p?q=1');
  });
});
