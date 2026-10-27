import type { ExternalLinkOpener, ExternalLinkResult } from '../ExternalLinkOpener';

export class FakeExternalLinkOpener implements ExternalLinkOpener {
  readonly opened: string[] = [];
  result: ExternalLinkResult = 'opened';

  async open(url: string): Promise<ExternalLinkResult> {
    this.opened.push(url);
    return this.result;
  }
}
