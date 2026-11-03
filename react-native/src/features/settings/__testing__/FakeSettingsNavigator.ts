import type { SettingsNavigator } from '../SettingsNavigator';

export class FakeSettingsNavigator implements SettingsNavigator {
  feedbackOpens = 0;
  signatureChangeOpens = 0;

  openFeedback(): void {
    this.feedbackOpens += 1;
  }

  openSignatureChange(): void {
    this.signatureChangeOpens += 1;
  }
}
