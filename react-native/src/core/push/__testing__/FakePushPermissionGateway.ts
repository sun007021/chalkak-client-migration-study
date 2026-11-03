import type { PushPermissionGateway, PushPermissionStatus } from '../PushPermissionGateway';

export class FakePushPermissionGateway implements PushPermissionGateway {
  statusCalls = 0;
  requestCalls = 0;
  /** request()가 돌려줄 결과. */
  resultOnRequest: PushPermissionStatus = 'granted';
  failRequest = false;
  /** 지정하면 request()가 이 Promise가 풀릴 때까지 기다린다(권한 창이 열려 있는 상태). */
  requestGate: Promise<void> | null = null;

  constructor(public current: PushPermissionStatus = 'undetermined') {}

  async status(): Promise<PushPermissionStatus> {
    this.statusCalls += 1;
    return this.current;
  }

  settingsOpened = 0;

  async openSystemSettings(): Promise<void> {
    this.settingsOpened += 1;
  }

  async request(): Promise<PushPermissionStatus> {
    this.requestCalls += 1;
    if (this.requestGate) await this.requestGate;
    if (this.failRequest) throw new Error('permission request failed');
    this.current = this.resultOnRequest;
    return this.current;
  }
}
