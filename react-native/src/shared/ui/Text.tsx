import type { ComponentRef, Ref } from 'react';
import {
  StyleSheet,
  Text as RNText,
  TextInput as RNTextInput,
  type TextInputProps,
  type TextProps,
  type TextStyle,
} from 'react-native';

import { colors, pretendardFor } from '../design/tokens';

/**
 * 앱 전체 글꼴·기본 색을 입히는 Text. 플랫폼 기본 글꼴(SF, Roboto)이 보이지 않게 모든 문구는 이 컴포넌트를 쓴다.
 * 번들 글꼴은 fontWeight로 굵기를 고를 수 없어서(특히 Android) 굵기를 Pretendard 파일 이름으로 바꾸고 fontWeight는 지운다.
 * fontFamily를 직접 지정한(typography.*, 손글씨 등) 스타일은 그대로 존중한다.
 */
function resolveStyle(style: TextProps['style'], base: TextStyle): TextStyle {
  const flat = StyleSheet.flatten([base, style]) as TextStyle;
  const { fontWeight, ...rest } = flat;
  const family = rest.fontFamily;
  const keepFamily = family !== undefined && (!family.startsWith('Pretendard') || !fontWeight);
  const fontFamily = keepFamily ? family : pretendardFor(fontWeight);
  return { ...rest, fontFamily };
}

const TEXT_BASE: TextStyle = { color: colors.textPrimary };

export function Text(props: TextProps) {
  const { style, ...rest } = props;
  return <RNText {...rest} style={resolveStyle(style, TEXT_BASE)} />;
}

const INPUT_BASE: TextStyle = { color: colors.textPrimary };

export type TextInputRef = ComponentRef<typeof RNTextInput>;

export function TextInput(props: TextInputProps & { ref?: Ref<TextInputRef> }) {
  const { style, ref, ...rest } = props;
  return (
    <RNTextInput
      ref={ref}
      placeholderTextColor={colors.textInactive}
      cursorColor={colors.inputCursor}
      selectionColor={colors.inputCursor}
      {...rest}
      style={resolveStyle(style, INPUT_BASE)}
    />
  );
}
