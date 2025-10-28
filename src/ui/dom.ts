// Type facade for the JS module; enables typed imports in TS paths
import * as Dom from './dom.js';
export const bindStaticDom: () => void = (Dom as any).bindStaticDom;
