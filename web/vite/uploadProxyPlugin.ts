import http from 'node:http';
import https from 'node:https';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { resolveUploadProxyTarget } from '../src/core/net/uploadProxyTarget.ts';
import { UPLOAD_PROXY_PREFIX } from '../src/core/net/UploadUrlRewriter.ts';

export interface UploadProxyOptions {
  extraHosts?: readonly string[];
  loopbackPorts?: readonly number[];
  /** preview 서버에도 붙일지. 개발 서버에는 항상 붙는다. */
  previewEnabled?: boolean;
  /** 대상 응답이 없을 때 끊는 시간(ms). 기본 60초. */
  timeoutMs?: number;
}

const ALLOWED_METHODS = new Set(['PUT', 'OPTIONS']);
/** 대상으로 보낼 요청 헤더만 통과시킨다. Host는 대상으로 새로 정하고 Origin·Referer·쿠키·인증 헤더는 보내지 않는다. */
const ALLOWED_REQUEST_HEADER = /^(content-type|content-length|content-md5|x-amz-[a-z0-9-]+)$/;

type ReqWithOriginal = IncomingMessage & { originalUrl?: string };

/**
 * `/__upload-proxy/<호스트>/<경로>?<쿼리>`를 그 호스트로 중계하는 connect 핸들러. PUT·OPTIONS만 받는다(그 외 405).
 * presigned 서명(SigV4)이 Host를 포함하므로 Host는 원래 S3 호스트(포트 포함)로 맞춘다.
 */
export function createUploadProxyHandler(options: UploadProxyOptions = {}): (req: IncomingMessage, res: ServerResponse) => void {
  const targetOptions = { extraHosts: options.extraHosts, loopbackPorts: options.loopbackPorts };
  const timeoutMs = options.timeoutMs ?? 60_000;
  return (incoming, res) => {
    const req = incoming as ReqWithOriginal;
    if (!ALLOWED_METHODS.has(req.method ?? '')) {
      res.statusCode = 405;
      res.setHeader('allow', 'PUT, OPTIONS');
      res.end();
      return;
    }
    const target = resolveUploadProxyTarget(req.originalUrl ?? req.url ?? '', targetOptions);
    if (!target) {
      res.statusCode = 404;
      res.end();
      return;
    }
    const origin = new URL(target.origin);
    const headers: http.OutgoingHttpHeaders = {};
    for (const [name, value] of Object.entries(req.headers)) {
      if (ALLOWED_REQUEST_HEADER.test(name)) headers[name] = value;
    }
    headers.host = origin.host;
    const transport = origin.protocol === 'https:' ? https : http;
    const fail = () => {
      if (res.headersSent) res.destroy();
      else {
        res.statusCode = 502;
        res.end();
      }
    };
    const upstream = transport.request({ protocol: origin.protocol, hostname: origin.hostname, port: origin.port || undefined, method: req.method, path: target.path, headers }, (response) => {
      res.writeHead(response.statusCode ?? 502, response.headers);
      response.on('error', fail);
      response.pipe(res);
    });
    upstream.setTimeout(timeoutMs, () => upstream.destroy(new Error('upstream timeout')));
    upstream.on('error', fail);
    // 브라우저가 먼저 끊으면 대상 연결도 끊는다.
    res.on('close', () => {
      if (!res.writableEnded) upstream.destroy();
    });
    req.pipe(upstream);
  };
}

/** 개발 서버(항상)와 preview 서버(previewEnabled일 때만)에 업로드 중계를 붙인다. */
export function uploadProxyPlugin(options: UploadProxyOptions = {}): Plugin {
  const handler = createUploadProxyHandler(options);
  return {
    name: 'chalkak-upload-proxy',
    configureServer(server) {
      server.middlewares.use(UPLOAD_PROXY_PREFIX, handler);
    },
    configurePreviewServer(server) {
      if (options.previewEnabled) server.middlewares.use(UPLOAD_PROXY_PREFIX, handler);
    },
  };
}
