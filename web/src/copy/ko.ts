// common-infra.md "문구" 표. 공용 shared/copy/ko.json이 생기면 그 값과 대조한다.
export const ko = {
  'common.error.network': '네트워크 연결을 확인해 주세요.',
  'common.error.generic': '요청을 처리하지 못했어요. 다시 시도해 주세요.',
  'common.error.config': 'API 설정을 확인해 주세요.',
  'common.retry': '다시 시도',
  'common.confirm': '확인',
} as const;

export type CopyKey = keyof typeof ko;

export function t(key: CopyKey): string {
  return ko[key];
}
