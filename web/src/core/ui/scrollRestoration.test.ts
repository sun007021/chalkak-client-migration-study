import { bootstrapApp } from '../../app/bootstrap';
import { disableBrowserScrollRestoration } from './scrollRestoration';

describe('스크롤 복원 수동 전환 (코드리뷰 6)', () => {
  it('scrollRestoration을 manual로 바꾼다', () => {
    const history: { scrollRestoration: ScrollRestoration } = { scrollRestoration: 'auto' };
    disableBrowserScrollRestoration(history);
    expect(history.scrollRestoration).toBe('manual');
  });

  it('지원하지 않는 history 객체와 쓰기가 막힌 객체에서는 던지지 않는다', () => {
    expect(() => disableBrowserScrollRestoration({})).not.toThrow();
    const frozen = Object.freeze({ scrollRestoration: 'auto' as ScrollRestoration });
    expect(() => disableBrowserScrollRestoration(frozen)).not.toThrow();
  });

  it('앱 시작(bootstrapApp)이 브라우저 자동 복원을 끈다', () => {
    window.history.scrollRestoration = 'auto';
    const boot = bootstrapApp({ VITE_API_BASE_URL: '' });
    expect(window.history.scrollRestoration).toBe('manual');
    if (boot.kind === 'ready') boot.router.dispose();
  });
});
