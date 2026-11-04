import { useState } from 'react';
import { Image, StyleSheet, View, type ImageStyle, type StyleProp } from 'react-native';

import { colors } from '../design/tokens';
import { Icon } from './icons/Icon';
import { Skeleton, useDelayedSkeleton } from './Skeleton';

export type RemoteImageProps = {
  uri: string | null | undefined;
  style?: StyleProp<ImageStyle>;
  resizeMode?: 'cover' | 'contain';
  /** 원본이 뜨기 전에 깔아 두는 썸네일. 있으면 스켈레톤을 켜지 않는다(ChalkakImage thumbnailSource). */
  thumbnailUri?: string | null;
  testID?: string;
  accessibilityLabel?: string;
  onLoad?: (size: { width: number; height: number }) => void;
  onError?: () => void;
};

/**
 * 원격 이미지 로딩 UI(screens-b.md §1.5 ChalkakImage): 로딩 중 스켈레톤(0.5초 지연), URL 없음/실패는 inputBackground 바탕 + 24 아이콘.
 * 모서리와 크기는 호출부가 style로 정한다.
 */
export function RemoteImage({
  uri,
  style,
  resizeMode = 'cover',
  thumbnailUri,
  testID,
  accessibilityLabel,
  onLoad,
  onError,
}: RemoteImageProps) {
  const [state, setState] = useState<'loading' | 'loaded' | 'error'>('loading');
  const showSkeleton = useDelayedSkeleton(state === 'loading' && !thumbnailUri && !!uri);

  if (!uri || state === 'error') {
    return (
      <View testID={testID} style={[styles.placeholder, style as object]}>
        <Icon name="ic_photo_library" size={24} color={colors.iconSecondary} />
      </View>
    );
  }
  return (
    <View style={[styles.frame, style as object]}>
      {thumbnailUri && state === 'loading' ? (
        <Image
          source={{ uri: thumbnailUri }}
          resizeMode={resizeMode}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      <Image
        testID={testID}
        accessibilityLabel={accessibilityLabel}
        source={{ uri }}
        resizeMode={resizeMode}
        style={StyleSheet.absoluteFill}
        onLoad={(e) => {
          setState('loaded');
          const { width, height } = e.nativeEvent.source;
          onLoad?.({ width, height });
        }}
        onError={() => {
          setState('error');
          onError?.();
        }}
      />
      {showSkeleton ? <Skeleton style={StyleSheet.absoluteFill} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: 'hidden' },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.inputBackground,
  },
});
