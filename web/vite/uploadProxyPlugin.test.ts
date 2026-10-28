// @vitest-environment node
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createUploadProxyHandler } from './uploadProxyPlugin.ts';

interface Seen {
  method?: string;
  url?: string;
  headers: http.IncomingHttpHeaders;
  bytes: number;
}

const servers: http.Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise((resolve) => (s.closeAllConnections(), s.close(resolve)))));
});
const listen = (server: http.Server): Promise<number> =>
  new Promise((resolve) => {
    servers.push(server);
    server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port));
  });

/** 가짜 S3(업스트림)와 프록시 핸들러를 띄운다. */
async function setup(behavior: (req: http.IncomingMessage, res: http.ServerResponse) => void = (_req, res) => res.writeHead(200).end(), timeoutMs?: number) {
  const seen: Seen[] = [];
  const upstreamPort = await listen(
    http.createServer((req, res) => {
      let bytes = 0;
      req.on('data', (c: Buffer) => (bytes += c.length));
      req.on('end', () => {
        seen.push({ method: req.method, url: req.url, headers: req.headers, bytes });
        behavior(req, res);
      });
    }),
  );
  const handler = createUploadProxyHandler({ loopbackPorts: [upstreamPort], timeoutMs });
  const proxyPort = await listen(http.createServer(handler));
  const call = (method: string, path: string, headers: Record<string, string> = {}, body?: string) =>
    fetch(`http://127.0.0.1:${proxyPort}${path}`, { method, headers, body });
  return { seen, upstreamPort, call };
}

describe('upload proxy handler', () => {
  it('PUT을 대상으로 중계하고 경로·쿼리를 그대로, Host는 대상 호스트로 보낸다', async () => {
    const { seen, upstreamPort, call } = await setup();
    const res = await call('PUT', `/__upload-proxy/127.0.0.1:${upstreamPort}/k/a%20b.png?X-Amz-Signature=0f%2Bx&a=1`, { 'content-type': 'image/png' }, 'abc');
    expect(res.status).toBe(200);
    expect(seen[0]).toMatchObject({ method: 'PUT', url: '/k/a%20b.png?X-Amz-Signature=0f%2Bx&a=1', bytes: 3 });
    expect(seen[0]!.headers.host).toBe(`127.0.0.1:${upstreamPort}`);
  });

  it('PUT·OPTIONS 외 메서드는 405이고 대상에 닿지 않는다', async () => {
    const { seen, upstreamPort, call } = await setup();
    for (const method of ['GET', 'POST', 'DELETE']) {
      const res = await call(method, `/__upload-proxy/127.0.0.1:${upstreamPort}/k`, {}, method === 'GET' ? undefined : 'x');
      expect(res.status, method).toBe(405);
    }
    expect(seen).toHaveLength(0);
    expect((await call('OPTIONS', `/__upload-proxy/127.0.0.1:${upstreamPort}/k`)).status).toBe(200);
  });

  it('전달 헤더는 허용 목록(content-type, content-length, content-md5, x-amz-*)만이다', async () => {
    const { seen, upstreamPort, call } = await setup();
    await call(
      'PUT',
      `/__upload-proxy/127.0.0.1:${upstreamPort}/k`,
      { 'content-type': 'image/png', 'content-md5': 'abc==', 'x-amz-acl': 'private', origin: 'http://localhost:5173', referer: 'http://localhost:5173/', cookie: 'a=b', authorization: 'Bearer t', 'x-custom': '1' },
      'abc',
    );
    const names = Object.keys(seen[0]!.headers);
    for (const banned of ['origin', 'referer', 'cookie', 'authorization', 'x-custom']) expect(names, banned).not.toContain(banned);
    expect(seen[0]!.headers).toMatchObject({ 'content-type': 'image/png', 'content-md5': 'abc==', 'x-amz-acl': 'private', 'content-length': '3' });
  });

  it('허용되지 않은 호스트·포트는 404다', async () => {
    const { seen, upstreamPort, call } = await setup();
    expect((await call('PUT', '/__upload-proxy/evil.example/k', {}, 'x')).status).toBe(404);
    expect((await call('PUT', `/__upload-proxy/127.0.0.1:${upstreamPort + 1}/k`, {}, 'x')).status).toBe(404);
    expect(seen).toHaveLength(0);
  });

  it('대상 응답 상태를 그대로 돌려준다(403 등)', async () => {
    const { upstreamPort, call } = await setup((_req, res) => res.writeHead(403).end('denied'));
    const res = await call('PUT', `/__upload-proxy/127.0.0.1:${upstreamPort}/k`, {}, 'x');
    expect(res.status).toBe(403);
    expect(await res.text()).toBe('denied');
  });

  it('대상에 연결할 수 없으면 502다', async () => {
    const closed = await listen(http.createServer());
    await new Promise((resolve) => servers.pop()!.close(resolve));
    const handler = createUploadProxyHandler({ loopbackPorts: [closed] });
    const proxyPort = await listen(http.createServer(handler));
    const res = await fetch(`http://127.0.0.1:${proxyPort}/__upload-proxy/127.0.0.1:${closed}/k`, { method: 'PUT', body: 'x' });
    expect(res.status).toBe(502);
  });

  it('대상이 응답하지 않으면 타임아웃으로 끊고 502다', async () => {
    const { upstreamPort, call } = await setup(() => undefined, 100);
    const res = await call('PUT', `/__upload-proxy/127.0.0.1:${upstreamPort}/k`, {}, 'x');
    expect(res.status).toBe(502);
  });
});
