import { displayPath, ROUTES } from '../../app/paths';
import { planUploadClose, readUploadRouteState, RouterUploadNavigator, successNextPath } from './uploadNavigation';
import type { NavigateFn } from './uploadNavigation';

describe('RouterUploadNavigator (REQ-UPL-008)', () => {
  it('TC-UPL-002 /upload로 push하고 state에 topicDate를 싣는다(replace가 아니다)', () => {
    const calls: Parameters<NavigateFn>[] = [];
    const navigator = new RouterUploadNavigator((...args) => void calls.push(args));
    navigator.openUpload({ topicDate: '2026-10-27' });
    expect(calls).toHaveLength(1);
    expect(calls[0]![0]).toBe(ROUTES.upload);
    expect(calls[0]![0]).toBe('/upload');
    expect(calls[0]![1]?.state).toEqual({ topicDate: '2026-10-27' });
    expect(calls[0]![1]?.replace).toBeFalsy();
  });
});

describe('readUploadRouteState', () => {
  it('TC-UPL-002 {topicDate}가 yyyy-MM-dd 실제 날짜이면 그대로 읽는다', () => {
    expect(readUploadRouteState({ topicDate: '2026-10-27' })).toEqual({ topicDate: '2026-10-27' });
    expect(readUploadRouteState({ topicDate: '2024-02-29' })).toEqual({ topicDate: '2024-02-29' });
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['문자열', '2026-10-27'],
    ['topicDate 없음', {}],
    ['숫자 topicDate', { topicDate: 20261027 }],
    ['형식이 다름', { topicDate: '2026/10/27' }],
    ['없는 날짜', { topicDate: '2026-02-30' }],
    ['ISO 시각', { topicDate: '2026-10-27T00:00:00Z' }],
    ['빈 문자열', { topicDate: '' }],
  ])('TC-UPL-002 %s 이면 null이다(딥링크·새 탭 진입)', (_name, state) => {
    expect(readUploadRouteState(state)).toBeNull();
  });
});

describe('planUploadClose (REQ-UPL-012)', () => {
  it('TC-UPL-090 앱 안에서 push로 들어왔으면(location.key가 default가 아님) 뒤로 간다', () => {
    expect(planUploadClose({ key: 'k3j2h1' })).toEqual({ kind: 'back' });
  });

  it('TC-UPL-090 새로고침·딥링크의 첫 항목(key === default)이면 홈으로 replace한다', () => {
    expect(planUploadClose({ key: 'default' })).toEqual({ kind: 'replace', to: ROUTES.home });
  });
});

describe('successNextPath', () => {
  it('TC-UPL-086 업로드한 topicDate의 전시 최신순이다', () => {
    expect(successNextPath('2026-10-27')).toBe(displayPath('2026-10-27', 'recent'));
    expect(successNextPath('2026-10-27')).toBe('/display?date=2026-10-27&sort=recent');
  });
});
