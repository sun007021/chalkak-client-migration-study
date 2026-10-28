import {
  MainPhaseViewModelOwner,
  type MainPhaseViewModelOwnerDeps,
  type MainPhaseViewModelOwnerState,
} from '../boot/MainPhaseViewModelOwner';
import type { DisplayViewModel } from './DisplayViewModel';

export type DisplayViewModelOwnerState = MainPhaseViewModelOwnerState<DisplayViewModel>;
export type DisplayViewModelOwnerDeps = MainPhaseViewModelOwnerDeps<DisplayViewModel>;

/**
 * 전시 ViewModel의 소유자(메인 단계 동안 산다). 탭을 오가도 (날짜, 정렬) 캐시와 랜덤 시드가 유지되고,
 * 로그아웃·계정 전환 때는 캐시 레지스트리가 clearAll을 불러 비운다.
 */
export class DisplayViewModelOwner extends MainPhaseViewModelOwner<DisplayViewModel> {}
