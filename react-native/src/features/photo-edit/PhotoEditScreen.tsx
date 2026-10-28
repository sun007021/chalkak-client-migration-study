import { useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { bytesToBase64 } from '../../core/encoding/base64';
import { useViewModelState } from '../../core/state/useViewModelState';
import { t, type CopyKey } from '../../shared/copy';
import { colors, spacing } from '../../shared/ui/theme';
import { encodePng } from '../../core/image/png';
import { localCopy } from '../upload/localCopy';
import { ASPECT_KEYS, fitScale, type AspectKey } from './CropGeometry';
import type { Size } from './ImageTypes';
import { ADJUST_ITEMS, type AdjustItem, type PhotoFilter } from './PhotoEdit';
import type { EditTab, PhotoEditViewModel } from './PhotoEditViewModel';
import { PHOTO_FILTERS } from './PhotoFilters';
import { rotatedSize } from './PhotoEditTransform';
import { CropFrame } from './ui/CropFrame';
import { RulerSlider } from './ui/RulerSlider';

type Props = { viewModel: PhotoEditViewModel };

/** 레이아웃이 측정되기 전(첫 프레임, 테스트)에 쓰는 미리보기 영역 크기. */
const FALLBACK_VIEWPORT: Size = { width: 360, height: 480 };
const PREVIEW_DELAY_MS = 80;
/** 항목 값이 이 이내로 가까우면 자동 보정 몫에 붙는다. */
const ADJUST_ANCHOR_ZERO = 0;

const TABS: readonly { id: EditTab; key: CopyKey }[] = [
  { id: 'crop', key: 'edit.tab.crop' },
  { id: 'adjust', key: 'edit.tab.adjust' },
  { id: 'filter', key: 'edit.tab.filter' },
];

/** testID와 문구 키가 코드 이름과 다른 조정 항목. */
const ADJUST_ROWS: readonly { id: string; item: 'auto' | AdjustItem; key: CopyKey }[] = [
  { id: 'auto', item: 'auto', key: 'edit.adjust.auto' },
  { id: 'exposure', item: 'exposure', key: 'edit.adjust.exposure' },
  { id: 'contrast', item: 'contrast', key: 'edit.adjust.contrast' },
  { id: 'highlights', item: 'highlights', key: 'edit.adjust.highlights' },
  { id: 'shadows', item: 'shadows', key: 'edit.adjust.shadows' },
  { id: 'black-point', item: 'blackPoint', key: 'edit.adjust.black-point' },
  { id: 'saturation', item: 'saturation', key: 'edit.adjust.saturation' },
  { id: 'warmth', item: 'warmth', key: 'edit.adjust.warmth' },
];

const RATIO_KEYS: Record<AspectKey, CopyKey> = {
  original: 'edit.ratio.original',
  free: 'edit.ratio.free',
  '1:1': 'edit.ratio.1-1',
  '4:5': 'edit.ratio.4-5',
  '5:4': 'edit.ratio.5-4',
  '3:4': 'edit.ratio.3-4',
  '4:3': 'edit.ratio.4-3',
  '9:16': 'edit.ratio.9-16',
  '16:9': 'edit.ratio.16-9',
};

const FILTER_KEYS: Record<PhotoFilter, CopyKey> = {
  original: 'edit.filter.original',
  mono: 'edit.filter.mono',
  warm: 'edit.filter.warm',
  cool: 'edit.filter.cool',
  vintage: 'edit.filter.vintage',
  vivid: 'edit.filter.vivid',
};

/**
 * 사진 편집기(자르기·조정·필터). testID는 docs/testing/testids.md의 photo-edit.*.
 * 마운트되면 편집용 이미지를 준비한다(start는 멱등). 상태는 구독만 하고 ViewModel을 만들고 버리는 것은 소유자다.
 */
export function PhotoEditScreen({ viewModel }: Props): ReactNode {
  const state = useViewModelState(viewModel);
  const insets = useSafeAreaInsets();
  const [measured, setMeasured] = useState<Size | null>(null);
  const colorUri = useColorPreview(viewModel);

  useEffect(() => {
    // 이미 실패한 편집기는 자동으로 다시 시도하지 않는다(오류 알림의 "다시 시도"가 한다).
    if (viewModel.getSnapshot().status === 'loading') void viewModel.start();
  }, [viewModel]);

  // 안드로이드 뒤로가기는 "취소"와 같다.
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      viewModel.cancel();
      return true;
    });
    return () => subscription.remove();
  }, [viewModel]);

  const viewport = measured ?? FALLBACK_VIEWPORT;
  const onPreviewLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width > 0 && height > 0) setMeasured({ width, height });
  };

  const editable = state.editable;
  const rotated = editable ? rotatedSize(editable, state.quarterTurns) : null;
  const scale = rotated ? fitScale(rotated, viewport) : 1;
  const displayed = rotated
    ? { width: rotated.width * scale, height: rotated.height * scale }
    : viewport;

  return (
    <View
      testID="photo-edit.root"
      style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
    >
      <View style={styles.topBar}>
        <Pressable
          testID="photo-edit.cancel-button"
          accessibilityRole="button"
          onPress={() => viewModel.cancel()}
          hitSlop={8}
        >
          <Text style={styles.topText}>{t('edit.top.cancel')}</Text>
        </Pressable>
        <Pressable
          testID="photo-edit.done-button"
          accessibilityRole="button"
          onPress={() => void viewModel.done()}
          hitSlop={8}
        >
          <Text style={[styles.topText, styles.done]}>{t('edit.top.done')}</Text>
        </Pressable>
      </View>

      <View style={styles.preview} onLayout={onPreviewLayout}>
        {editable && rotated ? (
          <>
            <Image
              testID="photo-edit.preview-image"
              source={{ uri: colorUri ?? editable.uri }}
              resizeMode="stretch"
              style={{
                position: 'absolute',
                width: editable.width * scale,
                height: editable.height * scale,
                left: (viewport.width - editable.width * scale) / 2,
                top: (viewport.height - editable.height * scale) / 2,
                transform: [{ rotate: `${state.quarterTurns * 90}deg` }],
              }}
            />
            {state.tab === 'crop' ? (
              <View
                pointerEvents="box-none"
                style={{
                  position: 'absolute',
                  left: (viewport.width - displayed.width) / 2,
                  top: (viewport.height - displayed.height) / 2,
                  width: displayed.width,
                  height: displayed.height,
                }}
              >
                <CropFrame
                  testID="photo-edit.crop-area"
                  displayed={displayed}
                  rect={state.cropRect}
                  onMove={(dx, dy) => viewModel.moveCrop(dx, dy)}
                  onResize={(handle, dx, dy) => viewModel.resizeCrop(handle, dx, dy)}
                />
              </View>
            ) : null}
          </>
        ) : state.status === 'loading' ? (
          <View style={styles.center}>
            <ActivityIndicator color="#FFFFFF" />
            <Text style={styles.hint}>{localCopy.editorLoading}</Text>
          </View>
        ) : null}
        {state.rendering ? (
          <View testID="photo-edit.rendering-indicator" style={styles.rendering}>
            <ActivityIndicator color="#FFFFFF" />
            <Text style={styles.hint}>{localCopy.editorRendering}</Text>
          </View>
        ) : null}
        {state.status === 'error' ? (
          <View style={styles.error} accessibilityRole="alert">
            <Text testID="photo-edit.error-dialog" style={styles.errorText}>
              {state.errorMessage ?? t('edit.error.render')}
            </Text>
            <Pressable
              testID="photo-edit.error-retry-button"
              accessibilityRole="button"
              onPress={() => void viewModel.start()}
              style={styles.retry}
            >
              <Text style={styles.retryText}>{localCopy.editorErrorRetry}</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      <View style={styles.tools}>
        {state.tab === 'crop' ? <CropTools viewModel={viewModel} /> : null}
        {state.tab === 'adjust' ? <AdjustTools viewModel={viewModel} /> : null}
        {state.tab === 'filter' ? <FilterTools viewModel={viewModel} /> : null}
      </View>

      <View style={styles.tabs}>
        {TABS.map(({ id, key }) => (
          <Pressable
            key={id}
            testID={`photo-edit.tab-${id}`}
            accessibilityRole="tab"
            accessibilityState={{ selected: state.tab === id }}
            onPress={() => void viewModel.selectTab(id)}
            style={styles.tab}
          >
            <Text style={[styles.tabText, state.tab === id && styles.tabSelected]}>{t(key)}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/** 조정·필터가 바뀌면 작은 표본에 색만 적용한 그림을 data URI로 만든다. 조정이 없으면 null(원본 이미지를 그대로 보인다). */
function useColorPreview(viewModel: PhotoEditViewModel): string | null {
  const [result, setResult] = useState<{ key: string; uri: string | null } | null>(null);
  const key = useViewModelState(viewModel, (s) =>
    s.status !== 'ready' ||
    (s.filter === 'original' && Object.values(s.adjustValues).every((v) => v === 0))
      ? null
      : `${s.filter}|${Object.values(s.adjustValues).join(',')}`,
  );

  useEffect(() => {
    if (key === null) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void viewModel.renderPreview().then((image) => {
        if (cancelled) return;
        const png = image
          ? encodePng(new Uint8Array(image.data.buffer), image.width, image.height)
          : null;
        setResult({ key, uri: png ? `data:image/png;base64,${bytesToBase64(png)}` : null });
      });
    }, PREVIEW_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [viewModel, key]);

  // 조정이 바뀐 직후 새 그림이 올 때까지는 이전 그림이 남고, 조정이 없어지면 곧바로 원본으로 돌아간다.
  return key !== null && result !== null ? result.uri : null;
}

function CropTools({ viewModel }: Props) {
  const aspect = useViewModelState(viewModel, (s) => s.aspect);
  return (
    <View style={styles.toolBox}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {ASPECT_KEYS.map((key) => (
          <Chip
            key={key}
            testID={`photo-edit.ratio-${key.replace(':', '-')}`}
            label={t(RATIO_KEYS[key])}
            selected={aspect === key}
            onPress={() => viewModel.selectAspect(key)}
          />
        ))}
      </ScrollView>
      <View style={styles.row}>
        <Chip
          testID="photo-edit.rotate-button"
          label={t('edit.crop.rotate')}
          onPress={() => viewModel.rotate()}
        />
        <Chip
          testID="photo-edit.reset-button"
          label={t('edit.crop.reset')}
          onPress={() => viewModel.resetCrop()}
        />
      </View>
    </View>
  );
}

function AdjustTools({ viewModel }: Props) {
  const state = useViewModelState(viewModel);
  const selected = state.selectedAdjust;
  return (
    <View style={styles.toolBox}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {ADJUST_ROWS.map(({ id, item, key }) => (
          <Chip
            key={id}
            testID={`photo-edit.adjust-item-${id}`}
            label={t(key)}
            selected={selected === item}
            onPress={() => void viewModel.selectAdjust(item)}
          />
        ))}
        <Chip
          testID="photo-edit.adjust-reset-button"
          label={t('edit.adjust.reset')}
          onPress={() => viewModel.resetAdjustments()}
        />
      </ScrollView>
      {selected === 'auto' ? (
        <View>
          <Pressable
            testID="photo-edit.adjust-auto-toggle"
            accessibilityRole="switch"
            accessibilityState={{ checked: state.autoOn }}
            accessibilityLabel={t('edit.adjust.auto')}
            onPress={() => void viewModel.selectAdjust('auto')}
            style={[styles.toggle, state.autoOn && styles.toggleOn]}
          >
            <Text style={styles.toggleText}>{t('edit.adjust.auto')}</Text>
          </Pressable>
          <RulerSlider
            testID="photo-edit.adjust-auto-strength-slider"
            value={state.adjustments.autoStrength}
            min={0}
            max={1}
            anchors={[0, 1]}
            onValueChange={(value) => viewModel.setAutoStrength(value)}
          />
        </View>
      ) : (
        <ItemSlider viewModel={viewModel} item={selected} />
      )}
    </View>
  );
}

function ItemSlider({ viewModel, item }: Props & { item: AdjustItem }) {
  const state = useViewModelState(viewModel);
  const row = ADJUST_ROWS.find((r) => r.item === item);
  if (!row || !ADJUST_ITEMS.includes(item)) return null;
  const autoShare = state.adjustments.auto[item] * state.adjustments.autoStrength;
  return (
    <RulerSlider
      testID={`photo-edit.adjust-${row.id}-slider`}
      value={state.adjustValues[item]}
      min={-1}
      max={1}
      anchors={[ADJUST_ANCHOR_ZERO, autoShare]}
      onValueChange={(value) => viewModel.setAdjustValue(item, value)}
    />
  );
}

function FilterTools({ viewModel }: Props) {
  const filter = useViewModelState(viewModel, (s) => s.filter);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {PHOTO_FILTERS.map((id) => (
        <Chip
          key={id}
          testID={`photo-edit.filter-${id}`}
          label={t(FILTER_KEYS[id])}
          selected={filter === id}
          onPress={() => viewModel.selectFilter(id)}
        />
      ))}
    </ScrollView>
  );
}

function Chip(props: { testID: string; label: string; selected?: boolean; onPress: () => void }) {
  return (
    <Pressable
      testID={props.testID}
      accessibilityRole="button"
      accessibilityState={{ selected: props.selected ?? false }}
      onPress={props.onPress}
      style={[styles.chip, props.selected && styles.chipSelected]}
    >
      <Text style={[styles.chipText, props.selected && styles.chipTextSelected]}>
        {props.label}
      </Text>
    </Pressable>
  );
}

const DARK = '#111111';

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, backgroundColor: DARK },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  topText: { color: '#FFFFFF', fontSize: 16 },
  done: { color: colors.accent, fontWeight: '700' },
  preview: { flex: 1, overflow: 'hidden' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  hint: { color: '#CCCCCC', fontSize: 13, marginTop: spacing.sm },
  rendering: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  error: {
    position: 'absolute',
    left: spacing.xl,
    right: spacing.xl,
    top: '35%',
    padding: spacing.lg,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    gap: spacing.md,
  },
  errorText: { color: colors.textPrimary, fontSize: 15, textAlign: 'center' },
  retry: { alignSelf: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  retryText: { color: colors.accent, fontWeight: '700' },
  tools: { minHeight: 128, justifyContent: 'center' },
  toolBox: { gap: spacing.sm },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 16,
    backgroundColor: '#2A2A2A',
  },
  chipSelected: { backgroundColor: '#FFFFFF' },
  chipText: { color: '#FFFFFF', fontSize: 14 },
  chipTextSelected: { color: DARK, fontWeight: '700' },
  toggle: {
    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: 16,
    backgroundColor: '#2A2A2A',
  },
  toggleOn: { backgroundColor: colors.accent },
  toggleText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  tabs: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderColor: '#333333' },
  tab: { flex: 1, alignItems: 'center', paddingVertical: spacing.md },
  tabText: { color: '#8A8A8A', fontSize: 15 },
  tabSelected: { color: '#FFFFFF', fontWeight: '700' },
});
