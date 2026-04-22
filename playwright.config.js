const { defineConfig } = require('@playwright/test');

const hasLiveProfile = Boolean(process.env.OT_LIVE_BASE_URL);

module.exports = defineConfig({
  testDir: './tests',
  timeout: 120000,
  retries: 0,
  use: {
    headless: true,
  },
  projects: [
    {
      name: 'local-fixtures',
      use: {
        baseURL: undefined,
      },
    },
    ...(hasLiveProfile ? [{
      name: 'live-preview-only',
      testMatch: /matrix-automation\.spec\.js/,
      use: {
        baseURL: process.env.OT_LIVE_BASE_URL,
        storageState: process.env.OT_STORAGE_STATE || undefined,
      },
      grepInvert: /runCleanup|run batch|Run batch/,
    }] : []),
  ],
});
