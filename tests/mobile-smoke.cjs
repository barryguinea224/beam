'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const BASE_URL = process.env.BEAM_TEST_URL || 'http://127.0.0.1:8765';
const SIZES = [320, 360, 390, 430];
const OUT = path.join(process.cwd(), 'artifacts/mobile');
fs.mkdirSync(OUT, { recursive: true });

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
  const failures = [];
  const results = [];

  try {
    for (const width of SIZES) {
      const context = await browser.newContext({
        viewport: { width, height: 844 },
        deviceScaleFactor: 1,
        isMobile: true,
        hasTouch: true
      });
      const page = await context.newPage();
      const jsErrors = [];
      page.on('pageerror', error => jsErrors.push(error.message));

      try {
        await page.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded' });
        await page.locator('#contact-form').waitFor();
        await page.evaluate(() => document.fonts.ready);

        const measurements = await page.evaluate(() => {
          const selectors = [
            '#approche .steps',
            '#approche .step',
            '#formation .terminal-scene',
            '#formation .training-copy',
            '#acteurs .actors-teaser-side',
            '#contact .form-card',
            '#contact .form-row',
            '#contact input[name="nom"]',
            '#contact textarea'
          ];
          return {
            viewport: window.innerWidth,
            documentWidth: document.documentElement.scrollWidth,
            bodyWidth: document.body.scrollWidth,
            sections: selectors.flatMap(selector => {
              const nodes = [...document.querySelectorAll(selector)];
              return nodes.map(node => {
                const box = node.getBoundingClientRect();
                return {
                  selector,
                  left: Math.round(box.left),
                  right: Math.round(box.right),
                  width: Math.round(box.width)
                };
              });
            })
          };
        });

        assert.ok(
          measurements.documentWidth <= measurements.viewport + 1,
          'Horizontal scroll: ' + JSON.stringify(measurements)
        );
        for (const item of measurements.sections) {
          assert.ok(
            item.left >= -1 && item.right <= measurements.viewport + 1,
            'Clipped content at ' + width + 'px: ' + JSON.stringify(item)
          );
        }

        const menu = page.locator('.menu-toggle');
        await menu.click();
        assert.equal(await menu.getAttribute('aria-expanded'), 'true', 'Mobile menu did not open');
        await page.locator('.main-nav a[href="#formation"]').click();
        assert.equal(await menu.getAttribute('aria-expanded'), 'false', 'Mobile menu did not close');

        await page.locator('.terminal-choice[data-demo="NM"]').click();
        assert.equal(
          await page.locator('#terminal-command').textContent(),
          'NM1DIALLO/AMADOU MR',
          'GDS training demo not interactive'
        );

        await page.locator('a[data-service="Assistance visa"]').click();
        assert.equal(
          await page.locator('#service-select').inputValue(),
          'Assistance visa',
          'Contact form service preselection failed'
        );
        assert.equal(await page.locator('form[name="contact-beam"]').getAttribute('data-netlify'), 'true');

        await page.screenshot({
          path: path.join(OUT, 'homepage-' + width + 'px.png'),
          fullPage: true,
          animations: 'disabled'
        });
        assert.deepEqual(jsErrors, [], 'Browser JS error(s): ' + jsErrors.join('; '));
        results.push({ width, result: 'PASS', documentWidth: measurements.documentWidth });
        console.log('PASS ' + width + 'px: no overflow; navigation, terminal and form OK');
      } catch (error) {
        const message = String(error && (error.stack || error.message || error));
        failures.push({ width, error: message });
        results.push({ width, result: 'FAIL', message });
        console.error('FAIL ' + width + 'px: ' + message);
        await page.screenshot({
          path: path.join(OUT, 'failure-' + width + 'px.png'),
          fullPage: true,
          animations: 'disabled',
          timeout: 10000
        }).catch(() => {});
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(results, null, 2) + '\n');
  if (failures.length) process.exitCode = 1;
}

main().catch(err => { console.error(err); process.exitCode = 1; });
