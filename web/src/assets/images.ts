// shared/design/images 의 원본 에셋을 번들에 넣는다(복사하지 않고 같은 파일을 import).
import launchLogo from '../../../shared/design/images/ChalkakLaunchLogo.png';
import loginBackground from '../../../shared/design/images/img_login_background.jpg';
import kakaoLogo from '../../../shared/design/images/img_kakao_logo.png';
import issueBetaThanks from '../../../shared/design/images/issue_beta_thanks.png';
import previewPhoto from '../../../shared/design/images/preview_photo.jpg';
import previewSignature from '../../../shared/design/images/preview_signature.png';
import logoTransparent from '../../../shared/design/images/chalkak_logo_transparent.png';

export const images = { launchLogo, loginBackground, kakaoLogo, issueBetaThanks, previewPhoto, previewSignature, logoTransparent } as const;
