import { memo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { useViewModelState } from '../../core/state/useViewModelState';
import { t } from '../../shared/copy';
import type { SignatureMode } from './mapSignatureError';
import type { SignatureDrawViewModel } from './SignatureDrawViewModel';
import { SignaturePadGesture } from './SignaturePadGesture';
import { strokeToSvgPath } from './SignatureStrokePath';
import type { Stroke } from './Stroke';
import { colors, radius, spacing, typography } from '../../shared/design/tokens';
import { BackButton } from '../../shared/ui/BackButton';
import { ChalkakButton } from '../../shared/ui/Button';
import { Icon } from '../../shared/ui/icons/Icon';
import { Text } from '../../shared/ui/Text';

export type SignatureDrawScreenProps = {
  viewModel: SignatureDrawViewModel;
  mode: SignatureMode;
  /** 화면/하드웨어 뒤로. */
  onBack: () => void;
};

// 원본 사인 패드(screens-a.md §6.1): 어두운 캔버스(actionPrimary) 위에 흰 획, 굵기 4, 점선 테두리 textOnImage 28%.
const STROKE_COLOR = colors.textOnImage;
const SCREEN_STROKE_WIDTH = 4;
const PLACEHOLDER = '사인';

// 제목·안내의 첫 줄만 testID 요소에 두고 나머지는 다음 줄 요소에 둔다(테스트가 첫 줄 문구로 조회한다).
const firstLine = (text: string): string => text.split('\n')[0];
const otherLines = (text: string): string => text.split('\n').slice(1).join('\n');

/** testID는 testids.md의 signature.*. 상태는 구독만 하고 수명주기는 SignatureFlowViewModel이 가진다. */
export function SignatureDrawScreen({ viewModel, mode, onBack }: SignatureDrawScreenProps) {
  const { strokes, canUndo, canClear, canSubmit, error } = useViewModelState(viewModel);
  const insets = useSafeAreaInsets();
  const [gesture] = useState(() => new SignaturePadGesture(viewModel));
  const canvas = viewModel.canvas;

  const viewBox = `0 0 ${canvas.width} ${canvas.height}`;
  const titleText = t('onb.sign.title');
  const guideText = t('onb.sign.guide');
  return (
    <View
      testID="signature.root"
      accessibilityValue={{ text: mode }}
      style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom + 18 }]}
    >
      <View style={styles.backRow}>
        <BackButton testID="signature.back-button" onPress={onBack} />
      </View>
      <View style={styles.titleBox}>
        <Text testID="signature.title" style={styles.title}>
          {firstLine(titleText)}
        </Text>
        <Text style={styles.title}>{otherLines(titleText)}</Text>
      </View>
      <View style={styles.guideBox}>
        <Text testID="signature.guide-text" style={styles.guide}>
          {firstLine(guideText)}
        </Text>
        <Text style={styles.guide}>{otherLines(guideText)}</Text>
      </View>
      <View style={styles.padFrame}>
        <View
          testID="signature.canvas"
          style={styles.pad}
          onLayout={(event) => gesture.setWidth(event.nativeEvent.layout.width)}
          {...gesture.responder.panHandlers}
        >
          <View pointerEvents="none" style={styles.dashed} />
          <Svg width="100%" height="100%" viewBox={viewBox} pointerEvents="none">
            {strokes.map((stroke, index) => (
              <StrokeShape key={index} stroke={stroke} />
            ))}
          </Svg>
          {strokes.length === 0 ? (
            <Text pointerEvents="none" style={styles.placeholder}>
              {PLACEHOLDER}
            </Text>
          ) : null}
        </View>
        {strokes.length === 0 ? (
          <Text testID="signature.canvas-hint" style={styles.caption}>
            {t('onb.sign.pad-hint')}
          </Text>
        ) : (
          <Text style={styles.caption}>{t('onb.sign.pad-hint')}</Text>
        )}
      </View>
      {error ? (
        <Text testID="signature.error-message" accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      <View style={styles.tools}>
        <Pressable
          testID="signature.undo-button"
          accessibilityRole="button"
          disabled={!canUndo}
          onPress={() => viewModel.undo()}
          style={styles.tool}
        >
          <View style={styles.flip}>
            <Icon
              name="ic_rotate_right"
              size={15}
              color={canUndo ? colors.textPrimary : colors.textMuted}
            />
          </View>
          <Text style={[styles.toolText, !canUndo && styles.toolOff]}>{t('onb.sign.undo')}</Text>
        </Pressable>
        <Pressable
          testID="signature.clear-button"
          accessibilityRole="button"
          disabled={!canClear}
          onPress={() => viewModel.clear()}
          style={styles.tool}
        >
          <Text style={[styles.toolText, !canClear && styles.toolOff]}>{t('onb.sign.clear')}</Text>
        </Pressable>
      </View>
      <View style={styles.spacer} />
      <ChalkakButton
        testID="signature.submit-button"
        label={t('onb.sign.confirm')}
        disabled={!canSubmit}
        onPress={() => void viewModel.confirm()}
      />
    </View>
  );
}

/** 획 하나. 그리는 중에는 마지막 획만 바뀌므로 memo로 나머지 획의 다시 그리기를 막는다. */
const StrokeShape = memo(function StrokeShape({ stroke }: { stroke: Stroke }) {
  const d = strokeToSvgPath(stroke);
  if (d === null) {
    if (stroke.length === 0) return null;
    return (
      <Circle cx={stroke[0].x} cy={stroke[0].y} r={SCREEN_STROKE_WIDTH / 2} fill={STROKE_COLOR} />
    );
  }
  return (
    <Path
      d={d}
      stroke={STROKE_COLOR}
      strokeWidth={SCREEN_STROKE_WIDTH}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  );
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.screenHorizontal,
  },
  backRow: { marginLeft: -12, height: 50, justifyContent: 'center' },
  titleBox: {},
  title: { ...typography.title1, color: colors.textPrimary },
  guideBox: { marginTop: 30 },
  guide: { ...typography.subheadline, color: colors.textSecondary },
  padFrame: {
    marginTop: 32,
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingBottom: 14,
    borderRadius: radius.large,
    borderWidth: 1,
    borderColor: 'rgba(43,39,36,0.12)',
    backgroundColor: colors.inputBackground,
  },
  pad: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radius.button,
    backgroundColor: colors.actionPrimary,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dashed: {
    ...StyleSheet.absoluteFill,
    margin: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.28)',
  },
  placeholder: {
    position: 'absolute',
    ...typography.handwriting,
    color: 'rgba(255,255,255,0.56)',
    transform: [{ scale: 2.4 }],
  },
  caption: {
    ...typography.footnote,
    marginTop: spacing.md,
    textAlign: 'center',
    color: colors.textMuted,
  },
  error: {
    ...typography.footnote,
    marginTop: spacing.md,
    textAlign: 'center',
    color: colors.error,
  },
  tools: { flexDirection: 'row', justifyContent: 'center', gap: spacing.md, marginTop: spacing.xl },
  tool: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  flip: { transform: [{ scaleX: -1 }] },
  toolText: { ...typography.footnote, color: colors.textPrimary },
  toolOff: { color: colors.textMuted },
  spacer: { flex: 1, minHeight: spacing.lg },
});
