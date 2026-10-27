import { Observable } from '../../core/state/Observable';
import type { UpdateChecker } from './UpdateChecker';

export type ForceUpdateGateState = { blocked: boolean };

/**
 * 강제 업데이트 게이트. `enabled`가 false면 조회 없이 통과한다(REQ-BOOT-014).
 * 한 번 blocked가 되면 이후 조회가 unavailable이어도 유지하고, up-to-date를 받아도 앱 내에서는 풀지 않는다(REQ-BOOT-010).
 */
export class ForceUpdateGate extends Observable<ForceUpdateGateState> {
  constructor(
    private readonly checker: UpdateChecker,
    private readonly enabled: boolean,
  ) {
    super({ blocked: false });
  }

  /** 시작, 앱 재활성화(iOS), 온라인 복귀(Android)마다 부른다. 검사기가 throw해도 통과로 본다. */
  check(): Promise<void> {
    void this.checker;
    void this.enabled;
    throw new Error('not implemented');
  }
}
