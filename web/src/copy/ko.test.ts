import koJson from '../../../shared/copy/ko.json';
import { ko, t } from './ko';

describe('copy/ko (shared/copy/ko.json)', () => {
  it('shared 문구를 그대로 쓴다', () => {
    expect(ko).toBe(koJson);
    expect(ko['common.error.network']).toBe('네트워크 연결을 확인해 주세요.');
    expect(ko['common.error.generic']).toBe('요청을 처리하지 못했어요. 다시 시도해 주세요.');
    expect(ko['common.error.config']).toBe('API 설정을 확인해 주세요.');
    expect(ko['common.retry']).toBe('다시 시도');
    expect(ko['common.confirm']).toBe('확인');
  });

  it('t(key)는 키의 문구를 돌려준다', () => {
    expect(t('common.retry')).toBe(ko['common.retry']);
  });

  it('t(key, params)는 {이름} 플레이스홀더를 치환한다', () => {
    expect(t('home.hero.empty', { 주제: '가을 하늘' })).toBe('"가을 하늘" 사진을 공유하지 않았어요');
    expect(t('home.topic.header', { 'M월 d일': '10월 27일' })).toBe('10월 27일 · 오늘의 주제');
    expect(t('ai.result.score-a11y', { X: 8 })).toBe('전체 점수 10점 만점에 8점');
  });

  it('params에 없는 자리는 그대로 남긴다', () => {
    expect(t('display.picker.day', {})).toBe('{n}일');
  });
});
