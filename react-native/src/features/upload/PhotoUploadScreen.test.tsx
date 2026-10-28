import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { deferred } from '../../core/http/__testing__/FakeTransport';
import { fixtureResponse } from '../../core/http/__testing__/loadFixture';
import { picked } from '../../core/media/__testing__/FakeImagePicker';
import type { RouteValue } from '../../data/__testing__/FixtureRouter';
import { format, t } from '../../shared/copy';
import {
  countOf,
  createUploadHarness,
  flush,
  PHOTO_URI,
  TOPIC_TITLE,
} from './__testing__/createUploadHarness';
import { pickAndConfirm } from './__testing__/uploadFlow';
import { PhotoUploadScreen } from './PhotoUploadScreen';

async function renderScreen(
  routes: Record<string, RouteValue> = {},
  options: { platform?: 'ios' | 'android'; start?: boolean } = {},
) {
  const h = await createUploadHarness({ routes, platform: options.platform });
  if (options.start !== false) await h.viewModel.start();
  await render(<PhotoUploadScreen viewModel={h.viewModel} />);
  return h;
}

const press = (id: string) => fireEvent.press(screen.getByTestId(id));
const submitButton = () => screen.getByTestId('upload.submit-button');

describe('PhotoUploadScreen - 기본 화면', () => {
  it('TC-UPL-089 문구: 주제 제목, 안내 문구, 제목 플레이스홀더, 전시하기, 앨범·카메라 버튼', async () => {
    await renderScreen();
    expect(screen.getByTestId('upload.root')).toBeOnTheScreen();
    expect(screen.getByTestId('upload.topic-title')).toHaveTextContent(
      format(t('upload.heading'), { 주제: TOPIC_TITLE }),
    );
    expect(screen.getByTestId('upload.topic-title')).toHaveTextContent(
      '주제 ‘가을 하늘’에 맞는 한 장',
    );
    expect(screen.getByTestId('upload.guide-text')).toHaveTextContent(t('upload.subheading'));
    expect(screen.getByTestId('upload.title-input').props.placeholder).toBe(
      t('upload.caption.placeholder'),
    );
    expect(submitButton()).toHaveTextContent(t('upload.submit'));
    expect(screen.getByTestId('upload.album-button')).toBeOnTheScreen();
    expect(screen.getByTestId('upload.camera-button')).toBeOnTheScreen();
  });

  it('TC-UPL-015 카메라가 없는 기기에서는 카메라 버튼이 없고 앨범 버튼은 있다', async () => {
    const h = await createUploadHarness();
    h.picker.cameraAvailable = false;
    await h.viewModel.start();
    await render(<PhotoUploadScreen viewModel={h.viewModel} />);
    expect(screen.queryByTestId('upload.camera-button')).not.toBeOnTheScreen();
    expect(screen.getByTestId('upload.album-button')).toBeOnTheScreen();
  });

  it('REQ-UPL-010 주제를 받지 못하면 안내와 "다시 시도"를 보이고, 누르면 주제만 다시 받는다', async () => {
    const h = await renderScreen({
      'GET /topics?date=2026-10-27': [
        'upload/topics__500-server-error',
        'upload/topics__500-server-error',
        'upload/topics__500-server-error',
        'home/topics__open-2026-10-27',
      ],
    });
    expect(screen.getByTestId('upload.error-state')).toHaveTextContent(
      t('upload.error.topic-load'),
    );
    expect(screen.getByTestId('upload.retry-button')).toHaveTextContent(t('upload.topic.retry'));
    await press('upload.retry-button');
    await waitFor(() => expect(screen.queryByTestId('upload.error-state')).not.toBeOnTheScreen());
    expect(screen.getByTestId('upload.topic-title')).toHaveTextContent(
      '주제 ‘가을 하늘’에 맞는 한 장',
    );
    expect(countOf(h, 'POST /posts/uploads')).toBe(0);
  });

  it('upload.close-button을 누르면 닫는다', async () => {
    const h = await renderScreen();
    await press('upload.close-button');
    expect(h.navigator.ofType('close')).toHaveLength(1);
  });
});

