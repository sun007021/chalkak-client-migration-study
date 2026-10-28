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
    super(derive(false, false));
  }

  /** 하나라도 꺼져 있으면 모두 켜고, 모두 켜져 있으면 모두 끈다. */
  toggleAll(): void {
    const next = !this.getSnapshot().allAgreed;
    this.setState(derive(next, next));
  }

  toggleService(): void {
    const { service, privacy } = this.getSnapshot();
    this.setState(derive(!service, privacy));
  }

  togglePrivacy(): void {
    const { service, privacy } = this.getSnapshot();
    this.setState(derive(service, !privacy));
  }

  openDocument(kind: TermsKind): void {
    this.host.openDocument(kind);
  }

  /** 두 필수 동의 전에는 무시한다. */
  next(): void {
    if (this.getSnapshot().canProceed) this.host.onNext();
  }

  back(): void {
    this.host.onBack();
  }
}

function derive(service: boolean, privacy: boolean): TermsState {
  const allAgreed = service && privacy;
  return { service, privacy, allAgreed, canProceed: allAgreed };
}
