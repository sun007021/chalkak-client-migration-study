import type { PushRegistrar } from '../PushRegistrar';

export class FakePushRegistrar implements PushRegistrar {
  registerCalls = 0;
  resetCalls = 0;
  failRegister = false;

  async registerDevice(): Promise<void> {
    this.registerCalls += 1;
    if (this.failRegister) throw new Error('register failed');
  }

  resetRegistrationCache(): void {
    this.resetCalls += 1;
  }
}
