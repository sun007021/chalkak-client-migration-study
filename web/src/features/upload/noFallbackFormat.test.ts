import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/** 업로드 사진은 image/webp 하나뿐이다(폴백 금지, REQ-UPL-032~033). 다른 형식을 만들거나 data URL로 우회하는 코드가 들어오지 않게 한다. */
const FORBIDDEN = /image\/(?:jpeg|jpg|png|gif|heic)|toDataURL|["'`]jpe?g["'`]|["'`]png["'`]/i;
const ENCODER_CALL = /\b(?:toBlob|convertToBlob)\s*\(/;

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sourceFiles(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

const stripComments = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('업로드 이미지 형식 정적 검사', () => {
  const root = __dirname;
  const sources = sourceFiles(root).map((file) => ({ rel: relative(root, file), code: stripComments(readFileSync(file, 'utf8')) }));

  it('TC-UPL-032 TC-UPL-033 업로드 소스에는 JPEG/PNG 등 다른 형식 문자열·toDataURL이 없다', () => {
    expect(sources.length).toBeGreaterThan(5);
    expect(sources.filter((s) => FORBIDDEN.test(s.code)).map((s) => s.rel)).toEqual([]);
  });

  it('TC-UPL-032 canvas로 인코딩하는 소스는 image/webp(POST_IMAGE_CONTENT_TYPE)를 명시한다', () => {
    const encoders = sources.filter((s) => ENCODER_CALL.test(s.code));
    expect(encoders.filter((s) => !/image\/webp|POST_IMAGE_CONTENT_TYPE/.test(s.code)).map((s) => s.rel)).toEqual([]);
  });
});
