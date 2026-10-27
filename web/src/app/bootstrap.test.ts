import { bootstrapApp } from './bootstrap';

describe('bootstrapApp', () => {
  it('REQ-NET-002 잘못된 VITE_API_BASE_URL이면 config_error를 돌려주고 던지지 않는다', () => {
    expect(bootstrapApp({ VITE_API_BASE_URL: 'http://chalkak.example' })).toEqual({ kind: 'config_error' });
  });

  it('올바른 설정이면 라우터를 만든다', () => {
    const boot = bootstrapApp({ VITE_API_BASE_URL: '' });
    expect(boot.kind).toBe('ready');
    if (boot.kind === 'ready') boot.router.dispose();
  });
});
