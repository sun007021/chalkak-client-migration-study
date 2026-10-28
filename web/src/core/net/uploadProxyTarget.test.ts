import { resolveUploadProxyTarget } from './uploadProxyTarget';

describe('resolveUploadProxyTarget', () => {
  it('S3 호스트는 https origin과 서명된 경로·쿼리 그대로로 푼다', () => {
    expect(resolveUploadProxyTarget('/__upload-proxy/b.s3.ap-northeast-2.amazonaws.com/k/a%20b.png?X-Amz-Signature=0f%2Bx&a=1')).toEqual({
      origin: 'https://b.s3.ap-northeast-2.amazonaws.com',
      path: '/k/a%20b.png?X-Amz-Signature=0f%2Bx&a=1',
    });
  });
  it('loopback은 포트를 포함해 http로 푼다', () => {
    expect(resolveUploadProxyTarget('/__upload-proxy/localhost:4010/__upload/x?X=1')).toEqual({ origin: 'http://localhost:4010', path: '/__upload/x?X=1' });
  });
  it('경로가 없으면 /', () => {
    expect(resolveUploadProxyTarget('/__upload-proxy/b.s3.amazonaws.com')?.path).toBe('/');
    expect(resolveUploadProxyTarget('/__upload-proxy/b.s3.amazonaws.com?x=1')?.path).toBe('/?x=1');
  });
  it('허용 목록 밖 호스트, userinfo, 접두 아님은 null', () => {
    expect(resolveUploadProxyTarget('/__upload-proxy/evil.example/x')).toBeNull();
    expect(resolveUploadProxyTarget('/__upload-proxy/amazonaws.com.evil.example/x')).toBeNull();
    expect(resolveUploadProxyTarget('/__upload-proxy/u@b.s3.amazonaws.com/x')).toBeNull();
    expect(resolveUploadProxyTarget('/api/v1/x')).toBeNull();
  });
  it('추가 허용 호스트는 https로 푼다', () => {
    expect(resolveUploadProxyTarget('/__upload-proxy/files.example/x', ['files.example'])).toEqual({ origin: 'https://files.example', path: '/x' });
  });
});
