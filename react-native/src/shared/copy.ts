// 사용자 문구. 값의 원본은 `shared/copy/ko.json`(키 -> 한국어). 화면과 ViewModel은 키로만 접근한다.
import ko from '../../../shared/copy/ko.json';

export type CopyKey = keyof typeof ko;

/** 문구 키를 한국어 문구로 바꾼다. 플레이스홀더(`{주제}` 등)는 그대로 돌려주므로 호출 쪽에서 `format`으로 채운다. */
export function t(key: CopyKey): string {
  return ko[key];
}

/** `{이름}` 자리를 값으로 바꾼다. 값이 없는 자리는 그대로 둔다. */
export function format(
  template: string,
  values: Readonly<Record<string, string | number>>,
): string {
  return template.replace(/\{([^{}]+)\}/g, (whole, name: string) =>
    name in values ? String(values[name]) : whole,
  );
}
