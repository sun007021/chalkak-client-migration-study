import { useRef, type ReactNode } from 'react';
import {
  StyleSheet,
  View,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import type { CropHandle, CropRect } from '../CropGeometry';
import type { Size } from '../ImageTypes';

const HANDLE_TOUCH = 44;
const HANDLE_MARK = 18;
const HANDLES: readonly CropHandle[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
const SHADE = 'rgba(0,0,0,0.55)';

export type CropFrameProps = {
  testID: string;
  /** 돌린 사진이 화면에 보이는 크기. 프레임은 이 크기의 영역 위에 놓는다. */
  displayed: Size;
  rect: CropRect;
  /** 비율(돌린 사진 기준) 단위의 이동량. */
  onMove: (dx: number, dy: number) => void;
  onResize: (handle: CropHandle, dx: number, dy: number) => void;
};

/** 자르기 영역: 안쪽을 끌면 이동하고 네 모서리를 끌면 크기가 바뀐다. 바깥은 어둡게 덮는다. */
export function CropFrame({ testID, displayed, rect, onMove, onResize }: CropFrameProps) {
  const left = (rect.centerX - rect.width / 2) * displayed.width;
  const top = (rect.centerY - rect.height / 2) * displayed.height;
  const width = rect.width * displayed.width;
  const height = rect.height * displayed.height;

  return (
    <View
      testID={testID}
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: displayed.width,
        height: displayed.height,
      }}
    >
      <View
        pointerEvents="none"
        style={[styles.shade, { left: 0, top: 0, right: 0, height: top }]}
      />
      <View
        pointerEvents="none"
        style={[styles.shade, { left: 0, top: top + height, right: 0, bottom: 0 }]}
      />
      <View pointerEvents="none" style={[styles.shade, { left: 0, top, width: left, height }]} />
      <View
        pointerEvents="none"
        style={[styles.shade, { left: left + width, top, right: 0, height }]}
      />
      <Drag
        displayed={displayed}
        onDelta={(dx, dy) => onMove(dx, dy)}
        style={[styles.frame, { left, top, width, height }]}
      >
        {HANDLES.map((handle) => (
          <Drag
            key={handle}
            displayed={displayed}
            onDelta={(dx, dy) => onResize(handle, dx, dy)}
            style={[styles.touch, handlePosition(handle)]}
          >
            <View style={[styles.mark, markStyle(handle)]} />
          </Drag>
        ))}
      </Drag>
    </View>
  );
}

function handlePosition(handle: CropHandle) {
  const offset = -HANDLE_TOUCH / 2;
  return {
    [handle.startsWith('top') ? 'top' : 'bottom']: offset,
    [handle.endsWith('left') ? 'left' : 'right']: offset,
  };
}

function markStyle(handle: CropHandle) {
  const top = handle.startsWith('top');
  const leftSide = handle.endsWith('left');
  return {
    [top ? 'borderTopWidth' : 'borderBottomWidth']: 3,
    [leftSide ? 'borderLeftWidth' : 'borderRightWidth']: 3,
    [top ? 'top' : 'bottom']: HANDLE_TOUCH / 2 - 2,
    [leftSide ? 'left' : 'right']: HANDLE_TOUCH / 2 - 2,
  };
}

const styles = StyleSheet.create({
  shade: { position: 'absolute', backgroundColor: SHADE },
  frame: { position: 'absolute', borderWidth: 1, borderColor: '#FFFFFF' },
  touch: { position: 'absolute', width: HANDLE_TOUCH, height: HANDLE_TOUCH },
  mark: { position: 'absolute', width: HANDLE_MARK, height: HANDLE_MARK, borderColor: '#FFFFFF' },
});

/** 끌기 영역. 누른 자리(pageX/pageY)에서 움직인 거리를 사진 크기에 대한 비율로 바꿔 증분으로 알린다. */
function Drag(props: {
  testID?: string;
  displayed: Size;
  onDelta: (dx: number, dy: number) => void;
  style: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const last = useRef({ x: 0, y: 0 });
  return (
    <View
      testID={props.testID}
      style={props.style}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={(event: GestureResponderEvent) => {
        last.current = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY };
      }}
      onResponderMove={(event: GestureResponderEvent) => {
        const { pageX, pageY } = event.nativeEvent;
        const dx = (pageX - last.current.x) / props.displayed.width;
        const dy = (pageY - last.current.y) / props.displayed.height;
        last.current = { x: pageX, y: pageY };
        props.onDelta(dx, dy);
      }}
    >
      {props.children}
    </View>
  );
}
