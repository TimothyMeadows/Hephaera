# HTTPS for local previews

The documentation preview and CODE character evidence host use HTTPS on `127.0.0.1`. Each run creates a new one-day P-256 certificate for that IP. TLS 1.3 is required. A run never falls back to HTTP.

The shared implementation is `commands/lib/local-preview-tls.cjs`. It uses an existing OpenSSL executable outside the project. On Windows it checks Git's bundled OpenSSL first; other hosts use their installed `openssl`. `HEPHAERA_OPENSSL` can select an absolute installed executable. An invalid explicit selection fails rather than silently selecting another executable. Nothing is downloaded or installed.

OpenSSL sends both the generated private key and certificate through a bounded private process pipe. Keys are never written to a file, command argument, report or trust store. The tool keeps the private PEM in memory while its server is active, then clears its owned PEM buffer. This is normal process memory ownership, not a guarantee that the operating system or cryptographic library erased every internal copy.

## Opening the website preview

Run `npm --prefix website run build`, then `npm --prefix website run preview`. The command prints the HTTPS URL and the certificate's SPKI SHA-256 pin. A normal browser does not trust this newly generated self-signed identity automatically.

Use the instructions printed by the preview for an existing Chromium browser with a separate temporary profile and that exact pin, or supply an already trusted local certificate/key pair using the preview's `--cert` and `--key` options. The certificate must identify `127.0.0.1`, match its key and be currently valid. See [the website development guide](../website/README.md) for the concrete command.

Only the per-run public SPKI pin is a browser argument. Never use a global certificate-error bypass, change browser sandbox settings or install a certificate into an operating-system trust store as part of preview startup. A different run has a different pin. Close the owned browser/profile when finished.

## Automated evidence and clients

CODE capture passes the exact run's pin to its sandboxed Chromium instance. Playwright owns that browser's temporary profile; the evidence workflow owns its listener, connections, snapshots and cancellation. External requests remain blocked. Certificate pinning does not approve untrusted adapter code or certify visual/model quality.

Node clients receive the public certificate and use it as their explicit CA with ordinary hostname and date validation. Tests reject an unknown certificate, a wrong peer, plaintext and older TLS versions. No `rejectUnauthorized: false`, global TLS environment override or unrestricted certificate-error switch is used.

The existing module inventories, private-state exclusions, Host/method checks, finite resource limits and capture provenance checks still apply. HTTPS adds transport protection; it does not replace those boundaries or provide an operating-system sandbox against another privileged local process.

## References

- [Node 24 HTTPS API](https://nodejs.org/download/release/v24.15.0/docs/api/https.html)
- [Node 24 crypto and X.509 API](https://nodejs.org/download/release/v24.15.0/docs/api/crypto.html)
- [OpenSSL certificate request and generation command](https://docs.openssl.org/3.5/man1/openssl-req/)
