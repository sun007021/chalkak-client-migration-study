import type { PushRegistrar } from './PushRegistrar';

/** 푸시 기기 등록 PR(notification-push) 전까지의 자리표시자. */
export class NoopPushRegistrar implements PushRegistrar {
  async registerDevice(): Promise<void> {}
  resetRegistrationCache(): void {}
}
