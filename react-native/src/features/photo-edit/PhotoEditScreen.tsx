import { useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { bytesToBase64 } from '../../core/encoding/base64';
import { useViewModelState } from '../../core/state/useViewModelState';
import { t, type CopyKey } from '../../shared/copy';
import { colors, pretendardFor, radius, spacing, typography } from '../../shared/design/tokens';
import { Dialog, DialogButton } from '../../shared/ui/Dialog';
import { Icon } from '../../shared/ui/icons/Icon';
import type { IconName } from '../../shared/ui/icons/iconData';
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
import { Text } from '../../shared/ui/Text';

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
          <Text style={styles.topText}>{t('edit.top.done')}</Text>
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
            <ActivityIndicator color={colors.editorContent} />
            <Text style={styles.hint}>{localCopy.editorLoading}</Text>
          </View>
        ) : null}
        {state.rendering ? (
          <View testID="photo-edit.rendering-indicator" style={styles.rendering}>
            <ActivityIndicator color={colors.editorContent} />
            <Text style={styles.hint}>{localCopy.editorRendering}</Text>
          </View>
        ) : null}
        {state.status === 'error' ? (
          <Dialog
            messageTestID="photo-edit.error-dialog"
            title=""
            message={state.errorMessage ?? t('edit.error.render')}
            onRequestClose={() => void viewModel.start()}
            actions={
              <DialogButton
                testID="photo-edit.error-retry-button"
                label={localCopy.editorErrorRetry}
                onPress={() => void viewModel.start()}
              />
            }
          />
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

const ADJUST_ICONS: Record<'auto' | AdjustItem, IconName> = {
  auto: 'ic_adjust_auto',
  exposure: 'ic_adjust_exposure',
  contrast: 'ic_adjust_contrast',
  highlights: 'ic_adjust_highlights',
  shadows: 'ic_adjust_shadows',
  blackPoint: 'ic_adjust_black_point',
  saturation: 'ic_adjust_saturation',
  warmth: 'ic_adjust_warmth',
};

/** 비율 프레임 상자 변(원본 Android AspectRatioFrames: 28 박스). 원본·자유는 4:3 / 3:4 모양으로 둔다. */
const FRAME_BOX = 28;
const ASPECT_SHAPE: Record<AspectKey, { w: number; h: number }> = {
  original: { w: 4, h: 3 },
  free: { w: 3, h: 4 },
  '1:1': { w: 1, h: 1 },
  '4:5': { w: 4, h: 5 },
  '5:4': { w: 5, h: 4 },
  '3:4': { w: 3, h: 4 },
  '4:3': { w: 4, h: 3 },
  '9:16': { w: 9, h: 16 },
  '16:9': { w: 16, h: 9 },
};

function CropTools({ viewModel }: Props) {
  const aspect = useViewModelState(viewModel, (s) => s.aspect);
  return (
    <View style={styles.toolBox}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {ASPECT_KEYS.map((key) => {
          const shape = ASPECT_SHAPE[key];
          const long = Math.max(shape.w, shape.h);
          const color = aspect === key ? colors.editorContent : colors.editorContentMuted;
          return (
            <ToolItem
              key={key}
              testID={`photo-edit.ratio-${key.replace(':', '-')}`}
              label={t(RATIO_KEYS[key])}
              selected={aspect === key}
              onPress={() => viewModel.selectAspect(key)}
              glyph={
                <View style={styles.frameBox}>
                  <View
                    style={{
                      width: (FRAME_BOX * shape.w) / long,
                      height: (FRAME_BOX * shape.h) / long,
                      borderWidth: 1.5,
                      borderRadius: 2,
                      borderColor: color,
                      borderStyle: key === 'free' ? 'dashed' : 'solid',
                    }}
                  />
                </View>
              }
            />
          );
        })}
      </ScrollView>
      <View style={styles.cropActions}>
        <Pressable
          testID="photo-edit.rotate-button"
          accessibilityRole="button"
          accessibilityLabel={t('edit.crop.rotate')}
          onPress={() => viewModel.rotate()}
          style={styles.iconButton}
        >
          <Icon name="ic_rotate_right" size={24} color={colors.editorContent} />
        </Pressable>
        <Pressable
          testID="photo-edit.reset-button"
          accessibilityRole="button"
          onPress={() => viewModel.resetCrop()}
          style={styles.textButton}
        >
          <Text style={styles.resetText}>{t('edit.crop.reset')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function AdjustTools({ viewModel }: Props) {
  const state = useViewModelState(viewModel);
  const selected = state.selectedAdjust;
  return (
    <View style={styles.toolBox}>
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
            <Text style={[styles.toggleText, state.autoOn && styles.toggleTextOn]}>
              {t('edit.adjust.auto')}
            </Text>
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
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {ADJUST_ROWS.map(({ id, item, key }) => {
          const changed = item === 'auto' ? state.autoOn : state.adjustValues[item] !== 0;
          return (
            <ToolItem
              key={id}
              testID={`photo-edit.adjust-item-${id}`}
              label={t(key)}
              selected={selected === item}
              onPress={() => void viewModel.selectAdjust(item)}
              dot={changed}
              glyph={
                <Icon
                  name={ADJUST_ICONS[item]}
                  size={24}
                  color={selected === item ? colors.editorContent : colors.editorContentMuted}
                />
              }
            />
          );
        })}
        <Pressable
          testID="photo-edit.adjust-reset-button"
          accessibilityRole="button"
          onPress={() => viewModel.resetAdjustments()}
          style={styles.textButton}
        >
          <Text style={styles.resetText}>{t('edit.adjust.reset')}</Text>
        </Pressable>
      </ScrollView>
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
        <Pressable
          key={id}
          testID={`photo-edit.filter-${id}`}
          accessibilityRole="button"
          accessibilityState={{ selected: filter === id }}
          onPress={() => viewModel.selectFilter(id)}
          style={styles.filterItem}
        >
          <View style={[styles.filterTile, filter === id && styles.filterTileSelected]} />
          <Text style={[styles.itemLabel, filter === id && styles.itemLabelSelected]}>
            {t(FILTER_KEYS[id])}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

/** 편집기 도구 항목: 위에 아이콘/비율 프레임, 아래 caption 라벨, 값이 바뀐 항목은 4 점. 선택은 editorContent, 아니면 muted. */
function ToolItem(props: {
  testID: string;
  label: string;
  selected?: boolean;
  glyph: ReactNode;
  dot?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      testID={props.testID}
      accessibilityRole="button"
      accessibilityState={{ selected: props.selected ?? false }}
      onPress={props.onPress}
      style={styles.item}
    >
      {props.glyph}
      <Text style={[styles.itemLabel, props.selected && styles.itemLabelSelected]}>
        {props.label}
      </Text>
      <View style={[styles.dot, props.dot && styles.dotOn]} />
    </Pressable>
  );
}

// 편집기 색(tokens.color.editor*, screens-b.md §6.5)과 원본 Android 레이아웃: 컨트롤 영역 높이 156, 탭은 균등 3칸 subheadline.
const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, backgroundColor: colors.editorBackground },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  topText: {
    ...typography.body,
    color: colors.editorContent,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  preview: { flex: 1, overflow: 'hidden' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  hint: { ...typography.footnote, color: colors.editorContentMuted, marginTop: spacing.sm },
  rendering: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.editorScrim,
  },
  tools: { height: 156, justifyContent: 'center' },
  toolBox: { gap: spacing.sm },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'flex-start',
  },
  item: { minWidth: 56, alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xs },
  itemLabel: { ...typography.caption, color: colors.editorContentMuted },
  itemLabelSelected: { color: colors.editorContent },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: 'transparent' },
  dotOn: { backgroundColor: colors.editorContent },
  frameBox: { width: FRAME_BOX, height: FRAME_BOX, alignItems: 'center', justifyContent: 'center' },
  cropActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
  },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  textButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.sm },
  resetText: { ...typography.footnote, color: colors.editorContent },
  filterItem: { alignItems: 'center', gap: spacing.xs },
  filterTile: {
    width: 64,
    height: 64,
    borderRadius: radius.small,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  filterTileSelected: { borderColor: colors.editorContent },
  toggle: {
    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.editorContentMuted,
  },
  toggleOn: { backgroundColor: colors.editorContent, borderColor: colors.editorContent },
  toggleText: { ...typography.footnote, color: colors.editorContent },
  toggleTextOn: { color: colors.editorBackground, fontFamily: pretendardFor('600') },
  tabs: { flexDirection: 'row' },
  tab: { flex: 1, alignItems: 'center', paddingVertical: spacing.md },
  tabText: { ...typography.subheadline, color: colors.editorContentMuted },
  tabSelected: { color: colors.editorContent },
});
