import { memo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { useViewModelState } from '../../core/state/useViewModelState';
import { t } from '../../shared/copy';
import type { SignatureMode } from './mapSignatureError';
import type { SignatureDrawViewModel } from './SignatureDrawViewModel';
import { SignaturePadGesture } from './SignaturePadGesture';
import { strokeToSvgPath } from './SignatureStrokePath';
import type { Stroke } from './Stroke';

export type SignatureDrawScreenProps = {
  viewModel: SignatureDrawViewModel;
  mode: SignatureMode;
  /** 화면/하드웨어 뒤로. */
  onBack: () => void;
};

const STROKE_COLOR = '#111111';
const SCREEN_STROKE_WIDTH = 6;

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
      style={[styles.root, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}
    >
      <Pressable
        testID="signature.back-button"
        accessibilityRole="button"
        onPress={onBack}
        hitSlop={12}
        style={styles.back}
      >
        <Text style={styles.backText}>‹</Text>
      </Pressable>
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
      <View
        testID="signature.canvas"
        style={styles.pad}
        onLayout={(event) => gesture.setWidth(event.nativeEvent.layout.width)}
        {...gesture.responder.panHandlers}
      >
        <Svg width="100%" height="100%" viewBox={viewBox} pointerEvents="none">
          {strokes.map((stroke, index) => (
            <StrokeShape key={index} stroke={stroke} />
          ))}
        </Svg>
        {strokes.length === 0 ? (
          <Text testID="signature.canvas-hint" pointerEvents="none" style={styles.hint}>
            {t('onb.sign.pad-hint')}
          </Text>
        ) : null}
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
          style={[styles.tool, !canUndo && styles.off]}
        >
          <Text style={styles.toolText}>{t('onb.sign.undo')}</Text>
        </Pressable>
        <Pressable
          testID="signature.clear-button"
          accessibilityRole="button"
          disabled={!canClear}
          onPress={() => viewModel.clear()}
          style={[styles.tool, !canClear && styles.off]}
        >
          <Text style={styles.toolText}>{t('onb.sign.clear')}</Text>
        </Pressable>
      </View>
      <Pressable
        testID="signature.submit-button"
        accessibilityRole="button"
        disabled={!canSubmit}
        onPress={() => void viewModel.confirm()}
        style={[styles.submit, !canSubmit && styles.submitOff]}
      >
        <Text style={styles.submitText}>{t('onb.sign.confirm')}</Text>
      </Pressable>
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
  root: { flex: 1, backgroundColor: '#FFFFFF', paddingHorizontal: 24 },
  back: { width: 44, height: 44, justifyContent: 'center' },
  backText: { fontSize: 32, color: '#111111' },
  titleBox: { marginTop: 8 },
  title: { fontSize: 26, fontWeight: '700', lineHeight: 36, color: '#111111' },
  guideBox: { marginTop: 12 },
  guide: { fontSize: 14, lineHeight: 20, color: '#666666' },
  pad: {
    marginTop: 24,
    width: '100%',
    aspectRatio: 1,
    borderRadius: 16,
    backgroundColor: '#F4F4F4',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: { position: 'absolute', color: '#AAAAAA', fontSize: 15 },
  error: { marginTop: 12, textAlign: 'center', color: '#D32F2F', fontSize: 13 },
  tools: { flexDirection: 'row', justifyContent: 'center', gap: 12, marginTop: 16 },
  tool: {
    height: 40,
    paddingHorizontal: 18,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#CCCCCC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolText: { fontSize: 14, color: '#333333' },
  off: { opacity: 0.4 },
  submit: {
    marginTop: 'auto',
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111111',
  },
  submitOff: { backgroundColor: '#CCCCCC' },
  submitText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});
