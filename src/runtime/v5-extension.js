(() => {
  'use strict';

  const INSTALL_FLAG = '__OT_MATRIX_CLEANER_COMPAT_EXTENSION__';
  if (window[INSTALL_FLAG]) return;
  window[INSTALL_FLAG] = true;

  function install() {
    const api = window.__OT_MATRIX_CLEANER__;
    if (!api) return false;
    if (api.getReleaseInfo) {
      const current = api.getReleaseInfo();
      if (current && /^8\./.test(String(current.version || ''))) return true;
    }
    const baseGetConfig = api.getConfig ? api.getConfig.bind(api) : () => ({});
    api.getReleaseInfo = () => ({
      version: '8.0.0',
      channel: 'production',
      build: 'modular-compatibility-extension-v8',
      generatedAt: new Date().toISOString(),
      modules: [
        'preview',
        'dsl',
        'checklists',
        'search-everywhere',
        'patchers',
        'audit',
        'native-counterparty-filter',
        'running-sheet-detector',
        'apply-snapshot',
        'route-doctor',
        'corpus-inventory',
      ],
    });
    api.getExtendedConfig = () => {
      const base = baseGetConfig();
      base.v5 = {
        featureFlags: {
          visualPreview: true,
          jsonDslV2: true,
          jsonDslV6: true,
          checklistEngine: true,
          globalSearchMode: true,
          nativeCounterpartyFilter: true,
          runningSheetDetector: true,
          applySnapshot: true,
          routeDoctor: true,
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
