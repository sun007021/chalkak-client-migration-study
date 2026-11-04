import tokensJson from '../../../../shared/design/tokens.json';
import { colors, fontAssets, radius, spacing, typography } from './tokens';

// shared/design/tokens.json 과 앱 토큰 모듈의 값이 같은지 대조한다(docs/design/README.md §2).
describe('디자인 토큰', () => {
  it('색·간격·라운드는 tokens.json 그대로다', () => {
    expect(colors).toEqual(tokensJson.color);
    expect(spacing).toEqual(tokensJson.spacing);
    expect(radius).toEqual(tokensJson.radius);
  });

  it('주요 값이 원본 앱과 같다', () => {
    expect(colors.background).toBe('#F7F6F3');
    expect(colors.actionPrimary).toBe('#2B2724');
    expect(spacing.screenHorizontal).toBe(25);
    expect(radius.button).toBe(12);
  });

  it('타이포그래피는 크기·행간을 JSON에서 가져오고 번들 글꼴 이름을 쓴다', () => {
    for (const [name, spec] of Object.entries(tokensJson.font.styles)) {
      const style = typography[name as keyof typeof typography];
      expect(style.fontSize).toBe(spec.size);
      expect(style.lineHeight).toBe(spec.lineHeight);
      expect(Object.keys(fontAssets)).toContain(style.fontFamily);
    }
    expect(typography.title3.fontFamily).toBe('Pretendard-SemiBold');
    expect(typography.display.fontFamily).toBe('Pretendard-Bold');
    expect(typography.body.fontFamily).toBe('Pretendard-Regular');
    expect(typography.brand.letterSpacing).toBe(-0.42);
  });

  it('글꼴 파일 5개가 모두 번들에 있다', () => {
    expect(Object.keys(fontAssets)).toHaveLength(5);
  });
});
