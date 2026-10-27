import { ko, t } from './ko';

describe('copy/ko', () => {
  it('common-infra 문구 표의 값과 같다', () => {
    expect(ko['common.error.network']).toBe('네트워크 연결을 확인해 주세요.');
    expect(ko['common.error.generic']).toBe('요청을 처리하지 못했어요. 다시 시도해 주세요.');
    expect(ko['common.error.config']).toBe('API 설정을 확인해 주세요.');
    expect(ko['common.retry']).toBe('다시 시도');
    expect(ko['common.confirm']).toBe('확인');
  });

  it('t(key)는 키의 문구를 돌려준다', () => {
    expect(t('common.retry')).toBe(ko['common.retry']);
  });
});
