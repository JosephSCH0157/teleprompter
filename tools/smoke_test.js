// tools/smoke_test.js
// Minimal smoke test: launches a headless browser, opens teleprompter_pro.html, checks for toast container and scripts UI elements.
// Uses Playwright if available, otherwise Puppeteer if available, else prints instructions.

const path = require('path');
const fs = require('fs');

const URL = 'http://localhost:8080/teleprompter_pro.html';

async function run() {
  try {
    // Prefer Playwright
    let playwright;
    try {
      playwright = require('playwright');
    } catch (e) {}

    if (playwright) {
      console.log('Using Playwright');
      const browser = await playwright.chromium.launch();
      const page = await browser.newPage();
      await page.goto(URL, { waitUntil: 'networkidle' });
      // Check for toast container
      const hasToast = await page.$('#tp_toast_container');
      const hasScripts = await page.$('#scriptSlots');
      console.log('tp_toast_container:', !!hasToast);
      console.log('scriptSlots:', !!hasScripts);
      await browser.close();
      process.exit(hasToast && hasScripts ? 0 : 2);
    }

    // Try Puppeteer
    let puppeteer;
    try {
      puppeteer = require('puppeteer');
    } catch (e) {}
    if (puppeteer) {
      console.log('Using Puppeteer');
      const browser = await puppeteer.launch();
      const page = await browser.newPage();
      await page.goto(URL, { waitUntil: 'networkidle0' });
      const hasToast = await page.$('#tp_toast_container');
      const hasScripts = await page.$('#scriptSlots');
      console.log('tp_toast_container:', !!hasToast);
      console.log('scriptSlots:', !!hasScripts);
      await browser.close();
      process.exit(hasToast && hasScripts ? 0 : 2);
    }

    console.error('No Playwright or Puppeteer installed. Install one to run the smoke test:');
    console.error('  npm install -D playwright  # or puppeteer');
    process.exit(3);
  } catch (e) {
    console.error('Smoke test error', e);
    process.exit(4);
  }
}

run();
