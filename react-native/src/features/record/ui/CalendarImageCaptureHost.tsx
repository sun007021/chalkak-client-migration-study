import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View, type HostInstance } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { useViewModelState } from '../../../core/state/useViewModelState';
import type {
  CaptureRequest,
  ViewShotCalendarImageRenderer,
} from '../ViewShotCalendarImageRenderer';
import { CalendarImageView } from './CalendarImageView';

/** 썸네일 로딩을 기다리는 최대 시간(ms). 넘으면 못 받은 칸은 비워 둔 채 캡처한다. */
const IMAGE_WAIT_MS = 8000;

/**
 * 기록 화면 안에 마운트해 두는 캡처 호스트. 렌더러(`ViewShotCalendarImageRenderer`)가 요청을 내놓으면
 * 화면 밖에 달력 뷰를 그리고, 썸네일 로딩이 끝나면 PNG(base64)로 캡처해 돌려준다.
 */
export function CalendarImageCaptureHost({
  renderer,
}: {
  renderer: ViewShotCalendarImageRenderer;
}) {
  const { request } = useViewModelState(renderer);
  useEffect(() => renderer.attachHost(), [renderer]);
  // 요청마다 새로 마운트해 로딩 카운터·타이머가 요청 사이에 섞이지 않게 한다.
  return request ? <CaptureSession key={sessionKey(request)} request={request} /> : null;
}

const keys = new WeakMap<CaptureRequest, number>();
let nextKey = 0;
function sessionKey(request: CaptureRequest): number {
  let key = keys.get(request);
  if (key === undefined) {
    nextKey += 1;
    key = nextKey;
    keys.set(request, key);
  }
  return key;
}

function CaptureSession({ request }: { request: CaptureRequest }) {
  const viewRef = useRef<HostInstance>(null);
  const total = request.input.photos.length;
  const [settled, setSettled] = useState(0);
  const [timedOut, setTimedOut] = useState(false);
  const ready = settled >= total || timedOut;

  const onPhotoSettled = useCallback(() => setSettled((count) => count + 1), []);

  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), IMAGE_WAIT_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    // 마지막 이미지가 그려질 한 프레임을 기다린 뒤 캡처한다.
    const frame = requestAnimationFrame(() => {
      const target = viewRef.current;
      if (!target) return request.fail(new Error('calendar view is not mounted'));
      captureRef(target, { format: 'png', result: 'base64' }).then(
        (png) => {
          if (!cancelled) request.succeed(png);
        },
        (error: unknown) => {
          if (!cancelled) request.fail(error);
        },
      );
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [ready, request]);

  // 화면 밖이지만 마운트·레이아웃은 되어 있어야 캡처된다(display:none·opacity 0은 빈 이미지가 된다).
  return (
    <View style={styles.offscreen} pointerEvents="none" accessibilityElementsHidden>
      <View ref={viewRef} collapsable={false}>
        <CalendarImageView input={request.input} onPhotoSettled={onPhotoSettled} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  offscreen: { position: 'absolute', top: 0, left: -10000 },
});
