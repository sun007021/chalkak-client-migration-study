import type { PlayUpdateClient, PlayUpdateInfo } from './PlayUpdateChecker';

/**
 * Play In-App Update 네이티브 모듈을 붙이기 전의 기본 구현. 항상 조회 실패라
 * PlayUpdateChecker가 'unavailable'(통과)로 처리한다(D-15). 모듈을 붙이면 이 클래스를 교체한다.
 */
export class UnavailablePlayUpdateClient implements PlayUpdateClient {
  async getUpdateInfo(): Promise<PlayUpdateInfo> {
    throw new Error('Play In-App Update is not installed');
  }
}
