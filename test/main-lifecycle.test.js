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
  assert.match(saveConfigBody, /connectionMode:/);
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

test('core startup checks for an exit race before and after browser launch', () => {
  const launchBody = functionBody(mainSource, 'async function launchProfileInternal(profileId, options = {})', 'async function launchProfile(profileId, options = {})');
  assert.match(launchBody, /runtime\.exited\s*=\s*true/);
  assert.match(launchBody, /isCoreRuntimeAlive\(coreRuntimeRecord\)/);
  assert.match(launchBody, /代理核心启动后立即退出/);
  assert.match(launchBody, /代理核心在浏览器启动期间退出/);
  assert.match(launchBody, /childHasExited\(external\)/);
  assert.match(launchBody, /scheduleRuntimeCleanup\(profileId\)/);
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
  const externalBody = functionBody(mainSource, 'async function launchWithExternalEngine(profile, node, enginePath)', 'function createProfileLaunchConfirmation(');
  assert.match(externalBody, /externalProcesses\.get\(profile\.id\) !== child/);
  assert.match(externalBody, /const isCurrent = externalProcesses\.get\(profile\.id\) === child/);
});

test('profile launch compares the current public IP before creating a browser and saves it only after success', () => {
  const launchBody = functionBody(mainSource, 'async function launchProfileInternal(profileId, options = {})', 'async function launchProfile(profileId, options = {})');
  assert.ok(launchBody.indexOf('await checkProfileConnection(profileId)') < launchBody.indexOf('validateEnginePath(state.settings.enginePath)'));
  assert.match(launchBody, /const previousIp = publicExitIp\(profile\.lastLaunchIp\)/);
  assert.match(launchBody, /createProfileLaunchConfirmation\(profile, previousIp, launchIp\)/);
  assert.match(launchBody, /if \(launchIp\) item\.lastLaunchIp = launchIp/);
  assert.match(mainSource, /lastLaunchIp: publicExitIp\(current\.lastLaunchIp \|\| existingProfile\?\.lastLaunchIp\)/);
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
