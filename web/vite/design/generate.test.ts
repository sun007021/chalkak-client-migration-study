// @vitest-environment node
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import tokens from '../../../shared/design/tokens.json';
import { ICONS_TSX_PATH, TOKENS_CSS_PATH, buildIconsTsx, buildTokensCss } from './generate';

const fontsDir = fileURLToPath(new URL('../../src/assets/fonts/', import.meta.url));
const sharedFonts = fileURLToPath(new URL('../../../shared/design/fonts/', import.meta.url));

function cssVars(css: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of css.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) map.set(m[1] as string, (m[2] as string).trim());
  return map;
}
const kebab = (s: string): string => s.replace(/([A-Z])/g, '-$1').toLowerCase();

describe('디자인 토큰 대조(shared/design/tokens.json)', () => {
  it('src/styles/tokens.css가 tokens.json에서 생성한 결과와 같다(손으로 고치지 않았다)', () => {
    expect(readFileSync(TOKENS_CSS_PATH, 'utf8')).toBe(buildTokensCss());
  });

  it('색·간격·라운드·글자 스타일의 모든 값이 CSS 변수로 들어 있다', () => {
    const vars = cssVars(readFileSync(TOKENS_CSS_PATH, 'utf8'));
    for (const [k, v] of Object.entries(tokens.color)) expect(vars.get(`color-${kebab(k)}`)).toBe(v);
    for (const [k, v] of Object.entries(tokens.spacing)) expect(vars.get(`space-${kebab(k)}`)).toBe(`${v}px`);
    for (const [k, v] of Object.entries(tokens.radius)) expect(vars.get(`radius-${kebab(k)}`)).toBe(`${v}px`);
    for (const [k, s] of Object.entries(tokens.font.styles)) {
      expect(vars.get(`font-${kebab(k)}-weight`)).toBe(String(s.weight));
      expect(vars.get(`font-${kebab(k)}-size`)).toBe(`${s.size / 16}rem`);
      expect(vars.get(`font-${kebab(k)}-line-height`)).toBe(`${s.lineHeight / 16}rem`);
    }
  });

  it('핵심 값: 바탕 #F7F6F3, 본문·주 버튼 #2B2724, 버튼 라운드 12, 좌우 여백 25', () => {
    const vars = cssVars(readFileSync(TOKENS_CSS_PATH, 'utf8'));
    expect(vars.get('color-background')).toBe('#F7F6F3');
    expect(vars.get('color-text-primary')).toBe('#2B2724');
    expect(vars.get('color-action-primary')).toBe('#2B2724');
    expect(vars.get('radius-button')).toBe('12px');
    expect(vars.get('space-screen-horizontal')).toBe('25px');
  });

  it('아이콘 컴포넌트가 shared/design/icons/*.svg 에서 생성한 결과와 같다', () => {
    expect(readFileSync(ICONS_TSX_PATH, 'utf8')).toBe(buildIconsTsx());
  });

  it('번들 글꼴(woff2)이 shared/design/fonts 의 글꼴마다 있고 woff2 파일이다', () => {
    const names = readdirSync(sharedFonts).map((f) => f.replace(/\.(otf|ttf)$/, ''));
    expect(names).toHaveLength(5);
    for (const name of names) {
      const file = `${fontsDir}${name}.woff2`;
      expect(existsSync(file), name).toBe(true);
      expect(readFileSync(file).subarray(0, 4).toString('latin1')).toBe('wOF2');
    }
  });
});
