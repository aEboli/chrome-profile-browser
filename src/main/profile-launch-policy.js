'use strict';

function shouldConfirmProfileLaunchIpChange(profile, options = {}, previousIp, currentIp) {
  return profile?.connectionMode !== 'subscription'
    && options.automaticFailover !== true
    && Boolean(previousIp && currentIp && previousIp !== currentIp);
}

module.exports = { shouldConfirmProfileLaunchIpChange };
