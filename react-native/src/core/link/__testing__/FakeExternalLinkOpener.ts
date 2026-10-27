import type { ExternalLinkOpener } from '../ExternalLinkOpener';

export class FakeExternalLinkOpener implements ExternalLinkOpener {
  readonly opened: string[] = [];
  constructor(private result = true) {}

  setResult(result: boolean): void {
    this.result = result;
  }

  open(url: string): Promise<boolean> {
    this.opened.push(url);
    return Promise.resolve(this.result);
  }
}
