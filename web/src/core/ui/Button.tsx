import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';

export type ButtonVariant = 'primary' | 'outlined' | 'destructive' | 'secondary';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  /** primary: 채움(actionPrimary). outlined: 테두리 1px border. destructive·secondary는 다이얼로그 버튼용. */
  variant?: ButtonVariant;
  /** 가로로 꽉 채운다(fillsWidth). */
  fill?: boolean;
  /** 위아래 여백을 줄인 크기(다이얼로그·시트 안). */
  compact?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

const VARIANT_CLASS: Readonly<Record<ButtonVariant, string>> = {
  primary: '',
  outlined: ' ck-btn--outlined',
  destructive: ' ck-btn--destructive',
  secondary: ' ck-btn--secondary',
};

/**
 * 원본 ChalkakButton / ChalkakOutlinedButton(screens-a §1.1~1.2): callout, 패딩 24/17, 라운드 12.
 * 활성 #2B2724 배경, 비활성 actionPrimary 12%, 눌림은 살짝 투명해진다(ck-btn 규칙). 나머지 속성(data-testid, onClick 등)은 그대로 button에 넘긴다.
 */
export function Button({ variant = 'primary', fill = false, compact = false, type = 'button', children, ...rest }: ButtonProps & { children?: ReactNode }): ReactNode {
  return (
    <button type={type} className={`ck-btn${VARIANT_CLASS[variant]}${fill ? ' ck-btn--fill' : ''}${compact ? ' ck-btn--compact' : ''}`} {...rest}>
      {children}
    </button>
  );
}
