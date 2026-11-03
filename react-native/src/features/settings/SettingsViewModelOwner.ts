import {
  MainPhaseViewModelOwner,
  type MainPhaseViewModelOwnerDeps,
  type MainPhaseViewModelOwnerState,
} from '../boot/MainPhaseViewModelOwner';
import type { SettingsViewModel } from './SettingsViewModel';

export type SettingsViewModelOwnerState = MainPhaseViewModelOwnerState<SettingsViewModel>;
export type SettingsViewModelOwnerDeps = MainPhaseViewModelOwnerDeps<SettingsViewModel>;

/** 설정 ViewModel의 소유자(메인 단계 동안 산다). 로그아웃·계정 전환 때 버려 이전 계정의 값이 남지 않는다. */
export class SettingsViewModelOwner extends MainPhaseViewModelOwner<SettingsViewModel> {}
