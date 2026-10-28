import { SoftwareSignatureRasterizer } from './SoftwareSignatureRasterizer';
import { describeRasterizerContract } from './__testing__/rasterizerContract';

describeRasterizerContract('SoftwareSignatureRasterizer', () => new SoftwareSignatureRasterizer());
