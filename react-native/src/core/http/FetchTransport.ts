import type { HttpRequest, HttpResponse, HttpTransport, SendOptions } from './HttpTransport';

export class FetchTransport implements HttpTransport {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  send(_request: HttpRequest, _options: SendOptions): Promise<HttpResponse> {
    void this.fetchImpl;
    throw new Error('not implemented');
  }
}
