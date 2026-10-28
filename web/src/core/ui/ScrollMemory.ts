/**
 * 화면별 스크롤 위치 기억(뒤로가기·닫기 후 이전 화면의 위치 복원). 키는 history 항목의 location.key다
 * (브라우저 뒤로가기도 같은 항목으로 돌아오므로 닫기 버튼과 뒤로가기가 같은 위치로 복원된다).
 * 화면은 언마운트될 때 window.scrollY를 save하고, 마운트되어 내용이 준비되면 read한 값으로 window.scrollTo({ top })한다.
 */
export class ScrollMemory {
  save(_key: string, _top: number): void {
    throw new Error('not implemented');
  }

  /** 저장된 값, 없으면 null. */
  read(_key: string): number | null {
    throw new Error('not implemented');
  }
}
