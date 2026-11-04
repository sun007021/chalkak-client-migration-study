// shared/design(tokens.json, icons/*.svg)에서 웹이 쓰는 파일을 만든다. 손으로 고치지 않는다.
//   node vite/design/generate.ts          → src/styles/tokens.css, src/core/ui/icons.generated.tsx 갱신
//   generate.test.ts 가 디스크의 파일이 이 출력과 같은지 확인한다.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../shared/design/', import.meta.url));
const webRoot = fileURLToPath(new URL('../../', import.meta.url));

export const TOKENS_CSS_PATH = `${webRoot}src/styles/tokens.css`;
export const ICONS_TSX_PATH = `${webRoot}src/core/ui/icons.generated.tsx`;

interface FontStyle { family: string; weight: number; size: number; lineHeight: number; letterSpacing?: number }
interface Tokens {
  color: Record<string, string>;
  font: { styles: Record<string, FontStyle> };
  spacing: Record<string, number>;
  radius: Record<string, number>;
}

const kebab = (s: string): string => s.replace(/([A-Z])/g, '-$1').toLowerCase();
const FAMILY_VAR: Record<string, string> = { pretendard: 'var(--font-pretendard)', brand: 'var(--font-brand)', handwriting: 'var(--font-handwriting)' };

/** tokens.json → :root CSS 변수. 글자 크기는 rem(루트 16px 기준, 접근성 글자 크기 확대 지원). */
export function buildTokensCss(): string {
  const tokens = JSON.parse(readFileSync(`${root}tokens.json`, 'utf8')) as Tokens;
  const lines: string[] = [];
  for (const [name, value] of Object.entries(tokens.color)) lines.push(`  --color-${kebab(name)}: ${value};`);
  for (const [name, value] of Object.entries(tokens.spacing)) lines.push(`  --space-${kebab(name)}: ${value}px;`);
  for (const [name, value] of Object.entries(tokens.radius)) lines.push(`  --radius-${kebab(name)}: ${value}px;`);
  for (const [name, s] of Object.entries(tokens.font.styles)) {
    const n = kebab(name);
    lines.push(`  --font-${n}-family: ${FAMILY_VAR[s.family] ?? s.family};`);
    lines.push(`  --font-${n}-weight: ${s.weight};`);
    lines.push(`  --font-${n}-size: ${s.size / 16}rem;`);
    lines.push(`  --font-${n}-line-height: ${s.lineHeight / 16}rem;`);
    if (s.letterSpacing !== undefined) lines.push(`  --font-${n}-letter-spacing: ${s.letterSpacing / 16}rem;`);
  }
  return `/* shared/design/tokens.json 에서 생성(node vite/design/generate.ts). 손으로 고치지 않는다. */\n:root {\n${lines.join('\n')}\n}\n`;
}

// 원본 색을 그대로 쓰는 아이콘(template 아님). 나머지는 어두운 색을 currentColor로 바꿔 CSS color로 칠한다.
const ORIGINAL_COLOR = new Set(['ic_checkbox_selected', 'ic_checkbox_unselected', 'ic_bottom_write', 'ic_notification_logo', 'img_signature_hint_sample']);
const TINT = /#2B2724|#000000|black|#1D1B20|#7D7D7D|#D1CFCA/gi;
// 흰색으로 그려진 template 아이콘(안드로이드 벡터): 흰색도 currentColor로 바꾼다.
const WHITE_TEMPLATE = new Set(['ic_rotate_right']);
const ATTR_NAME: Record<string, string> = { 'clip-path': 'clipPath', 'clip-rule': 'clipRule', 'fill-rule': 'fillRule', 'fill-opacity': 'fillOpacity', 'stroke-opacity': 'strokeOpacity', 'stroke-width': 'strokeWidth', 'stroke-linecap': 'strokeLinecap', 'stroke-linejoin': 'strokeLinejoin' };
const TAG_NAME: Record<string, string> = { clippath: 'clipPath' };

const pascal = (file: string): string => file.replace(/\.svg$/, '').split(/[_]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');

function toJsx(body: string, tint: boolean, idPrefix: string, white: boolean): string {
  return body
    .replace(/<(\/?)([a-zA-Z]+)([^>]*?)(\/?)>/g, (_m, close: string, tag: string, attrs: string, selfClose: string) => {
      const name = TAG_NAME[tag.toLowerCase()] ?? tag;
      if (close) return `</${name}>`;
      const converted = attrs.replace(/\s+([a-zA-Z:-]+)="([^"]*)"/g, (_a, key: string, value: string) => {
        let v = value;
        if (tint && (key === 'fill' || key === 'stroke')) v = v.replace(TINT, 'currentColor');
        if (white && (key === 'fill' || key === 'stroke')) v = v.replace(/#FFFFFF/gi, 'currentColor');
        if (key === 'id') v = `${idPrefix}${v}`;
        if (key === 'clip-path') v = v.replace(/url\(#(.+)\)/, `url(#${idPrefix}$1)`);
        return ` ${ATTR_NAME[key] ?? key}="${v}"`;
      });
      return `<${name}${converted}${selfClose ? ' /' : ''}>`;
    })
    .replace(/\n\s*/g, '');
}

export function buildIconsTsx(): string {
  const files = readdirSync(`${root}icons`).filter((f) => f.endsWith('.svg') && f.startsWith('ic_') || f === 'apple_logo.svg').sort();
  const parts: string[] = [];
  const names: string[] = [];
  for (const file of files) {
    const svg = readFileSync(`${root}icons/${file}`, 'utf8');
    const open = /<svg([^>]*)>/.exec(svg);
    if (!open) throw new Error(`svg 아님: ${file}`);
    const viewBox = /viewBox="([^"]*)"/.exec(open[1] ?? '')?.[1] ?? '0 0 24 24';
    const nominal = Number(/\swidth="([\d.]+)"/.exec(open[1] ?? '')?.[1] ?? 24);
    const base = file.replace(/\.svg$/, '');
    const name = pascal(file);
    names.push(name);
    const inner = svg.slice(open.index + open[0].length, svg.lastIndexOf('</svg>'));
    const jsx = toJsx(inner, !ORIGINAL_COLOR.has(base), `${base}-`, WHITE_TEMPLATE.has(base));
    parts.push(`/** ${file} */\nexport const ${name} = makeIcon('${viewBox}', ${nominal}, <>${jsx}</>);`);
  }
  const header = `// shared/design/icons/*.svg 에서 생성(node vite/design/generate.ts). 손으로 고치지 않는다.
// 어두운 색은 currentColor라 CSS color로 칠한다. 체크박스·작성 버튼처럼 원본 색을 쓰는 것만 색이 고정이다.
import type { CSSProperties, ReactNode } from 'react';

export interface IconProps {
  /** 한 변 px. 기본은 원본 SVG 크기. */
  size?: number;
  className?: string;
  style?: CSSProperties;
}
export type IconComponent = (props: IconProps) => ReactNode;

function makeIcon(viewBox: string, nominal: number, children: ReactNode): IconComponent {
  return function Icon({ size = nominal, className, style }: IconProps): ReactNode {
    return (
      <svg width={size} height={size} viewBox={viewBox} className={className} style={{ flex: 'none', ...style }} aria-hidden="true" focusable="false">
        {children}
      </svg>
    );
  };
}
`;
  return `${header}\n${parts.join('\n\n')}\n\nexport const ICON_NAMES = [${names.map((n) => `'${n}'`).join(', ')}] as const;\n`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  writeFileSync(TOKENS_CSS_PATH, buildTokensCss());
  writeFileSync(ICONS_TSX_PATH, buildIconsTsx());
}
