import type { ReactNode } from 'react';

/** 브랜드 로고 글자(원본 ChalkakLogo): Continuous 30/36, 자간 -0.42, 접근성 이름 "찰캌". */
export function Logo({ size }: { size?: number }): ReactNode {
  return (
    <span className="t-brand" role="img" aria-label="찰캌" style={size ? { fontSize: size, lineHeight: 1.2 } : undefined}>
      <span aria-hidden="true">Chalkak</span>
    </span>
  );
}
