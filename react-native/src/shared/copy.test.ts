import ko from '../../../shared/copy/ko.json';
import { format, t, type CopyKey } from './copy';

describe('copy', () => {
  it('모든 키가 ko.json 값을 그대로 돌려준다', () => {
    for (const key of Object.keys(ko) as CopyKey[]) {
      expect(t(key)).toBe(ko[key]);
    }
  });

  it('설정 오류 문구 키가 있다', () => {
    expect(t('common.error.config')).toBe('API 설정을 확인해 주세요.');
  });

  it('없는 키는 undefined가 되어 실패로 드러난다(타입 우회 시)', () => {
    expect(t('없는.키' as CopyKey)).toBeUndefined();
  });

  it('format은 플레이스홀더를 채우고 없는 값은 그대로 둔다', () => {
    expect(format('{주제} 전시', { 주제: '봄' })).toBe('봄 전시');
    expect(format('{a}/{b}', { a: 1 })).toBe('1/{b}');
  });
});
