import type {
  DevicePermissionStatus,
  NotificationPermissionGateway,
} from '../NotificationPermissionGateway';

/** 기기 알림 권한 Fake. `status`를 바꿔 권한 변화를 흉내 내고, 호출 기록으로 부작용을 확인한다. */
export class FakeNotificationPermission implements NotificationPermissionGateway {
  statusChecks = 0;
  requests = 0;
  settingsOpened = 0;
  /** request()가 돌려줄 결과('undetermined'이면 허용으로 바뀌지 않은 것으로 본다). */
  requestResult: DevicePermissionStatus = 'granted';
  /** getStatus()가 던지게 하려면 지정한다. */
  failure: Error | null = null;

  constructor(public status: DevicePermissionStatus = 'granted') {}

  async getStatus(): Promise<DevicePermissionStatus> {
    this.statusChecks += 1;
    if (this.failure) throw this.failure;
    return this.status;
  }

  async request(): Promise<DevicePermissionStatus> {
    this.requests += 1;
    this.status = this.requestResult;
    return this.status;
  }

  async openSystemSettings(): Promise<void> {
    this.settingsOpened += 1;
  }
}
