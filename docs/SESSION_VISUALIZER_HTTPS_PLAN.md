# Offline viewer transport: my.hephaera.com over HTTP

This decision replaces the former local HTTPS setup proposal. Source/npm/NuGet installations must work fully offline with existing Node.js 24+/Chromium prerequisites, without administrator access, certificate imports, system trust/hosts/resolver changes, security exceptions or an online issuer. The supported transport is authenticated `http://my.hephaera.com:<port>`.

## HTTPS feasibility

A fresh offline installation has no publicly trusted certificate/private key for this domain. Locally generated certificates need a browser trust change; an online issuer violates offline operation, and cached certificates eventually expire. Bundling a public certificate/private key exposes that key to everyone. [Let's Encrypt documents the shared-key risk](https://letsencrypt.org/docs/certificates-for-localhost/). Certificate import, local roots, mkcert and manual trust are excluded from this distribution profile.

[Cloudflare Flexible](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/flexible/) terminates TLS at its edge; it cannot provide TLS on a browser's direct connection to its own loopback server. No proxy, tunnel or certificate broker is involved. HTTPS would require relaxing a current requirement and is not a pending startup/setup step.

HTTP retains the browser's normal Not secure indication. This domain origin is not a secure context; the viewer uses no secure-context-only APIs. Do not suppress browser warnings, alter HTTPS policy or use security exception flags. Report a browser policy that prohibits HTTP as an availability limitation. [Secure Contexts](https://www.w3.org/TR/secure-contexts/) distinguishes literal loopback/localhost from ordinary HTTP domain names.

## Browser origin and fixed network endpoint

Advertise exactly `http://my.hephaera.com:<port>`, but explicitly bind the server only to IPv4 `127.0.0.1` and verify the actual socket. No hostname, wildcard, LAN or IPv6 binding is allowed. Keep one server per project with an ephemeral unprivileged port; DNS does not select a port. A bare domain without a port and a shared port443 router are outside this design.

Version3 private runtime metadata separates the browser URL from a literal `http://127.0.0.1:<same-port>` connection endpoint. Validate the exact protocol, hostname and matching ports before any health request. Health connects directly to the literal IP with the exact domain Host, without DNS, environment proxies or redirects. Reject forged endpoint pairs, paths, userinfo, alternate domains and non-loopback addresses.

Requests must arrive through IPv4 loopback and carry the exact domain/port Host and, when supplied, Origin. IP/localhost aliases, alternate subdomains, suffix tricks, wrong ports and foreign/null origins are rejected. Preserve bearer authentication, read-only routes, CSP, private storage, evidence confinement, bounded SSE and recording caps.

## Offline resolution without system changes

The user's public DNS already routes the domain to loopback. On 2026-11-12 two recursive resolvers returned A `127.0.0.1` and AAAA `::1`; these dated answers do not select the binding. No DNS record change is needed for the supported launcher.

The isolated Chromium browser receives a process-scoped resolver rule mapping exactly `my.hephaera.com` to `127.0.0.1`, rejecting other DNS names in that dedicated profile and bypassing proxies. This works when public DNS is unavailable, filtered, changed or returns IPv6, without changing OS settings or another browser profile. [Chromium documents resolver mappings](https://github.com/chromium/chromium/blob/main/net/dns/README.md).

The application serves approved local assets and makes no external page requests. Manual access in another browser/profile still depends on its DNS, policy and authentication; offline guarantees apply to the launcher-controlled Chromium instance. Existing Node/Chromium prerequisites remain explicit, with no new dependency, runtime download or certificate setup. Installation/scaffolding still do not launch the viewer.

## Lifecycle and migration

Keep startup bounded and the service detached. Store the per-run capability in the protected bootstrap fragment and selected origin's session storage, never process arguments, query strings, logs or redirects. OS-account permissions remain the local security boundary. ESET exemptions are not prerequisites, and Hephaera changes no scanner settings.

Stop the owned viewer before baseline updates, acquire the maintenance write lease and reopen the same session UUID. Version2 literal-HTTP and version1 legacy-HTTPS records remain accepted only for validated owned probe/shutdown. New startup requires version3. Preserve event files, replay, recorded Goal state, approvals, fences and cache location. Open a fresh authenticated bootstrap for the new origin; old IP-origin storage is not transferred.

## Verification and delivery

Reproduce alias rejection, then require the exact hostname to succeed while wrong Host/Origin/port combinations fail. Measure the IPv4-only socket and LAN/IPv6 refusal. Prove health works with DNS disabled and proxy settings poisoned. Reject invalid endpoint pairs before a credentialed connection.

Capture production browser arguments and exercise native Chromium with the exact hostname mapped locally and all other DNS names unavailable. Verify the actual peer is `127.0.0.1`, the rendered domain uses HTTP, the context remains ordinary insecure HTTP, and no certificate/security exceptions appear. Retain live activity, replay, refresh/reconnect, accessibility, concurrency, background continuation and the 10000-event freshness test.

Run native Windows/Linux/macOS verification before claiming each platform result. Preserve history through a real instrumented migration. Package publication is separate from this change. Earlier HTTPS evidence remains historical; the former trust-store proposal is superseded, not an optional installation requirement.
