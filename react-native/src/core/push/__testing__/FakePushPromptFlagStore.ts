import type { PushPromptFlagStore } from '../PushPromptFlagStore';

export class FakePushPromptFlagStore implements PushPromptFlagStore {
  markCalls = 0;

  constructor(public requested = false) {}

  async wasRequested(): Promise<boolean> {
    return this.requested;
  }

  async markRequested(): Promise<void> {
    this.markCalls += 1;
    this.requested = true;
  }
}