describe('PhotoUploadScreen - 사진과 편집기', () => {
  it('TC-UPL-014 앨범 버튼은 선택기를 열고, 선택하면 편집기가 위에 뜬다', async () => {
    const h = await renderScreen();
    h.picker.willPick(picked(PHOTO_URI));
    await press('upload.album-button');
    expect(h.picker.libraryCalls).toBe(1);
    expect(await screen.findByTestId('photo-edit.root')).toBeOnTheScreen();
  });

  it('TC-UPL-016 카메라 버튼은 촬영하고 편집기를 연다', async () => {
    const h = await renderScreen();
    h.picker.willCapture(picked('file:///camera/shot.jpg'));
    await press('upload.camera-button');
    expect(h.picker.captureCalls).toBe(1);
    expect(await screen.findByTestId('photo-edit.root')).toBeOnTheScreen();
  });

  it('사진이 없으면 미리보기가 없고, 편집을 확정하면 원본 비율로 미리보기를 보인다', async () => {
    const h = await renderScreen();
    expect(screen.queryByTestId('upload.photo-preview')).not.toBeOnTheScreen();

    h.engine.sizes.set(PHOTO_URI, { width: 3000, height: 4000 });
    await pickAndConfirm(h);
    const preview = await screen.findByTestId('upload.photo-preview');
    // [가정: 미리보기 컨테이너 또는 이미지의 style.aspectRatio가 원본 가로/세로 비율이다]
    const style = StyleSheet.flatten(preview.props.style) as { aspectRatio?: number };
    expect(style.aspectRatio).toBeCloseTo(3000 / 4000, 5);
    expect(screen.queryByTestId('photo-edit.root')).not.toBeOnTheScreen();
  });

  it('TC-EDIT-006 사진을 탭하면 편집기가 다시 열린다', async () => {
    const h = await renderScreen();
    await pickAndConfirm(h);
    await press('upload.photo-preview');
    expect(await screen.findByTestId('photo-edit.root')).toBeOnTheScreen();
    expect(h.viewModel.getSnapshot().editing).toBe(true);
  });
});

describe('PhotoUploadScreen - 전시하기', () => {
  it('TC-UPL-047 사진이 없으면 전시하기는 비활성이고 누르면 아무것도 보내지 않는다', async () => {
    const h = await renderScreen();
    expect(submitButton()).toBeDisabled();
    await fireEvent.press(submitButton());
    expect(countOf(h, 'POST /posts')).toBe(0);
  });

  it('TC-UPL-047 사진을 고르면 준비 중에도 활성이고 준비 중 표시가 보인다', async () => {
    const h = await renderScreen();
    const hold = h.engine.holdNext('encodeWebp');
    await pickAndConfirm(h);
    expect(await screen.findByTestId('upload.preparing-indicator')).toBeOnTheScreen();
    expect(screen.getByText('사진 다듬는 중')).toBeOnTheScreen();
    expect(submitButton()).toBeEnabled();
    hold.release();
    await waitFor(() =>
      expect(screen.queryByTestId('upload.preparing-indicator')).not.toBeOnTheScreen(),
    );
    expect(submitButton()).toBeEnabled();
  });

  it('TC-UPL-029 준비가 실패하면 오류 문구를 보이고 전시하기는 여전히 활성이다', async () => {
    const h = await renderScreen({
      'POST /posts/uploads': 'upload/posts-uploads__500-server-error',
    });
    await pickAndConfirm(h);
    expect(await screen.findByTestId('upload.error-message')).toHaveTextContent(
      t('upload.error.prepare'),
    );
    expect(submitButton()).toBeEnabled();
  });

  it('TC-UPL-048 제출 중에는 "전시 중..."이고 비활성이며 제출 중 표시가 보인다', async () => {
    const gate = deferred<void>();
    const h = await renderScreen({
      'POST /posts': async () => {
        await gate.promise;
        return fixtureResponse('upload/posts-create__201-pending');
      },
    });
    await pickAndConfirm(h);
    await fireEvent.press(submitButton());
    await flush();

    await waitFor(() => expect(submitButton()).toHaveTextContent(t('upload.submitting')));
    expect(submitButton()).toBeDisabled();
    expect(screen.getByTestId('upload.submitting-indicator')).toBeOnTheScreen();

    gate.resolve();
    await waitFor(() => expect(h.navigator.ofType('show-success')).toHaveLength(1));
  });

  it('TC-UPL-073 연타해도 POST /posts는 한 번이다', async () => {
    const gate = deferred<void>();
    const h = await renderScreen({
      'POST /posts': async () => {
        await gate.promise;
        return fixtureResponse('upload/posts-create__201-pending');
      },
    });
    await pickAndConfirm(h);
    await fireEvent.press(submitButton());
    await fireEvent.press(submitButton());
    await fireEvent.press(submitButton());
    await flush();
    gate.resolve();
    await waitFor(() => expect(h.navigator.ofType('show-success')).toHaveLength(1));
    expect(countOf(h, 'POST /posts')).toBe(1);
  });

  it('TC-UPL-074 제출이 실패하면 오류 문구를 보이고 사진·제목이 남으며 다시 제출할 수 있다', async () => {
    const h = await renderScreen({ 'POST /posts': 'upload/posts-create__500-server-error' });
    await pickAndConfirm(h);
    await fireEvent.changeText(screen.getByTestId('upload.title-input'), '가을');
    await fireEvent.press(submitButton());
    expect(await screen.findByTestId('upload.error-message')).toHaveTextContent(
      t('upload.error.create'),
    );
    expect(screen.getByTestId('upload.title-input').props.value).toBe('가을');
    expect(screen.getByTestId('upload.photo-preview')).toBeOnTheScreen();
    expect(submitButton()).toBeEnabled();
    expect(submitButton()).toHaveTextContent(t('upload.submit'));
  });
});

