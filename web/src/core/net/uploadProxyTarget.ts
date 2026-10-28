import { UPLOAD_PROXY_PREFIX } from './UploadUrlRewriter.ts';

export interface UploadProxyTarget {
  /** 프록시가 연결할 origin(스킴 + 호스트[:포트]). */
  origin: string;
  /** 원래 S3 호스트로 보낼 경로와 쿼리(서명이 걸려 있어 그대로). */
  path: string;
}

/** 로컬 mock 서버 기본 포트. UPLOAD_PROXY_ALLOWED_LOOPBACK_PORTS로 바꾼다. loopback은 http만 지원한다(https 미지원). */
export const DEFAULT_LOOPBACK_PORTS: readonly number[] = [4010];
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const AWS_HOST = /(^|\.)amazonaws\.com(\.cn)?$/;

/**
 * 개발·preview 서버의 `/__upload-proxy/<호스트[:포트]>/<경로>?<쿼리>` 요청을 실제 대상으로 푼다. vite.config.ts가 쓴다(브라우저 번들에는 들어가지 않는다).
 * 대상 호스트는 허용 포트의 loopback(http), amazonaws.com(https), `extraHosts`(https)로 제한한다 — 개발 서버가 임의 호스트로 가는 열린 중계가 되지 않게.
 * 허용되지 않거나 형식이 맞지 않으면 null.
 */
export function resolveUploadProxyTarget(requestUrl: string, options: { extraHosts?: readonly string[]; loopbackPorts?: readonly number[]; prefix?: string } = {}): UploadProxyTarget | null {
  const extraHosts = options.extraHosts ?? [];
  const loopbackPorts = options.loopbackPorts ?? DEFAULT_LOOPBACK_PORTS;
  const prefix = options.prefix ?? UPLOAD_PROXY_PREFIX;
  if (!requestUrl.startsWith(`${prefix}/`)) return null;
  const rest = requestUrl.slice(prefix.length + 1);
  const slash = rest.search(/[/?]/);
  const authority = (slash === -1 ? rest : rest.slice(0, slash)).toLowerCase();
  const path = slash === -1 ? '/' : rest.slice(slash).replace(/^\?/, '/?');
  if (!/^[a-z0-9.[\]:-]+$/.test(authority) || authority.includes('@')) return null;
  const host = authority.replace(/:\d+$/, '');
  if (LOOPBACK_HOSTS.has(host)) {
    const port = Number(authority.slice(host.length + 1));
    return authority.length > host.length && loopbackPorts.includes(port) ? { origin: `http://${authority}`, path } : null;
  }
  if (AWS_HOST.test(host) || extraHosts.map((h) => h.toLowerCase()).includes(host)) return { origin: `https://${authority}`, path };
  return null;
}
