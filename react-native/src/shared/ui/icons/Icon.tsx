import { createElement, type ComponentType } from 'react';
import Svg, { ClipPath, Defs, G, Path } from 'react-native-svg';

import { ICON_DATA, type IconName, type IconNode } from './iconData';

const TAGS: Record<string, ComponentType<Record<string, unknown>>> = {
  path: Path as ComponentType<Record<string, unknown>>,
  g: G as ComponentType<Record<string, unknown>>,
  defs: Defs as ComponentType<Record<string, unknown>>,
  clipPath: ClipPath as ComponentType<Record<string, unknown>>,
};

const COLOR_ATTRS = ['fill', 'stroke'] as const;

function renderNode(node: IconNode, tint: string | undefined, key: number): React.ReactNode {
  const Component = TAGS[node.t];
  if (!Component) return null;
  const props: Record<string, unknown> = { key, ...node.a };
  if (tint) {
    for (const attr of COLOR_ATTRS) {
      const value = node.a[attr];
      if (value && value !== 'none') props[attr] = tint;
    }
  }
  const children = node.c?.map((child, i) => renderNode(child, tint, i));
  return createElement(Component, props, children);
}

export type IconProps = {
  name: IconName;
  /** 정사각 한 변. 생략하면 SVG 원래 크기. */
  size?: number;
  /** 지정하면 SVG 안의 칠·선 색을 이 색으로 바꾼다(단색 아이콘용). 생략하면 원본 색 그대로(체크박스, 작성 버튼). */
  color?: string;
};

/** `shared/design/icons/*.svg`를 react-native-svg로 그린다. 이모지·텍스트 기호로 아이콘을 대신하지 않는다. */
export function Icon({ name, size, color }: IconProps) {
  const def = ICON_DATA[name];
  const width = size ?? def.w;
  const height = size ? (size * def.h) / def.w : def.h;
  return (
    <Svg
      width={width}
      height={height}
      viewBox={def.vb}
      fill={def.rootFill}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {def.nodes.map((node, i) => renderNode(node, color, i))}
    </Svg>
  );
}
