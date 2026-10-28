import {
  MainPhaseViewModelOwner,
  type MainPhaseViewModelOwnerDeps,
  type MainPhaseViewModelOwnerState,
} from '../boot/MainPhaseViewModelOwner';
import type { HomeViewModel } from './HomeViewModel';

export type HomeViewModelOwnerState = MainPhaseViewModelOwnerState<HomeViewModel>;
export type HomeViewModelOwnerDeps = MainPhaseViewModelOwnerDeps<HomeViewModel>;

/** 홈 ViewModel의 소유자(메인 단계 동안 산다). 규칙은 MainPhaseViewModelOwner를 본다. */
export class HomeViewModelOwner extends MainPhaseViewModelOwner<HomeViewModel> {}
