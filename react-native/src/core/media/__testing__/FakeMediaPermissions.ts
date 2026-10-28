import type { MediaPermissions, PhotoAddPermission } from '../MediaPermissions';

export class FakeMediaPermissions implements MediaPermissions {
  addPermission: PhotoAddPermission = 'granted';
  requests = 0;
  settingsOpened = 0;

  async requestPhotoAddPermission(): Promise<PhotoAddPermission> {
    this.requests += 1;
    return this.addPermission;
  }

  async openSettings(): Promise<void> {
    this.settingsOpened += 1;
  }
}
