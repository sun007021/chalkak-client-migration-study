import { Observable } from '../../core/state/Observable';

export type TermsKind = 'service' | 'privacy';

export type TermsState = {
  service: boolean;
  privacy: boolean;
  /** 두 필수 항목이 모두 켜져 있을 때만 true(파생값을 상태에 함께 둬 화면이 계산하지 않게 한다). */
  allAgreed: boolean;
  canProceed: boolean;
};

export type TermsHost = {
  openDocument(kind: TermsKind): void;
  onNext(): void;
  onBack(): void;
};

/** 약관 동의 상태. 저장·전송하지 않는다(D-25): 메모리에만 있고 이 인스턴스가 버려지면 사라진다. */
export class TermsViewModel extends Observable<TermsState> {
  constructor(private readonly host: TermsHost) {
    super({ service: false, privacy: false, allAgreed: false, canProceed: false });
  }

  toggleAll(): void {
    throw new Error('not implemented');
  }

  toggleService(): void {
    throw new Error('not implemented');
  }

  togglePrivacy(): void {
    throw new Error('not implemented');
  }

  openDocument(kind: TermsKind): void {
    void this.host;
    void kind;
    throw new Error('not implemented');
  }

  /** 두 필수 동의 전에는 무시한다. */
  next(): void {
    throw new Error('not implemented');
  }

  back(): void {
    throw new Error('not implemented');
  }
}
