(() => {
  'use strict';

  const INSTALL_FLAG = '__OT_MATRIX_CLEANER_V5_EXTENSION__';
  if (window[INSTALL_FLAG]) return;
  window[INSTALL_FLAG] = true;

  function install() {
    const api = window.__OT_MATRIX_CLEANER__;
    if (!api) return false;
    if (api.getReleaseInfo && api.getReleaseInfo().version === '5.0.0') return true;
    const baseGetConfig = api.getConfig ? api.getConfig.bind(api) : () => ({});
    api.getReleaseInfo = () => ({
      version: '5.0.0',
      channel: 'production',
      build: 'modular-extension',
      generatedAt: new Date().toISOString(),
      modules: [
        'preview',
        'dsl',
        'checklists',
        'search-everywhere',
        'patchers',
        'audit',
      ],
    });
    api.getExtendedConfig = () => {
      const base = baseGetConfig();
      base.v5 = {
        featureFlags: {
          visualPreview: true,
          jsonDslV2: true,
          checklistEngine: true,
          globalSearchMode: true,
        },
      };
      return base;
    };
    return true;
  }

  if (install()) return;
  const timer = setInterval(() => {
    if (!install()) return;
    clearInterval(timer);
  }, 200);
  setTimeout(() => clearInterval(timer), 15000);
})();
