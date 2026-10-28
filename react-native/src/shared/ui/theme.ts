// 화면 공통 색·간격. 디자인 토큰이 확정되면 여기 한 곳만 바꾼다.
export const colors = {
  background: '#FFFFFF',
  surface: '#F4F4F5',
  textPrimary: '#191919',
  textSecondary: '#666666',
  accent: '#FF5A36',
  border: '#E5E5E5',
  danger: '#D33',
  /** 화면 위를 덮는 로딩 레이어 배경과 그 위의 표시 색. */
  overlay: 'rgba(0,0,0,0.25)',
  onOverlay: '#FFFFFF',
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;
