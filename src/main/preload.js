const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel, payload) => ipcRenderer.invoke(channel, payload);
const requestId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

contextBridge.exposeInMainWorld('api', {
  setInterfaceZoom: (factor) => invoke('app:set-interface-zoom', factor),
  getState: () => invoke('state:get'),
  getBookmarkImportSources: () => invoke('bookmarks:import-sources'),
  chooseBookmarkImportFiles: () => invoke('bookmarks:choose-files'),
  importBrowserBookmarks: (payload) => invoke('bookmarks:import', payload),
  chooseExtensionPath: () => invoke('extension:choose'),
  chooseExtensionDirectory: () => invoke('extension:choose-directory'),
  inspectExtension: (sourcePath) => invoke('extension:inspect', sourcePath),
  installExtension: (payload) => invoke('extension:install', payload),
  installExtensionFromStore: (payload) => invoke('extension:install-store', payload),
  selectOfficialExtensionStoreProxy: () => invoke('extension:select-official-store-proxy'),
  searchExtensionStore: (payload) => invoke('extension:store-search', payload),
  getExtensionStoreDetail: (extensionId) => invoke('extension:store-detail', extensionId),
  searchOfficialExtensionStore: (payload) => invoke('extension:official-search', payload),
  getOfficialExtensionStoreDetail: (extensionId) => invoke('extension:official-detail', extensionId),
  installExtensionFromCrxSoso: (payload) => invoke('extension:install-crxsoso', payload),
  setExtensionProfiles: (payload) => invoke('extension:set-profiles', payload),
  setExtensionProfile: (payload) => invoke('extension:set-profile', payload),
  deleteExtension: (extensionId) => invoke('extension:delete', extensionId),
  checkExtensionUpdate: (extensionId) => invoke('extension:check-update', extensionId),
  updateExtension: (extensionId) => invoke('extension:update', extensionId),
  getAgentProfileSettings: (profileId) => invoke('agent:get-profile-settings', profileId),
  saveAgentProfileSettings: (payload) => invoke('agent:save-profile-settings', payload),
  fetchAgentModels: (payload, onRequestId) => {
    const id = requestId('manager-agent-models');
    try { onRequestId?.(id); } catch { /* Cancellation is best effort. */ }
    return invoke('agent:fetch-models', { ...payload, requestId: id });
  },
  testAgentConnection: (payload, onRequestId) => {
    const id = requestId('manager-agent-connection');
    try { onRequestId?.(id); } catch { /* Cancellation is best effort. */ }
    return invoke('agent:test-connection', { ...payload, requestId: id });
  },
  cancelAgentRequest: (id) => {
    const safeId = String(id || '').slice(0, 160);
    if (!safeId) return false;
    ipcRenderer.send('browser-shell:agent-request-cancel', safeId);
    return true;
  },
  saveProfile: (profile) => invoke('profile:save', profile),
  deleteProfile: (profileId) => invoke('profile:delete', profileId),
  launchProfile: (profileId) => invoke('profile:launch', profileId),
  resolveProfileLaunchConfirmation: (payload) => invoke('profile:resolve-launch-confirmation', payload),
  stopProfile: (profileId) => invoke('profile:stop', profileId),
  switchProfileNode: (payload) => invoke('profile:switch-node', payload),
  checkProfileConnection: (profileId) => invoke('profile:check-connection', profileId),
  checkDirectConnection: () => invoke('connection:check-direct'),
  importSubscription: (payload) => invoke('subscription:import', payload),
  refreshSubscription: (subscriptionId) => invoke('subscription:refresh', subscriptionId),
  renameSubscription: (payload) => invoke('subscription:rename', payload),
  getSubscriptionEdit: (subscriptionId) => invoke('subscription:get-edit', subscriptionId),
  editSubscription: (payload) => invoke('subscription:edit', payload),
  moveSubscription: (payload) => invoke('subscription:move', payload),
  reorderSubscriptions: (payload) => invoke('subscription:reorder', payload),
  deleteSubscription: (subscriptionId) => invoke('subscription:delete', subscriptionId),
  saveNode: (node) => invoke('node:save', node),
  savePasswordEntry: (entry) => invoke('password:save', entry),
  deletePasswordEntry: (entryId) => invoke('password:delete', entryId),
  revealPasswordEntry: (entryId) => invoke('password:reveal', entryId),
  setNodeCore: (payload) => invoke('node:set-core', payload),
  deleteNode: (nodeId) => invoke('node:delete', nodeId),
  checkNode: (nodeId) => invoke('node:check', nodeId),
  checkNodes: (nodeIds) => invoke('node:check-batch', nodeIds),
  saveSettings: (settings) => invoke('settings:save', settings),
  chooseEnginePath: () => invoke('settings:choose-engine'),
  chooseXrayPath: () => invoke('settings:choose-xray'),
  chooseSingboxPath: () => invoke('settings:choose-singbox'),
  installCore: (core) => invoke('core:install', { core }),
  installBrowser: () => invoke('browser:install'),
  openDataFolder: () => invoke('app:open-data-folder'),
  onStateUpdated: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('state:updated', listener);
    return () => ipcRenderer.removeListener('state:updated', listener);
  },
  onNavigate: (callback) => {
    const listener = (_event, view) => callback(view);
    ipcRenderer.on('manager:navigate', listener);
    return () => ipcRenderer.removeListener('manager:navigate', listener);
  },
  onCoreUpdateAvailable: (callback) => {
    const listener = (_event, update) => callback(update);
    ipcRenderer.on('core:update-available', listener);
    return () => ipcRenderer.removeListener('core:update-available', listener);
  },
  onBrowserUpdateAvailable: (callback) => {
    const listener = (_event, update) => callback(update);
    ipcRenderer.on('browser:update-available', listener);
    return () => ipcRenderer.removeListener('browser:update-available', listener);
  },
  onConfirmationRequest: (callback) => {
    const listener = (_event, request) => callback(request);
    ipcRenderer.on('app:confirmation-request', listener);
    return () => ipcRenderer.removeListener('app:confirmation-request', listener);
  },
  respondToConfirmation: (requestId, confirmed) => ipcRenderer.send('app:confirmation-response', { requestId, confirmed }),
});
