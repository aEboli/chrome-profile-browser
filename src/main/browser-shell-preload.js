const { contextBridge, ipcRenderer } = require('electron');
const requestId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

contextBridge.exposeInMainWorld('shellApi', {
  onInterfaceZoomCommand: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, command) => callback(command);
    ipcRenderer.on('browser-shell:interface-zoom-command', listener);
    return () => ipcRenderer.removeListener('browser-shell:interface-zoom-command', listener);
  },
  onConfirmationRequest: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, request) => callback(request);
    ipcRenderer.on('app:confirmation-request', listener);
    return () => ipcRenderer.removeListener('app:confirmation-request', listener);
  },
  respondToConfirmation: (requestId, confirmed) => ipcRenderer.send('app:confirmation-response', { requestId, confirmed }),
  observeAgent: (options) => ipcRenderer.invoke('browser-shell:agent-observe', options),
  captureAgentPage: (rect) => ipcRenderer.invoke('browser-shell:agent-capture', rect),
  getAgentCapabilities: () => ipcRenderer.invoke('browser-shell:agent-capabilities'),
  executeAgent: (action) => ipcRenderer.invoke('browser-shell:agent-execute', action),
  executeAgentBatch: (actions) => ipcRenderer.invoke('browser-shell:agent-execute-batch', actions),
  getAgentTabs: () => ipcRenderer.invoke('browser-shell:agent-tabs'),
  openAgentTab: (input) => ipcRenderer.invoke('browser-shell:agent-open-tab', input),
  switchAgentTab: (tabId) => ipcRenderer.invoke('browser-shell:agent-switch-tab', tabId),
  closeAgentTab: (tabId) => ipcRenderer.invoke('browser-shell:agent-close-tab', tabId),
  navigateAgent: (input) => ipcRenderer.invoke('browser-shell:agent-navigate', input),
  controlAgentTab: (input) => ipcRenderer.invoke('browser-shell:agent-tab-control', input),
  chatAgent: (input, onRequestId) => {
    const id = requestId('agent-chat');
    try { onRequestId?.(id); } catch { /* Cancellation is best effort. */ }
    return ipcRenderer.invoke('browser-shell:agent-chat', { ...input, requestId: id });
  },
  chatAgentStream: (input, onEvent, onRequestId) => {
    const id = requestId('agent-stream');
    try { onRequestId?.(id); } catch { /* Request cancellation is best effort. */ }
    return new Promise((resolve, reject) => {
      const listener = (_event, payload) => {
        if (!payload || payload.requestId !== id) return;
        if (payload.type === 'delta') {
          try { onEvent?.(payload); } catch { /* Renderer updates should not stop the network stream. */ }
          return;
        }
        ipcRenderer.removeListener('browser-shell:agent-stream', listener);
        if (payload.type === 'error' || payload.type === 'cancelled') {
          const error = new Error(payload.error || (payload.type === 'cancelled' ? 'Agent 已停止' : 'Agent 模型请求失败'));
          if (payload.type === 'cancelled') error.name = 'AbortError';
          reject(error);
        }
        else resolve(payload.result || { ok: false, error: 'Agent 未返回结果' });
      };
      ipcRenderer.on('browser-shell:agent-stream', listener);
      ipcRenderer.send('browser-shell:agent-chat-stream', id, input);
    });
  },
  cancelAgentRequest: (requestId) => {
    const safeRequestId = String(requestId || '').slice(0, 160);
    if (!safeRequestId) return false;
    ipcRenderer.send('browser-shell:agent-request-cancel', safeRequestId);
    return true;
  },
  fetchAgentModels: (input, onRequestId) => {
    const id = requestId('agent-models');
    try { onRequestId?.(id); } catch { /* Cancellation is best effort. */ }
    return ipcRenderer.invoke('browser-shell:agent-models', { ...input, requestId: id });
  },
  jevDecision: (input, onRequestId) => {
    const id = requestId('agent-jev');
    try { onRequestId?.(id); } catch { /* Request cancellation is best effort. */ }
    return ipcRenderer.invoke('browser-shell:jev-decision', { ...input, requestId: id });
  },
  getExtensions: () => ipcRenderer.invoke('browser-shell:get-extensions'),
  getSettings: () => ipcRenderer.invoke('browser-shell:get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('browser-shell:save-settings', settings),
  getBookmarks: () => ipcRenderer.invoke('browser-shell:get-bookmarks'),
  getBookmarkFavicon: (bookmark) => ipcRenderer.invoke('browser-shell:get-bookmark-favicon', bookmark),
  getPageFavicon: (page) => ipcRenderer.invoke('browser-shell:get-page-favicon', page),
  getCommonSites: () => ipcRenderer.invoke('browser-shell:get-common-sites'),
  recordCommonSiteVisit: (url) => ipcRenderer.invoke('browser-shell:record-common-site-visit', url),
  getSearchHistory: () => ipcRenderer.invoke('browser-shell:get-search-history'),
  recordSearchQuery: (query) => ipcRenderer.invoke('browser-shell:record-search-query', query),
  getPasswordSuggestions: (input) => ipcRenderer.invoke('browser-shell:get-password-suggestions', input),
  revealPasswordEntry: (input) => ipcRenderer.invoke('browser-shell:reveal-password', input),
  savePasswordEntry: (input) => ipcRenderer.invoke('browser-shell:save-password', input),
  getDownloads: () => ipcRenderer.invoke('browser-shell:get-downloads'),
  getLocalListeners: () => ipcRenderer.invoke('browser-shell:get-local-listeners'),
  openDownload: (input) => ipcRenderer.invoke('browser-shell:open-download', input),
  cancelDownload: (downloadId) => ipcRenderer.invoke('browser-shell:cancel-download', downloadId),
  clearDownloads: () => ipcRenderer.invoke('browser-shell:clear-downloads'),
  clearBrowsingData: () => ipcRenderer.invoke('browser-shell:clear-browsing-data'),
  stopLocalListener: (input) => ipcRenderer.invoke('browser-shell:stop-local-listener', input),
  chooseAgentFiles: (input) => ipcRenderer.invoke('browser-shell:agent-choose-files', input),
  chooseAgentDirectory: (input) => ipcRenderer.invoke('browser-shell:agent-choose-directory', input),
  listAgentFiles: (input) => ipcRenderer.invoke('browser-shell:agent-list-files', input),
  readAgentFile: (input) => ipcRenderer.invoke('browser-shell:agent-read-file', input),
  uploadAgentFiles: (input) => ipcRenderer.invoke('browser-shell:agent-upload-files', input),
  saveBookmark: (bookmark) => ipcRenderer.invoke('browser-shell:save-bookmark', bookmark),
  createBookmarkFolder: (folder) => ipcRenderer.invoke('browser-shell:create-bookmark-folder', folder),
  updateBookmark: (bookmark) => ipcRenderer.invoke('browser-shell:update-bookmark', bookmark),
  deleteBookmark: (bookmark) => ipcRenderer.invoke('browser-shell:delete-bookmark', bookmark),
  setExtensionEnabled: (payload) => ipcRenderer.invoke('browser-shell:set-extension', payload),
  setExtensionPinned: (payload) => ipcRenderer.invoke('browser-shell:set-extension-pinned', payload),
  openExtensionPanel: (extensionId) => ipcRenderer.invoke('browser-shell:open-extension-panel', extensionId),
  openExtensionManager: (view) => ipcRenderer.invoke('browser-shell:open-manager', view),
  onExtensionsUpdated: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, extensions) => callback(extensions);
    ipcRenderer.on('browser-shell:extensions-updated', listener);
    return () => ipcRenderer.removeListener('browser-shell:extensions-updated', listener);
  },
  onConnectionUpdated: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, details) => callback(details);
    ipcRenderer.on('browser-shell:connection-updated', listener);
    return () => ipcRenderer.removeListener('browser-shell:connection-updated', listener);
  },
  onDownloadsUpdated: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, details) => callback(details);
    ipcRenderer.on('browser-shell:downloads-updated', listener);
    return () => ipcRenderer.removeListener('browser-shell:downloads-updated', listener);
  },
  onSettingsUpdated: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, settings) => callback(settings);
    ipcRenderer.on('browser-shell:settings-updated', listener);
    return () => ipcRenderer.removeListener('browser-shell:settings-updated', listener);
  },
  onBookmarksUpdated: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, details) => callback(details);
    ipcRenderer.on('browser-shell:bookmarks-updated', listener);
    return () => ipcRenderer.removeListener('browser-shell:bookmarks-updated', listener);
  },
  onProfileUpdated: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, details) => callback(details);
    ipcRenderer.on('browser-shell:profile-updated', listener);
    return () => ipcRenderer.removeListener('browser-shell:profile-updated', listener);
  },
  onToggleBookmarkBar: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = () => callback();
    ipcRenderer.on('browser-shell:toggle-bookmark-bar', listener);
    return () => ipcRenderer.removeListener('browser-shell:toggle-bookmark-bar', listener);
  },
  onOpenNewTab: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('browser-shell:open-new-tab', listener);
    return () => ipcRenderer.removeListener('browser-shell:open-new-tab', listener);
  },
  onTeardown: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = () => callback();
    ipcRenderer.on('browser-shell:teardown', listener);
    return () => ipcRenderer.removeListener('browser-shell:teardown', listener);
  },
});
