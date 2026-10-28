import type { ExternalLinkOpener } from '../features/onboarding/ExternalLinkOpener';

export class FakeExternalLinkOpener implements ExternalLinkOpener {
  readonly opened: string[] = [];
  /** false면 브라우저가 열지 못한 것(팝업 차단). 'throw'면 예외. */
  result: boolean | 'throw' = true;
  open(url: string): boolean {
    this.opened.push(url);
    if (this.result === 'throw') throw new Error('popup blocked');
    return this.result;
  }
}
