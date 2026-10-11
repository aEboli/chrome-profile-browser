const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const mainSource = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'main', 'main.js'),
  'utf8',
);
const rendererSource = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'renderer', 'renderer.js'),
  'utf8',
);
const preloadSource = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'main', 'preload.js'),
  'utf8',
);

function functionBody(source, declaration, nextDeclaration) {
  const start = source.indexOf(declaration);
  assert.notEqual(start, -1, `missing ${declaration}`);
  const end = source.indexOf(nextDeclaration, start + declaration.length);
  assert.notEqual(end, -1, `missing ${nextDeclaration}`);
  return source.slice(start, end);
}

test('single-instance lock shares a stable directory without replacing profile data paths', () => {
  const lockStart = mainSource.indexOf('const originalUserDataPath = app.getPath(\'userData\');');
  const lockCall = mainSource.indexOf('app.requestSingleInstanceLock({', lockStart);
  const restorePath = mainSource.indexOf('app.setPath(\'userData\', originalUserDataPath);', lockCall);
  assert.notEqual(lockStart, -1);
  assert.ok(lockCall > lockStart);
  assert.ok(restorePath > lockCall);
  assert.match(mainSource.slice(lockStart, restorePath), /path\.join\(app\.getPath\('appData'\), SINGLE_INSTANCE_APP_ID\)/);
  assert.match(mainSource, /app\.on\('second-instance', handleSecondInstance\)/);
  const secondInstanceBody = functionBody(mainSource, 'function handleSecondInstance(', 'function id(');
  assert.match(secondInstanceBody, /showManagerWindow\(\)/);
  assert.match(secondInstanceBody, /pendingSecondInstance = true/);
});

test('relaunching an active profile restores and focuses its existing window', () => {
  const launchBody = functionBody(mainSource, 'async function launchProfileInternal(profileId, options = {})', 'async function launchProfile(profileId, options = {})');
  const activeBranch = launchBody.slice(launchBody.indexOf('if (isProfileRunning(profileId))'));
  assert.match(activeBranch, /existing\.isMinimized\(\)\) existing\.restore\(\)/);
  assert.match(activeBranch, /existing\.show\(\)/);
  assert.match(activeBranch, /existing\.focus\(\)/);
  assert.match(activeBranch, /return \{ mode: 'existing', profileId \}/);
});

