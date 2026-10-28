import {
  MainPhaseViewModelOwner,
  type MainPhaseViewModelOwnerDeps,
  type MainPhaseViewModelOwnerState,
} from '../boot/MainPhaseViewModelOwner';
import type { RecordViewModel } from './RecordViewModel';

export type RecordViewModelOwnerState = MainPhaseViewModelOwnerState<RecordViewModel>;
export type RecordViewModelOwnerDeps = MainPhaseViewModelOwnerDeps<RecordViewModel>;

/** 기록 ViewModel의 소유자(메인 단계 동안 산다). 탭을 오가도 월별 캐시가 남는다. */
export class RecordViewModelOwner extends MainPhaseViewModelOwner<RecordViewModel> {}
