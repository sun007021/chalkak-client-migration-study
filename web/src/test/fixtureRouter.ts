import { loadFixture } from './fixtures';
import { FakeFetch, jsonResponse } from './fakeFetch';
import type { RecordedRequest } from './fakeFetch';

/** 'GET /topics?date=2026-10-27' 같은 키에 줄 응답: fixture 경로('home/topics__open-2026-10-27'), 직접 만든 응답 함수(두 번째 인자는 이 키로 온 호출 순번), 순서대로 소비하는 배열(마지막 반복). */
export type RouteValue = string | Response | ((req: RecordedRequest, index: number) => Response | Promise<Response>) | readonly RouteValue[];

interface Entry {
  value: RouteValue;
  /** 이 키의 호출 기록은 마지막 set 이후 것만 센다. */
  from: number;
  used: number;
}

const parseKey = (key: string): { method: string; path: string; query: URLSearchParams } => {
  const space = key.indexOf(' ');
  const method = key.slice(0, space);
  const url = new URL(key.slice(space + 1), 'http://localhost');
  return { method, path: url.pathname, query: url.searchParams };
};

const sameQuery = (a: URLSearchParams, b: URLSearchParams): boolean => {
  const left = [...a.entries()].sort().join('&');
  const right = [...b.entries()].sort().join('&');
  return left === right;
};

/**
 * FakeFetch 위의 키 기반 라우터. 키 = `METHOD /path?query`(쿼리는 순서 무관하게 전부 같아야 일치).
 * 라우트에 없는 요청은 TypeError(예상하지 못한 요청 = 연결 실패)로 거절하고 calls에 남는다.
 */
export class FixtureRouter {
  /** 같은 FakeFetch에 FixtureRouter를 여러 개 만들어도(openHome의 것과 테스트 본문의 `new FixtureRouter(h.ff)`) 같은 표를 쓴다.
   * FakeFetch는 먼저 등록한 경로가 우선이라 라우터마다 표를 따로 두면 나중 라우터의 set이 가려진다. */
  private static readonly tables = new WeakMap<FakeFetch, { entries: Map<string, Entry>; registered: Set<string> }>();
  private readonly entries: Map<string, Entry>;
  private readonly registered: Set<string>;

  constructor(
    private readonly ff: FakeFetch,
    initial: Record<string, RouteValue> = {},
  ) {
    const table = FixtureRouter.tables.get(ff) ?? { entries: new Map<string, Entry>(), registered: new Set<string>() };
    FixtureRouter.tables.set(ff, table);
    this.entries = table.entries;
    this.registered = table.registered;
    for (const [key, value] of Object.entries(initial)) this.set(key, value);
  }

  set(key: string, value: RouteValue): this {
    this.entries.set(key, { value, from: this.ff.calls.length, used: 0 });
    const { method, path } = parseKey(key);
    const spec = `${method} ${path}`;
    if (!this.registered.has(spec)) {
      this.registered.add(spec);
      this.ff.route(spec, (req) => this.dispatch(req));
    }
    return this;
  }

  /** 키와 일치하는 호출(마지막 set 이후). */
  calls(key: string): RecordedRequest[] {
    const entry = this.entries.get(key);
    const { method, path, query } = parseKey(key);
    return this.ff.calls.slice(entry?.from ?? 0).filter((c) => c.method === method && c.path === path && sameQuery(c.query, query));
  }

  private dispatch(req: RecordedRequest): Response | Promise<Response> {
    for (const [key, entry] of this.entries) {
      const { method, path, query } = parseKey(key);
      if (req.method !== method || req.path !== path || !sameQuery(req.query, query)) continue;
      const index = entry.used;
      entry.used += 1;
      return resolveValue(entry.value, req, index);
    }
    throw new TypeError(`FixtureRouter: no route for ${req.method} ${req.path}?${req.query.toString()}`);
  }
}

function resolveValue(value: RouteValue, req: RecordedRequest, index: number): Response | Promise<Response> {
  if (typeof value === 'string') return loadFixture(`${value}.json`).toResponse();
  if (value instanceof Response) return value.clone();
  if (Array.isArray(value)) return resolveValue((value as readonly RouteValue[])[Math.min(index, value.length - 1)]!, req, index);
  return (value as (r: RecordedRequest, i: number) => Response | Promise<Response>)(req, index);
}

/** 필요한 곳에서 json 응답을 짧게 만든다. */
export const json = jsonResponse;
