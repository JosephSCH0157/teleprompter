/** @jest-environment jsdom */

import { applyScrollModeUI } from '../../src/ui/scrollMode';

function mountModeUi(): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = `
    <div id="autoRow"></div>
    <div id="autoSpeedWrap"></div>
    <label>Auto-scroll <input id="autoSpeed" /></label>
    <button id="autoToggle"></button>
    <div id="wpmRow"></div>
    <div id="stepControlsRow"></div>
    <p id="scrollModeHelpText">Hybrid follows speech automatically.</p>
  `;
  document.body.appendChild(root);
  return root;
}

describe('scroll mode help text', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  test('ASR help text does not inherit prior mode text', () => {
    const root = mountModeUi();
    const help = root.querySelector<HTMLElement>('#scrollModeHelpText');
    expect(help).toBeTruthy();

    applyScrollModeUI('timed', root);
    expect(help?.textContent).toBe('Timed scroll runs at the px/s value above.');

    applyScrollModeUI('asr', root);
    expect(help?.textContent).toBe('ASR mode follows confirmed speech commits. Start speech sync to arm ASR.');
  });
});
