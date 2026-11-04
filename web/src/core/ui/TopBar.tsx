import type { ReactNode } from 'react';
import { webOnlyCopy } from '../../copy/webOnly';
import { t } from '../../copy/ko';
import { IcArrowBack, IcClose } from './icons.generated';

/** 원본 ChalkakNavigationButton(.back): 지름 48 터치 영역, 아이콘 ic_arrow_back 24(iconPrimary), 접근성 "뒤로 가기". */
export function BackButton({ onClick, testId, disabled }: { onClick: () => void; testId?: string; disabled?: boolean }): ReactNode {
  return (
    <button type="button" className="ck-icon-btn" style={{ width: 48, height: 48 }} data-testid={testId} aria-label={webOnlyCopy['common.back']} disabled={disabled} onClick={onClick}>
      <IcArrowBack size={24} />
    </button>
  );
}

/** 원본 ChalkakNavigationButton(.close): 지름 48, ic_close 22, 접근성 "닫기". */
export function CloseButton({ onClick, testId, disabled }: { onClick: () => void; testId?: string; disabled?: boolean }): ReactNode {
  return (
    <button type="button" className="ck-icon-btn" style={{ width: 48, height: 48 }} data-testid={testId} aria-label={t('common.close')} disabled={disabled} onClick={onClick}>
      <IcClose size={22} />
    </button>
  );
}

/**
 * 화면 상단 바. 왼쪽(보통 뒤로), 가운데 제목(headline), 오른쪽 자리. 좌우 칸 폭을 같게 둬 제목이 가운데에 온다.
 * 알림 상단 바 기준 높이 72(screens-c §1.3), 좌우 여백은 작게 둬 48 버튼의 시각 여백이 20이 되게 한다.
 */
export function TopBar({ title, left, right, titleTestId }: { title?: ReactNode; left?: ReactNode; right?: ReactNode; titleTestId?: string }): ReactNode {
  return (
    <header className="ck-topbar" style={{ minHeight: 72, padding: '0 8px 0 8px', borderBottom: 'none', background: 'var(--color-background)' }}>
      <div className="ck-topbar__side" style={{ justifyContent: 'flex-start', minWidth: 72 }}>{left}</div>
      <h1 className="ck-topbar__title" data-testid={titleTestId}>{title}</h1>
      <div className="ck-topbar__side" style={{ justifyContent: 'flex-end', minWidth: 72 }}>{right}</div>
    </header>
  );
}
