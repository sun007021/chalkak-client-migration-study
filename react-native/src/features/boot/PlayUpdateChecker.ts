import type { UpdateChecker, UpdateCheckResult } from './UpdateChecker';

export type PlayUpdateInfo = {
  availability: 'UPDATE_AVAILABLE' | 'UPDATE_NOT_AVAILABLE' | 'UNKNOWN';
  priority: number;
};

/** Play Core AppUpdateManager를 감싼 경계. 정보 조회 실패는 reject. */
export interface PlayUpdateClient {
  getUpdateInfo(): Promise<PlayUpdateInfo>;
}

export class PlayUpdateChecker implements UpdateChecker {
  constructor(private readonly client: PlayUpdateClient) {}

  /** UPDATE_AVAILABLE이고 priority >= 1이면 'update-required', priority 0이거나 업데이트 없음이면 'up-to-date', 조회 실패는 'unavailable'. */
  async check(): Promise<UpdateCheckResult> {
    try {
      const info = await this.client.getUpdateInfo();
      return info.availability === 'UPDATE_AVAILABLE' && info.priority >= 1
        ? 'update-required'
        : 'up-to-date';
    } catch {
      return 'unavailable';
    }
  }
}
