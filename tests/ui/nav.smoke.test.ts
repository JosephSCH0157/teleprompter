import { JSDOM } from "jsdom";
import { toggleOverlay } from "../../src/wiring/ui-binds";

function basicDOM() {
  return `
  <body>
    <button id="settingsBtn" data-action="settings-open">Settings</button>
    <button id="shortcutsBtn" data-action="help-open">Help</button>
    <button id="openDisplayBtn" data-action="display">Open display</button>
    <div id="settingsOverlay" data-overlay="settings" hidden></div>
    <div id="shortcutsOverlay" data-overlay="help" hidden></div>
  </body>`;
}

test("Settings/Help open & close and body freeze toggles", () => {
  const dom = new JSDOM(basicDOM(), { url: "http://localhost/" });
  // @ts-ignore use global document/window like app
  (global as any).window = dom.window as any;
  // @ts-ignore
  (global as any).document = dom.window.document as any;

  const body = document.body as any;

  toggleOverlay("settings", true);
  expect(body.dataset.smokeOpen).toBe("settings");
  expect((document.getElementById("settingsOverlay") as HTMLElement).hidden).toBe(false);
  toggleOverlay("settings", false);
  expect(body.dataset.smokeOpen).toBeUndefined();

  toggleOverlay("help", true);
  expect(body.dataset.smokeOpen).toBe("help");
  toggleOverlay("help", false);
  expect(body.dataset.smokeOpen).toBeUndefined();
});
