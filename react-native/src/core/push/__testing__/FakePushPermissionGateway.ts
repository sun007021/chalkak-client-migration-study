import type { PushPermissionGateway, PushPermissionStatus } from '../PushPermissionGateway';

export class FakePushPermissionGateway implements PushPermissionGateway {
  statusCalls = 0;
  requestCalls = 0;
  /** request()가 돌려줄 결과. */
  resultOnRequest: PushPermissionStatus = 'granted';
  failRequest = false;

  constructor(public current: PushPermissionStatus = 'undetermined') {}

  async status(): Promise<PushPermissionStatus> {
    this.statusCalls += 1;
    return this.current;
  }

  async request(): Promise<PushPermissionStatus> {
    this.requestCalls += 1;
    if (this.failRequest) throw new Error('permission request failed');
    this.current = this.resultOnRequest;
    return this.current;
  }
}
