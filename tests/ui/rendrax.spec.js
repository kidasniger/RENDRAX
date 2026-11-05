import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/config')) return route.fulfill({ json: { ready: true, status: 'online', turnstileSiteKey: '1x00000000000000000000AA' } });
    if (url.pathname.endsWith('/videos')) return route.fulfill({ json: { generatedCount: 1, items: [{
      id: 'v123456789012', created_at: '2026-11-01T12:00:00.000Z', expires_at: '2026-12-01T12:00:00.000Z',
      assets: [{ name: 'exemple.mp4', size: 1024, browser_download_url: '/exemple.mp4' }]
    }] } });
    return route.fulfill({ json: { success: true } });
  });
  await page.route('https://challenges.cloudflare.com/turnstile/v0/api.js*', route => route.fulfill({
    contentType: 'application/javascript',
    body: `window.turnstile = {
      _options: null,
      render: function(selector, options) { this._options = options; return 1; },
      reset: function() {},
      execute: function() { const self = this; setTimeout(function() { self._options.callback('test-token'); }, 0); }
    };`
  }));
  await page.route('https://esm.sh/**', route => {
    if (route.request().url().includes('react-dom/client')) return route.fulfill({ contentType: 'application/javascript', body: 'export function createRoot(){ return { render(){} }; }' });
    return route.fulfill({ contentType: 'application/javascript', body: 'const React={createElement(){return null;}}; export default React; export function useEffect(){}; export function useState(){return [0,()=>{}];}' });
  });
  await page.goto('/');
  await page.waitForFunction(() => document.querySelector('#rdxTutorial')?.open === true);
  await page.locator('#rdxTutorialSkip').click();
  await expect(page.locator('#list li')).toHaveCount(1);
});
test('accepte un fichier HTML', async ({ page }) => {
  await page.locator('#file').setInputFiles({ name: 'animation-test.html', mimeType: 'text/html', buffer: Buffer.from('<!doctype html><html><body><h1>Test RENDRAX</h1></body></html>') });
  await expect(page.locator('#fileinfo')).toContainText('animation-test.html');
});
test('les réglages restent modifiables', async ({ page }) => {
  await page.locator('#modeCards [data-mode="half"]').click();
  await expect(page.locator('#mode')).toHaveValue('half');
  await page.locator('#watermark').check();
  await expect(page.locator('#watermark')).toBeChecked();
});
test('la suppression affiche un toast annulable', async ({ page }) => {
  await expect(page.locator('#list li')).toHaveCount(1);
  await page.locator('.rdx-history-card > summary').click();
  await page.locator('#rdxSelectAll').click();
  await page.locator('#rdxBulkDelete').click();
  await page.locator('#rdxDeleteConfirm').click();
  const toast = page.locator('#rdxToastRegion .rdx-toast');
  await expect(toast).toContainText('suppression dans 5 s');
  await toast.locator('.rdx-toast-action').click();
  await expect(page.locator('#rdxToastRegion')).toContainText('Suppression annulée.');
});
test('applique le thème sombre du système', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(() => page.locator('html').getAttribute('data-theme')).toBe('dark');
});
test('ne déborde pas à 360 px', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
