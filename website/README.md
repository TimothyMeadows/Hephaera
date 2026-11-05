# Documentation website development

The website uses Node.js 24 or newer. With its locked dependencies already installed, run these commands from `website/`:

```text
npm test
npm run build
npm run check
npm run wiki:check
npm run preview -- --help
npm run preview
```

The preview serves only the generated, hash-checked public inventory from `dist/`, on `https://127.0.0.1:4319/Hephaera/`. `SITE_PORT` and `SITE_BASE_PATH` select the port and matching build base path. It expires after 30 minutes or the existing request/byte limits; Ctrl+C closes the listener and its sockets. Build again and restart preview to see changed files.

## Trust the exact local preview

The default preview needs an existing OpenSSL executable. It creates a fresh short-lived P-256 certificate and private key entirely in memory, requires TLS 1.3, and erases its owned private-key buffer at shutdown. It writes no certificate or key files, installs no software, and changes no OS or browser trust store. Missing OpenSSL or invalid TLS inputs stop the preview. See [shared TLS prerequisites](../docs/LOCAL_PREVIEW_TLS.md).

The console prints the HTTPS URL and the public certificate's SHA-256 SPKI pin. A normal browser will reject this untrusted ephemeral certificate. For an existing Chromium browser, launch a separate, owned profile with **only the current printed pin**. For example, from `website/` in PowerShell, replace the executable, pin and URL placeholders:

```powershell
& 'C:\Path\To\Existing\Chromium.exe' `
  "--user-data-dir=$PWD/.test-output/preview-browser" `
  '--ignore-certificate-errors-spki-list=<printed SPKI>' `
  '<printed https URL>'
```

This exception is limited to the exact public key for that preview run; other invalid certificates still fail. Keep the browser's sandbox enabled. Close the isolated browser when finished. Restarting the default preview creates a different key, so close and relaunch the browser with the new pin. The disposable owned profile is under the website's ignored `.test-output/` directory and can be removed after the browser exits.

If you already have a trusted local certificate valid for the IP address `127.0.0.1` and its matching unencrypted PEM key, select them explicitly:

```text
npm run preview -- --cert <certificate.pem> --key <private-key.pem>
```

These inputs must be regular files, with at most 64 KiB for the certificate and 32 KiB for the key. The command reads them into memory and leaves the source files unchanged. Protect the existing key file and keep it outside the public build. Supplying a certificate does not install its issuer or make it trusted; use your existing trust process separately.

Programmatic clients receive only public trust material:

```javascript
import https from 'node:https';
import { startPreview } from './scripts/serve.mjs';

const preview = await startPreview({ port: 0 });
try {
  await new Promise((resolve, reject) => {
    https.get(preview.url, { ca: preview.certificate, agent: false }, response => {
      response.resume();
      response.once('end', resolve);
    }).once('error', reject);
  });
} finally {
  await preview.close();
}
```

`startPreview` also accepts `tls: { cert: Buffer, key: Buffer }` for an explicitly selected identity. The caller retains ownership of those input buffers. The returned `certificate` and `spki` identify the peer; the private key is never returned. Keep certificate and hostname validation enabled; plaintext HTTP and unrelated peers are refused.
