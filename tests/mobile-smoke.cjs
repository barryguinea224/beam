'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const BASE_URL = process.env.BEAM_TEST_URL || 'http://127.0.0.1:8765';
const SIZES = [320, 360, 375, 390, 430];
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
            '#outils .tools-grid',
            '#outils .tool-card',
            '#outils .tool-button',
            '#outils .tool-badge',
            '#outils .tool-disclaimer',
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

        // Real homepage section, titles, descriptions, URLs and mobile stacking.
        assert.equal(await page.locator('#outils h2').innerText(), 'Nos outils');
        assert.equal(await page.locator('#outils .tool-card').count(), 3);
        assert.equal(await page.evaluate(() => document.querySelector('#services').nextElementSibling.id), 'outils');
        assert.deepEqual(await page.locator('#outils .tool-card h3').allInnerTexts(), [
          'BTH : votre carnet de voyage',
          'iD : vos informations, votre décision',
          'BTdesk : simulateur de formation aux réservations'
        ]);
        assert.deepEqual(await page.locator('#outils .tool-card > p:not(.tool-disclaimer)').allInnerTexts(), [
          'Vos voyages, vos photos et votre historique en PDF, au même endroit.',
          "Partagez vos informations d'identité en toute sécurité et vérifiez la validité de votre passeport.",
          "Entraînez-vous aux réservations, à la tarification et à l'émission, avec des examens et des certificats de formation."
        ]);
        assert.equal(await page.getByRole('link', {name:'Ouvrir BTH'}).getAttribute('href'), '/travel/');
        const identity = page.getByRole('link', {name:'Ouvrir iD'});
        assert.equal(await identity.getAttribute('href'), 'https://ididentite.com/');
        assert.equal(await identity.getAttribute('rel'), 'noopener');
        assert.equal(await identity.getAttribute('target'), null);
        const demo = page.getByRole('link', {name:'Demander une démonstration'});
        const demoUrl = new URL(await demo.getAttribute('href'));
        assert.equal(demoUrl.origin, 'https://wa.me');
        assert.equal(demoUrl.pathname, '/224622095630');
        assert.deepEqual([...demoUrl.searchParams.keys()], ['text']);
        assert.match(demoUrl.searchParams.get('text'), /démonstration de BTdesk/);
        assert.equal(await page.locator('.tool-badge').innerText(), 'Version en ligne bientôt');
        assert.match(await page.locator('.tool-disclaimer').innerText(), /simulateur indépendant, non affilié à un fournisseur GDS/);
        assert.doesNotMatch(await page.locator('body').innerText(), /GDS\s*LAB/i);
        const toolBoxes = await page.locator('#outils .tool-card').evaluateAll(cards =>
          cards.map(el => {
            const r = el.getBoundingClientRect();
            return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};
          })
        );
        for (let index = 0; index < toolBoxes.length; index++) {
          const box = toolBoxes[index];
          assert.ok(box.left >= -1 && box.right <= width + 1, 'Tools card overflow at ' + width + 'px: ' + JSON.stringify(box));
          if(index > 0)assert.ok(box.top >= toolBoxes[index - 1].bottom - 2,
            'Tool cards must stack at ' + width + 'px');
        }
        assert.ok(await page.locator('.main-nav a[href="#outils"]').count() === 1);
        const menu = page.locator('.menu-toggle');
        await menu.click();
        assert.equal(await menu.getAttribute('aria-expanded'), 'true', 'Mobile menu did not open');
        await page.locator('.main-nav a[href="#outils"]').click();
        assert.equal(await menu.getAttribute('aria-expanded'), 'false', 'Tools navigation must close the mobile menu');
        await menu.click();
        assert.equal(await menu.getAttribute('aria-expanded'), 'true');
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
