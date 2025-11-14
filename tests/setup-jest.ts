// Polyfills for jsdom environment under Jest
import { TextDecoder, TextEncoder } from 'util';

// @ts-ignore
if (!(global as any).TextEncoder) (global as any).TextEncoder = TextEncoder;
// @ts-ignore
if (!(global as any).TextDecoder) (global as any).TextDecoder = TextDecoder as any;

// Stub scrollTo to avoid errors when called in code under test
// @ts-ignore
if (!(global as any).window?.scrollTo) {
  // @ts-ignore
  (global as any).window = (global as any).window || {};
  // @ts-ignore
  (global as any).window.scrollTo = () => {};
}
