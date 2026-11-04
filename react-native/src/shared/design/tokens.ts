// 디자인 토큰. 값의 원본은 `shared/design/tokens.json` 하나다(docs/design/README.md §2). 화면 코드는 이 파일의 이름만 쓴다.
// 대조 테스트(tokens.test.ts)가 이 모듈의 값을 JSON과 비교한다.
import type { TextStyle } from 'react-native';

import tokens from '../../../../shared/design/tokens.json';

export const colors = tokens.color;
export const spacing = tokens.spacing;
export const radius = tokens.radius;

/** `useFonts`에 넘기는 번들 글꼴. 키가 곧 `fontFamily` 이름이다. 파일은 `shared/design/fonts`에서 복사한 것(assets/fonts). */
export const fontAssets = {
  'Pretendard-Regular': require('../../../assets/fonts/Pretendard-Regular.otf'),
  'Pretendard-SemiBold': require('../../../assets/fonts/Pretendard-SemiBold.otf'),
  'Pretendard-Bold': require('../../../assets/fonts/Pretendard-Bold.otf'),
  Continuous: require('../../../assets/fonts/Continuous-Regular.otf'),
  GriunXHangeulBanguri: require('../../../assets/fonts/GriunXHangeulBanguri-Regular.ttf'),
} as const;

export type FontFamilyName = keyof typeof fontAssets;

const PRETENDARD: Record<400 | 600 | 700, FontFamilyName> = {
  400: 'Pretendard-Regular',
  600: 'Pretendard-SemiBold',
  700: 'Pretendard-Bold',
};

/** 숫자·키워드 굵기를 번들 Pretendard 파일로 바꾼다(커스텀 글꼴은 fontWeight로 굵기를 고르지 못한다). */
export function pretendardFor(weight: TextStyle['fontWeight'] | undefined): FontFamilyName {
  if (weight === '700' || weight === 'bold' || weight === '800' || weight === '900') {
    return PRETENDARD[700];
  }
  if (weight === '600' || weight === '500') return PRETENDARD[600];
  return PRETENDARD[400];
}

type StyleSpec = (typeof tokens.font.styles)[keyof typeof tokens.font.styles];

function toTextStyle(spec: StyleSpec): TextStyle {
  const family: FontFamilyName =
    spec.family === 'brand'
      ? 'Continuous'
      : spec.family === 'handwriting'
        ? 'GriunXHangeulBanguri'
        : pretendardFor(String(spec.weight) as TextStyle['fontWeight']);
  const style: TextStyle = { fontFamily: family, fontSize: spec.size, lineHeight: spec.lineHeight };
  return 'letterSpacing' in spec ? { ...style, letterSpacing: spec.letterSpacing } : style;
}

export const typography = {
  display: toTextStyle(tokens.font.styles.display),
  title1: toTextStyle(tokens.font.styles.title1),
  title2: toTextStyle(tokens.font.styles.title2),
  title3: toTextStyle(tokens.font.styles.title3),
  headline: toTextStyle(tokens.font.styles.headline),
  body: toTextStyle(tokens.font.styles.body),
  callout: toTextStyle(tokens.font.styles.callout),
  subheadline: toTextStyle(tokens.font.styles.subheadline),
  footnote: toTextStyle(tokens.font.styles.footnote),
  caption: toTextStyle(tokens.font.styles.caption),
  brand: toTextStyle(tokens.font.styles.brand),
  handwriting: toTextStyle(tokens.font.styles.handwriting),
  photoCardTitle: toTextStyle(tokens.font.styles.photoCardTitle),
} as const;

/** 같은 스타일에 굵기만 바꾼다(예: 선택된 탭 라벨 bold, subheadline bold). */
export function withWeight(style: TextStyle, weight: '400' | '600' | '700'): TextStyle {
  return { ...style, fontFamily: pretendardFor(weight) };
}
