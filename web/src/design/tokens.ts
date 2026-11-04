// 디자인 토큰. 값의 원본은 shared/design/tokens.json 하나이고, :root CSS 변수(styles/tokens.css)는 그 파일에서 생성한다.
// 화면 코드는 색·간격·라운드를 `color.textPrimary`처럼 이름으로만 쓴다(값은 var(--…)라 CSS와 같은 출처).
import type { CSSProperties } from 'react';
import tokens from '../../../shared/design/tokens.json';

export const rawTokens = tokens;

type ColorName = keyof typeof tokens.color;
type SpaceName = keyof typeof tokens.spacing;
type RadiusName = keyof typeof tokens.radius;
export type FontStyleName = keyof typeof tokens.font.styles;

const kebab = (s: string): string => s.replace(/([A-Z])/g, '-$1').toLowerCase();
const vars = <K extends string>(prefix: string, names: readonly K[], unit = ''): Record<K, string> =>
  Object.fromEntries(names.map((n) => [n, `var(--${prefix}-${kebab(n)})${unit}`])) as Record<K, string>;

/** `var(--color-…)`. */
export const color = vars('color', Object.keys(tokens.color) as ColorName[]);
/** `var(--space-…)`(px). */
export const space = vars('space', Object.keys(tokens.spacing) as SpaceName[]);
/** `var(--radius-…)`(px). pill는 9999. */
export const radius = vars('radius', Object.keys(tokens.radius) as RadiusName[]);

/** 글자 스타일 한 벌(굵기·크기·행간·글꼴). 스타일 이름은 tokens.json font.styles. */
export function font(name: FontStyleName): CSSProperties {
  const n = kebab(name);
  const style = tokens.font.styles[name] as { letterSpacing?: number };
  return {
    fontFamily: `var(--font-${n}-family)`,
    fontWeight: `var(--font-${n}-weight)` as unknown as number,
    fontSize: `var(--font-${n}-size)`,
    lineHeight: `var(--font-${n}-line-height)`,
    ...(style.letterSpacing !== undefined ? { letterSpacing: `var(--font-${n}-letter-spacing)` } : {}),
  };
}
