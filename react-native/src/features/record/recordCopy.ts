/**
 * 기록 탭 화면에서 쓰는데 shared/copy/ko.json에 아직 키가 없는 문구. 이 파일 한 곳에만 둔다.
 * ko.json에 키가 생기면 t()로 바꾸고 이 파일을 지운다(README "ko.json 키 필요" 참고).
 */
export const RECORD_COPY = {
  /** 기록 없는 달(posts: [])의 안내. */
  empty: '이 달에는 기록이 없어요',
  previousMonth: '이전 달',
  nextMonth: '다음 달',
  monthPickerButton: '월 선택',
  monthPickerTitle: '월 선택',
  monthPickerClose: '닫기',
} as const;