describe('PhotoUploadScreen - 제목', () => {
  it('TC-UPL-080 입력은 ViewModel을 거쳐 10 code point로 잘리고 글자 수가 갱신된다', async () => {
    await renderScreen();
    const input = screen.getByTestId('upload.title-input');
    await fireEvent.changeText(input, '가나다라마바사아자차카');
    expect(screen.getByTestId('upload.title-input').props.value).toBe('가나다라마바사아자차');
    // [가정: 글자 수는 "{현재}/10" 형식. 카피 키가 없어 문구 키 추가가 필요하다]
    expect(screen.getByTestId('upload.title-counter')).toHaveTextContent('10/10');
  });

  it('TC-UPL-081 결합 이모지도 code point로 센다', async () => {
    await renderScreen();
    await fireEvent.changeText(screen.getByTestId('upload.title-input'), '👨‍👩‍👧👨‍👩‍👧가');
    expect(Array.from(screen.getByTestId('upload.title-input').props.value as string)).toHaveLength(
      10,
    );
    expect(screen.getByTestId('upload.title-counter')).toHaveTextContent('10/10');
  });

  it('TC-UPL-082 앞뒤 공백은 글자 수에서 뺀다', async () => {
    await renderScreen();
    await fireEvent.changeText(screen.getByTestId('upload.title-input'), '  가나다  ');
    expect(screen.getByTestId('upload.title-counter')).toHaveTextContent('3/10');
  });
});

describe('PhotoUploadScreen - iOS 촬영 사진 저장 권한 안내', () => {
  async function denied() {
    const h = await renderScreen({}, { platform: 'ios' });
    h.permissions.addPermission = 'denied';
    return h;
  }

  it('권한이 거부되면 안내 대화상자가 뜬다(제목 "촬영 사진 저장 권한")', async () => {
    await denied();
    expect(screen.queryByTestId('upload.camera-permission-dialog')).not.toBeOnTheScreen();
    await press('upload.camera-button');
    const dialog = await screen.findByTestId('upload.camera-permission-dialog');
    expect(dialog).toHaveTextContent(t('upload.permission.save'));
    expect(screen.getByTestId('upload.camera-permission-settings-button')).toHaveTextContent(
      t('upload.permission.settings'),
    );
    expect(screen.getByTestId('upload.camera-permission-shoot-button')).toHaveTextContent(
      t('upload.no-save-capture'),
    );
    expect(screen.getByTestId('upload.camera-permission-cancel-button')).toBeOnTheScreen();
  });

  it('"설정 열기"는 설정 앱을 연다', async () => {
    const h = await denied();
    await press('upload.camera-button');
    await press('upload.camera-permission-settings-button');
    expect(h.permissions.settingsOpened).toBe(1);
  });

  it('"저장 없이 촬영"은 저장 없이 카메라를 열고 편집기로 간다', async () => {
    const h = await denied();
    h.picker.willCapture(picked('file:///camera/shot.jpg'));
    await press('upload.camera-button');
    await press('upload.camera-permission-shoot-button');
    expect(h.gallery.saved).toEqual([]);
    expect(await screen.findByTestId('photo-edit.root')).toBeOnTheScreen();
    expect(screen.queryByTestId('upload.camera-permission-dialog')).not.toBeOnTheScreen();
  });

  it('"취소"는 안내만 닫는다', async () => {
    const h = await denied();
    await press('upload.camera-button');
    await press('upload.camera-permission-cancel-button');
    expect(screen.queryByTestId('upload.camera-permission-dialog')).not.toBeOnTheScreen();
    expect(h.picker.captureCalls).toBe(0);
  });
});