test('running profiles accept name and startup URL edits while protecting runtime configuration', () => {
  const saveConfigBody = functionBody(mainSource, 'function profileSaveConfig(', 'function proxyForNode(');
  assert.match(saveConfigBody, /connectionMode,/);
  assert.match(saveConfigBody, /nodeId:/);
  assert.match(saveConfigBody, /note:/);
  assert.match(saveConfigBody, /color:/);
  assert.match(saveConfigBody, /bookmarks:/);
  assert.match(saveConfigBody, /testIdentityId:/);
  assert.match(saveConfigBody, /testIdentityOrigins:/);

  const saveBody = functionBody(mainSource, "handle('profile:save'", "handle('profile:delete'");
  assert.match(saveBody, /profileLaunches\.has\(existing\.id\)/);
  assert.match(saveBody, /profileStops\.has\(existing\.id\)/);
  assert.match(saveBody, /running && profileSaveNeedsStopped\(existing, nextProfile\)/);
  assert.match(saveBody, /if \(running\) sendBrowserProfileDetails\(nextProfile\)/);
  assert.doesNotMatch(saveBody, /if \(existing && isProfileRunning\(existing\.id\)\)/);

  const electronLaunchBody = functionBody(mainSource, 'async function launchWithElectron(', 'async function launchWithExternalEngine(');
  assert.match(electronLaunchBody, /const latestProfile = store\.get\(\)\.profiles\.find/);
  assert.match(electronLaunchBody, /profile\.name = latestProfile\.name/);
  assert.match(electronLaunchBody, /profile\.startUrl = ensureUrl\(latestProfile\.startUrl/);

  const launchBody = functionBody(mainSource, 'async function launchProfileInternal(profileId, options = {})', 'async function launchProfile(profileId, options = {})');
  assert.match(launchBody, /runtimeProfile\.name = latestProfile\.name/);
  assert.match(launchBody, /runtimeProfile\.startUrl = ensureUrl\(latestProfile\.startUrl/);
});

test('subscription connection mode persists its source and resolves a route only inside that source', () => {
  const normalizer = functionBody(mainSource, 'function normalizeProfile(', 'function profileSaveConfig(');
  assert.match(normalizer, /\['node', 'subscription'\]\.includes\(current\.connectionMode\)/);
  assert.match(normalizer, /subscriptionId = connectionMode === 'subscription' \? safeText\(current\.subscriptionId\)/);
  assert.match(normalizer, /state\.subscriptions\.some\(\(item\) => item\.id === subscriptionId\)/);
  assert.match(normalizer, /node\.sourceId === subscriptionId/);

  const saveConfig = functionBody(mainSource, 'function profileSaveConfig(', 'function proxyForNode(');
  assert.match(saveConfig, /subscriptionId: connectionMode === 'subscription' \? safeText\(profile\?\.subscriptionId\) : null/);

  const routeSelector = functionBody(mainSource, 'async function checkSubscriptionRoutes(', 'function notifyProfileAutoFailover(');
  assert.match(routeSelector, /supportedSubscriptionNodes\(nodes, idValue, excluded\)/);
  assert.match(routeSelector, /nodes\.find\(\(node\) => node\.id === candidate\.id\)\?\.sourceId === idValue/);
  assert.match(routeSelector, /checkNodeConnections\(candidates\.map\(\(node\) => node\.id\), SUBSCRIPTION_ROUTE_CHECK_CONCURRENCY\)/);
  assert.match(mainSource, /const CONNECTION_CHECK_BATCH_CONCURRENCY = 3;/);
  assert.match(mainSource, /const SUBSCRIPTION_ROUTE_CHECK_CONCURRENCY = 10;/);
  assert.match(mainSource, /async function checkNodeConnections\(nodeIds, concurrency = CONNECTION_CHECK_BATCH_CONCURRENCY\)/);
  assert.match(routeSelector, /rankSubscriptionRoutes\(store\.get\(\)\.nodes, idValue, results, excluded\)/);
  assert.match(mainSource, /function autoFailoverProfile\(profileId, failedNodeId\)/);
  assert.match(mainSource, /handle\('profile:switch-subscription'/);
});

test('subscription automatic failover never falls back to direct or another subscription', () => {
  const failover = functionBody(mainSource, 'async function autoFailoverProfile(', 'async function autoFailoverProfilesForNode(');
  assert.match(failover, /profile\.connectionMode !== 'subscription'/);
  assert.match(failover, /checkSubscriptionRoutes\(subscriptionId, initialNodeId \? \[initialNodeId\] : \[\]\)/);
  assert.match(failover, /switchProfileSubscriptionRoute\(profileKey, subscriptionId, initialNodeId, route\)/);
  assert.doesNotMatch(failover, /stopProfile\(|launchProfile\(/);
  assert.match(failover, /notifyProfileAutoFailover\(profileKey, 'unavailable'/);
  assert.doesNotMatch(failover, /expectedNodeId/);
  assert.doesNotMatch(failover, /connectionMode = 'direct'/);
});

test('subscription auto failover retargets a stable loopback proxy without reloading either browser engine', () => {
  const switcher = functionBody(mainSource, 'async function switchProfileSubscriptionRoute(', 'async function autoFailoverProfile(');
  assert.match(switcher, /profileProxyRouters\.get\(profileId\)/);
  assert.match(switcher, /router\.setRoute\(nextRoute\)/);
  assert.match(switcher, /router\.retireCoreRuntime\(previousCoreRuntime\)/);
  assert.doesNotMatch(switcher, /stopProfile\(|launchProfile\(|closeAllConnections\(|reload\(/);

  const electronLaunch = functionBody(mainSource, 'async function launchWithElectron(', 'async function launchWithExternalEngine(');
  const externalLaunch = functionBody(mainSource, 'async function launchWithExternalEngine(', 'function createProfileLaunchConfirmation(');
  assert.match(electronLaunch, /proxyRouter\.proxyUrl/);
  assert.match(externalLaunch, /proxyRouter\?\.proxyUrl/);
  assert.match(mainSource, /host: '127\.0\.0\.1',[\s\S]*?createProfileProxyRouter/);
  const launchBody = functionBody(mainSource, 'async function launchProfileInternal(profileId, options = {})', 'async function launchProfile(profileId, options = {})');
  assert.match(launchBody, /if \(runtimeProfile\.connectionMode === 'subscription'\s*\|\|\s*\(engineMode === 'external' && node && \(node\.username \|\| node\.password\)\)\)\s*\{\s*profileProxyRouter = await createProfileProxyRouterForProfile/);
});

test('subscription node refresh and deletion preserve or clear automatic mode at the correct lifecycle boundary', () => {
  const refresh = functionBody(mainSource, 'async function importSubscription(payload)', 'function renameSubscription(');
  assert.match(refresh, /profile\.connectionMode === 'subscription' && profile\.subscriptionId === sourceId/);
  assert.match(refresh, /if \(!isProfileRunning\(profile\.id\)\) profile\.nodeId = null/);

  const deleteNode = functionBody(mainSource, "handle('node:delete'", "handle('node:check'");
  assert.match(deleteNode, /profile\.connectionMode === 'subscription' && subscriptionIds\.has\(profile\.subscriptionId\)/);
  assert.match(deleteNode, /return \{ \.\.\.profile, nodeId: null \}/);
  assert.match(deleteNode, /connectionMode: 'direct', nodeId: null, subscriptionId: null/);
});

test('core startup checks for an exit race before and after browser launch', () => {
  const launchBody = functionBody(mainSource, 'async function launchProfileInternal(profileId, options = {})', 'async function launchProfile(profileId, options = {})');
  const coreTrackingBody = functionBody(mainSource, 'function trackProfileCoreRuntime(', 'function scheduleRuntimeCleanup(');
  assert.match(coreTrackingBody, /runtime\.exited\s*=\s*true/);
  assert.match(coreTrackingBody, /autoFailoverProfile\(profileId, runtime\.nodeId \|\| profile\.nodeId\)/);
  assert.match(launchBody, /isCoreRuntimeAlive\(coreRuntimeRecord\)/);
  assert.match(launchBody, /代理核心启动后立即退出/);
  assert.match(launchBody, /代理核心在浏览器启动期间退出/);
  assert.match(launchBody, /childHasExited\(external\)/);
  assert.match(coreTrackingBody, /scheduleRuntimeCleanup\(profileId\)/);
  assert.match(mainSource, /function profileRequiresCore\(profileId\)/);
});

test('stop and failed-launch cleanup preserve resources when a child does not exit', () => {
  const stopBody = functionBody(mainSource, 'async function stopProfile(profileId)', 'async function switchProfileNode(profileId, nodeId)');
  const launchBody = functionBody(mainSource, 'async function launchProfileInternal(profileId, options = {})', 'async function launchProfile(profileId, options = {})');
  assert.match(stopBody, /stopTrackedExternalProcess\(profileId\)/);
  assert.match(stopBody, /stopTrackedCoreProcess\(profileId\)/);
  assert.match(stopBody, /外部 Chromium 未能及时退出/);
  assert.match(stopBody, /代理核心未能及时退出/);
  assert.match(launchBody, /await stopTrackedExternalProcess\(profileId\)/);
  assert.match(launchBody, /await stopTrackedCoreProcess\(profileId\)/);
  assert.match(mainSource, /if \(!exited\) return false;/);
  assert.match(mainSource, /function scheduleRuntimeCleanup\(profileId\)/);
  assert.match(mainSource, /profileLaunches\.has\(profileId\)/);
});

test('application quit removes core config only after the child exits', () => {
  const quitBody = functionBody(mainSource, "app.on('before-quit'", "app.on('window-all-closed'");
  assert.match(quitBody, /waitForChildExit\(runtime\.child\)\.then\(\(exited\) =>/);
  assert.match(quitBody, /if \(exited\) cleanupRuntime\(runtime\)/);
});

test('late external child events cannot remove a replacement process record', () => {
  const externalBody = functionBody(mainSource, 'async function launchWithExternalEngine(profile, node, enginePath, proxyRouter = null)', 'function createProfileLaunchConfirmation(');
  assert.match(externalBody, /externalProcesses\.get\(profile\.id\) !== child/);
  assert.match(externalBody, /const isCurrent = externalProcesses\.get\(profile\.id\) === child/);
});

test('profile launch compares the current public IP before creating a browser and saves it only after success', () => {
  const launchBody = functionBody(mainSource, 'async function launchProfileInternal(profileId, options = {})', 'async function launchProfile(profileId, options = {})');
  assert.ok(launchBody.indexOf('await checkProfileConnection(profileId)') < launchBody.indexOf('resolveExternalEnginePath(state.settings.enginePath)'));
  assert.match(launchBody, /const previousIp = publicExitIp\(profile\.lastLaunchIp\)/);
  assert.match(launchBody, /createProfileLaunchConfirmation\(profile, previousIp, launchIp\)/);
  assert.match(launchBody, /shouldConfirmProfileLaunchIpChange\(profile, options, previousIp, launchIp\)/);
  assert.match(launchBody, /if \(launchIp\) item\.lastLaunchIp = launchIp/);
  assert.match(mainSource, /lastLaunchIp: publicExitIp\(current\.lastLaunchIp \|\| existingProfile\?\.lastLaunchIp\)/);
});

test('saved engine mode controls launch while preserving external paths', () => {
  const launchBody = functionBody(mainSource, 'async function launchProfileInternal(profileId, options = {})', 'async function launchProfile(profileId, options = {})');
  assert.match(launchBody, /const engineMode = profile\.engineMode === 'external' \? 'external' : 'electron'/);
  assert.match(launchBody, /const enginePath = engineMode === 'external' \? resolveExternalEnginePath\(state\.settings\.enginePath\) : ''/);
  assert.match(launchBody, /if \(engineMode === 'external'\) \{\s*result = await launchWithExternalEngine/);
  assert.match(launchBody, /if \(engineMode === 'external'\) \{\s*const external = externalProcesses\.get/);

  const profileBody = functionBody(mainSource, 'function normalizeProfile(', 'function profileSaveConfig(');
  assert.match(profileBody, /const requestedEngineMode = current\.engineMode === undefined/);
  assert.match(profileBody, /requestedEngineMode === 'external' && !resolveExternalEnginePath\(state\.settings\.enginePath\)/);
  const saveConfigBody = functionBody(mainSource, 'function profileSaveConfig(', 'function profileSaveNeedsStopped(');
  assert.match(saveConfigBody, /engineMode: profile\?\.engineMode/);

  const saveBody = functionBody(mainSource, 'async function saveApplicationSettings(input, sender)', 'const AGENT_PROFILE_SETTING_KEYS');
  assert.match(saveBody, /const nextEngineMode = settings\.engineMode === undefined/);
  assert.match(saveBody, /if \(requestedEnginePath && \(enginePathChanged \|\| nextEngineMode === 'external'\)\)\s*\{\s*nextEnginePath = validateEnginePath\(requestedEnginePath\)/);
  assert.match(saveBody, /nextEngineMode === 'external' && !resolveExternalEnginePath\(requestedEnginePath\)/);
  assert.match(saveBody, /if \(enginePathChanged\s*&& currentState\.profiles\.some/);
  assert.doesNotMatch(saveBody, /nextEngineMode !== currentEngineMode \|\| enginePathChanged/);
  assert.match(saveBody, /next\.settings\.engineMode = nextEngineMode/);
  assert.match(mainSource, /next\.settings\.engineMode = 'external';[\s\S]*?next\.settings\.enginePath = installed\.path/);
});

test('launchpad engine switching only changes a stopped profile engine mode', () => {
  const handlerBody = functionBody(mainSource, "handle('profile:set-engine-mode'", "handle('profile:save'");
  assert.match(handlerBody, /safeProfileId\(payload\.profileId\)/);
  assert.match(handlerBody, /engineMode !== 'electron' && engineMode !== 'external'/);
  assert.match(handlerBody, /isProfileRunning\(profileId\) \|\| profileLaunches\.has\(profileId\) \|\| profileStops\.has\(profileId\)/);
  assert.match(handlerBody, /engineMode === 'external' && !resolveExternalEnginePath\(currentState\.settings\.enginePath\)/);
  assert.match(handlerBody, /current\.engineMode = engineMode/);
  assert.match(handlerBody, /broadcastState\(\)/);
  assert.doesNotMatch(handlerBody, /launchProfile\(|stopProfile\(|current\.(?:connectionMode|nodeId|note)\s*=/);
  assert.match(preloadSource, /setProfileEngineMode: \(payload\) => invoke\('profile:set-engine-mode', payload\)/);
});

test('profile edits preserve private new-tab and search history without exposing it in public state', () => {
  const normalizer = functionBody(mainSource, 'function normalizeProfile(', 'function profileSaveConfig(');
  const publicState = functionBody(mainSource, 'function publicState()', 'function publicSubscription(');
  assert.match(normalizer, /newTabSiteVisits: normalizeSiteVisits\(existingProfile\?\.newTabSiteVisits\)/);
  assert.match(normalizer, /searchHistory: normalizeSearchHistory\(existingProfile\?\.searchHistory\)/);
  assert.match(publicState, /newTabSiteVisits: _newTabSiteVisits,[\s\S]*searchHistory: _searchHistory,[\s\S]*\.\.\.publicProfile/);
  assert.match(mainSource, /profile\.newTabSiteVisits = \[\]/);
  assert.match(mainSource, /profile\.searchHistory = \[\]/);
});

test('profile launch confirmations are one-time, time-limited and bound to the selected connection', () => {
  const confirmationBody = functionBody(mainSource, 'async function resolveProfileLaunchConfirmation(', 'async function detachProfileWindow(');
  assert.match(confirmationBody, /challenge\.confirmationToken !== safeText\(confirmationToken\)/);
  assert.match(confirmationBody, /PROFILE_LAUNCH_CONFIRMATION_TTL_MS/);
  assert.match(confirmationBody, /profile\.nodeId\) !== challenge\.nodeId/);
  assert.match(confirmationBody, /if \(!confirmed\) return \{ profileId: profileKey, cancelled: true \}/);
  assert.match(confirmationBody, /ipChecked: true, checkedIp: challenge\.currentIp/);
  assert.match(mainSource, /profile:resolve-launch-confirmation/);

  const rendererBody = functionBody(rendererSource, 'async function resolveProfileLaunchConfirmation(', 'async function requestProfileLaunch(');
  assert.match(rendererBody, /confirmation\.currentIp/);
  assert.match(rendererBody, /confirmation\.previousIp/);
  assert.match(rendererBody, /requestConfirmation\(/);
  assert.match(rendererBody, /confirmLabel:/);
  assert.match(rendererBody, /confirmed,/);
});

test('manager window is available from the tray and reports running browsers', () => {
  assert.match(mainSource, /\bTray,\n/);
  assert.match(mainSource, /function createTray\(\)/);
  assert.match(mainSource, /label: '展开配置中心'/);
  assert.match(mainSource, /label: '退出'/);
  assert.match(mainSource, /tray\.on\('double-click', showManagerWindow\)/);
  assert.match(mainSource, /正在运行的浏览器：\$\{names\.length\} 个/);
  const launchBody = functionBody(mainSource, 'async function launchProfileInternal(profileId, options = {})', 'async function launchProfile(profileId, options = {})');
  assert.match(launchBody, /hideManagerWindowToTray\(\)/);
  assert.match(launchBody, /return result;/);
});

test('manager window reopens after the last browser stops', () => {
  const broadcastBody = functionBody(mainSource, 'function broadcastState()', 'function resetInterruptedNodeChecks()');
  assert.match(broadcastBody, /const runningCount = runningProfiles\(\)\.length/);
  assert.match(broadcastBody, /previousRunningProfileCount > 0 && runningCount === 0/);
  assert.match(broadcastBody, /if \(allProfilesStopped\) showManagerWindow\(\)/);
  assert.match(broadcastBody, /previousRunningProfileCount = runningCount/);
});

test('closing or minimizing the manager hides it without stopping the app', () => {
  const managerBody = functionBody(mainSource, 'function createManagerWindow()', 'app.whenReady().then');
  assert.match(managerBody, /show:\s*false/);
  assert.match(managerBody, /mainWindow\.once\('ready-to-show', \(\) =>/);
  assert.match(managerBody, /mainWindow\.on\('minimize'/);
  assert.match(managerBody, /mainWindow\.on\('close'/);
  assert.match(managerBody, /event\.preventDefault\(\);/);
  assert.doesNotMatch(managerBody, /app\.quit\(\)/);
});
