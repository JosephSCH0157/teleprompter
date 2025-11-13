import { JSDOM } from 'jsdom';
import { toggleOverlay } from '../../src/wiring/ui-binds';

test('body overflow is frozen while an overlay is open', () => {
  const dom = new JSDOM(`<!doctype html><body>
    <div id="settingsOverlay" data-overlay="settings" role="dialog" hidden></div>
  </body>`, { url: 'http://local/' });

  (global as any).window = dom.window as any;
  (global as any).document = dom.window.document as any;

  // Open → freeze
  toggleOverlay('settings', true);
  expect(document.body.style.overflow).toBe('hidden');
  expect(document.body.getAttribute('data-smoke-open')).toBe('settings');

  // Close → unfreeze
  toggleOverlay('settings', false);
  expect(document.body.style.overflow).toBe('');
  expect(document.body.getAttribute('data-smoke-open')).toBeNull();
});
