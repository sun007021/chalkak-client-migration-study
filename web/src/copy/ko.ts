// 사용자 문구는 다섯 클라이언트 공용 shared/copy/ko.json이 기준이다(키 규칙은 shared/README.md).
import koJson from '../../../shared/copy/ko.json';

export const ko = koJson;
export type CopyKey = keyof typeof koJson;

/** 문구 표에 `{주제}`, `{M월 d일}`처럼 적힌 플레이스홀더를 params로 치환한다. params에 없는 자리는 그대로 둔다. */
export function t(key: CopyKey, params?: Readonly<Record<string, string | number>>): string {
  const template: string = ko[key];
  if (!params) return template;
  return template.replace(/\{([^{}]+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole));
}
