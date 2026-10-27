import type { RasterRequest, SignatureRasterizer } from './SignatureRasterizer';

/**
 * 순수 TS 참조 래스터라이저 후보. 계약 테스트(rasterizerContract)를 jest에서 실제로 돌리기 위한 자리다.
 * 네이티브(Skia 등)로 가기로 하면 이 클래스는 삭제하고 계약 테스트를 기기 테스트로 옮긴다.
 */
export class SoftwareSignatureRasterizer implements SignatureRasterizer {
  rasterize(_request: RasterRequest): Promise<Uint8Array> {
    return Promise.reject(new Error('not implemented'));
  }
}
