'use strict';
// Read-only native registration diagnostic; never opens or changes a browser.
const helper = require('../commands/lib/session-default-browser.cjs');
helper.resolveBrowser(process.cwd()).then(plan => {
  console.log(JSON.stringify({ status: 'registration-resolved', platform: process.platform, provider: plan.provider,
    scope: 'Native HTTP registration query only; interactive navigation remains unverified.' }));
}).catch(() => {
  console.log(JSON.stringify({ status: 'registration-unavailable', platform: process.platform,
    scope: 'No registration or desktop session is assumed on a headless runner.' }));
});
