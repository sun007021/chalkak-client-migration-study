import http from 'node:http';
import https from 'node:https';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { resolveUploadProxyTarget } from '../src/core/net/uploadProxyTarget.ts';
import { UPLOAD_PROXY_PREFIX } from '../src/core/net/UploadUrlRewriter.ts';

/** 대상으로 보내지 않을 요청 헤더. Host는 대상 호스트로 새로 정하고, Origin·Referer·쿠키는 S3가 CORS 요청으로 보지 않도록 뺀다. */
const DROPPED_REQUEST_HEADERS = new Set(['host', 'origin', 'referer', 'cookie', 'connection', 'proxy-connection', 'keep-alive', 'upgrade']);

function forward(req: IncomingMessage & { originalUrl?: string }, res: ServerResponse, extraHosts: readonly string[]): void {
  const target = resolveUploadProxyTarget(req.originalUrl ?? req.url ?? '', extraHosts);
  if (!target) {
    res.statusCode = 404;
    res.end();
    return;
  }
  const origin = new URL(target.origin);
  const headers: http.OutgoingHttpHeaders = {};
  for (const [name, value] of Object.entries(req.headers)) {
    if (!DROPPED_REQUEST_HEADERS.has(name)) headers[name] = value;
  }
  // presigned 서명(SigV4)은 Host를 포함하므로 원래 S3 호스트(포트 포함)로 맞춘다.
  headers.host = origin.host;
  const transport = origin.protocol === 'https:' ? https : http;
  const upstream = transport.request({ protocol: origin.protocol, hostname: origin.hostname, port: origin.port || undefined, method: req.method, path: target.path, headers }, (response) => {
    res.writeHead(response.statusCode ?? 502, response.headers);
    response.pipe(res);
  });
  upstream.on('error', () => {
    if (!res.headersSent) res.statusCode = 502;
    res.end();
  });
  req.pipe(upstream);
}

/**
 * 개발 서버와 preview 서버에서 `/__upload-proxy/<호스트>/<경로>?<쿼리>`를 그 호스트로 중계한다(브라우저가 버킷 CORS 없이 presigned PUT을 보내도록).
 * 호스트가 요청마다 달라 요청 경로에서 대상을 정한다. 허용 호스트는 resolveUploadProxyTarget이 제한한다.
 */
export function uploadProxyPlugin(options: { extraHosts?: readonly string[] } = {}): Plugin {
  const extraHosts = options.extraHosts ?? [];
  const handler = (req: IncomingMessage, res: ServerResponse) => forward(req, res, extraHosts);
  return {
    name: 'chalkak-upload-proxy',
    configureServer(server) {
      server.middlewares.use(UPLOAD_PROXY_PREFIX, handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(UPLOAD_PROXY_PREFIX, handler);
    },
  };
}
