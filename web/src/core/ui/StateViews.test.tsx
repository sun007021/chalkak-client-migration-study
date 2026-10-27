import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EmptyState, ErrorState, LoadingIndicator } from './StateViews';
import { ko } from '../../copy/ko';

describe('공통 상태 컴포넌트', () => {
  it('REQ-NET-032 LoadingIndicator는 <screenId>.loading testID를 가진다', () => {
    render(<LoadingIndicator screenId="home" />);
    expect(screen.getByTestId('home.loading')).toBeInTheDocument();
  });

  it('REQ-NET-032 EmptyState는 <screenId>.empty-state에 문구를 그린다', () => {
    render(<EmptyState screenId="display">전시된 사진이 없어요</EmptyState>);
    expect(screen.getByTestId('display.empty-state')).toHaveTextContent('전시된 사진이 없어요');
  });

  it('TC-NET-047 ErrorState는 기본 일반 오류 문구와 다시 시도 버튼을 그리고 누르면 onRetry를 부른다', async () => {
    const onRetry = vi.fn();
    render(<ErrorState screenId="home" onRetry={onRetry} />);
    expect(screen.getByTestId('home.error-state')).toHaveTextContent(ko['common.error.generic']);
    const button = screen.getByTestId('home.retry-button');
    expect(button).toHaveTextContent(ko['common.retry']);
    expect(button).toBeEnabled();
    await userEvent.click(button);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('TC-NET-045 ErrorState에 문구를 주면 그 문구를 보인다(네트워크 오류)', () => {
    render(<ErrorState screenId="record" message={ko['common.error.network']} onRetry={() => {}} />);
    expect(screen.getByTestId('record.error-state')).toHaveTextContent('네트워크 연결을 확인해 주세요.');
  });

  it('상태 요소는 서로 다른 screenId에서 testID가 겹치지 않는다', () => {
    render(
      <>
        <LoadingIndicator screenId="home" />
        <LoadingIndicator screenId="display" />
      </>,
    );
    expect(screen.getAllByTestId(/\.loading$/)).toHaveLength(2);
    expect(screen.getByTestId('display.loading')).toBeInTheDocument();
  });
});
