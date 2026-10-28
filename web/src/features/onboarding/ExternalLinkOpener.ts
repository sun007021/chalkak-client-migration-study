/** 약관 문서를 새 탭(브라우저)으로 연다(D-25, Web). 팝업 차단 등으로 열 수 없으면 false. 테스트는 Fake를 주입한다. */
export interface ExternalLinkOpener {
  open(url: string): boolean;
}

/** 실제 구현: noopener·noreferrer로 새 탭. */
export class WindowExternalLinkOpener implements ExternalLinkOpener {
  open(_url: string): boolean {
    throw new Error('not implemented');
  }
}
