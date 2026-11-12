# Local viewer transport: my.hephaera.com over HTTP

This decision replaces the former local HTTPS setup proposal. The supported transport is authenticated `http://my.hephaera.com:<port>`, with existing Node.js24+ and the user's registered default HTTP browser. No administrator access, certificate imports, system trust/hosts/resolver changes, security exceptions or online issuer are needed. Recording and the service work offline. The later request to open the normal browser supersedes the isolated Chromium offline-name guarantee; first-use browser access depends on working or cached DNS.

## HTTPS feasibility

A fresh offline installation has no publicly trusted certificate/private key for this domain. Locally generated certificates need a browser trust change; an online issuer violates offline operation, and cached certificates eventually expire. Bundling a public certificate/private key exposes that key to everyone. [Let's Encrypt documents the shared-key risk](https://letsencrypt.org/docs/certificates-for-localhost/). Certificate import, local roots, mkcert and manual trust are excluded from this distribution profile.

[Cloudflare Flexible](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/flexible/) terminates TLS at its edge; it cannot provide TLS on a browser's direct connection to its own loopback server. No proxy, tunnel or certificate broker is involved. HTTPS would require relaxing a current requirement and is not a pending startup/setup step.

HTTP retains the browser's normal Not secure indication. This domain origin is not a secure context; the viewer uses no secure-context-only APIs. Do not suppress browser warnings, alter HTTPS policy or use security exception flags. Report a browser policy that prohibits HTTP as an availability limitation. [Secure Contexts](https://www.w3.org/TR/secure-contexts/) distinguishes literal loopback/localhost from ordinary HTTP domain names.

## Browser origin and fixed network endpoint

Advertise exactly `http://my.hephaera.com:<port>`, but explicitly bind the server only to IPv4 `127.0.0.1` and verify the actual socket. No hostname, wildcard, LAN or IPv6 binding is allowed. Keep one server per project with an ephemeral unprivileged port; DNS does not select a port. A bare domain without a port and a shared port443 router are outside this design.

Version3 private runtime metadata separates the browser URL from a literal `http://127.0.0.1:<same-port>` connection endpoint. Validate the exact protocol, hostname and matching ports before any health request. Health connects directly to the literal IP with the exact domain Host, without DNS, environment proxies or redirects. Reject forged endpoint pairs, paths, userinfo, alternate domains and non-loopback addresses.

Requests must arrive through IPv4 loopback and carry the exact domain/port Host and, when supplied, Origin. IP/localhost aliases, alternate subdomains, suffix tricks, wrong ports and foreign/null origins are rejected. Preserve bearer authentication, read-only routes, CSP, private storage, evidence confinement, bounded SSE and recording caps.

## Normal browser resolution without system changes

The user's public DNS already routes the domain to loopback. On 2026-11-12 two recursive resolvers returned A `127.0.0.1` and AAAA `::1`; these dated answers do not select the binding. Startup performs a bounded system DNS check requiring `127.0.0.1`, allowing optional `::1` and rejecting public/mixed addresses before opening. No DNS record change is included.

Production opens the registered default HTTP browser with its normal profile, DNS, proxy, extensions and policies. There are no private-profile, resolver, proxy or security flags. The system check is a diagnostic guard, not a pin on a browser's independent resolver/proxy. Normal browser policy must allow the domain's local HTTP connection. If it cannot, report the limitation while work and recording continue. Hephaera does not change browser settings or suppress warnings.

The application serves approved local assets and makes no external page requests; the user's normal browser may make its own network requests. Browser registration is read using existing Windows PowerShell, macOS NSWorkspace/JXA or Linux desktop tools, with a protected file handoff to keep the capability out of argv. No runtime download, dependency installation or certificate setup occurs. Installation/scaffolding still do not launch the viewer. Isolated Chromium and resolver mappings remain only in the controlled automated QA harness.

## Lifecycle and migration

Keep startup bounded and the service detached. Store the per-run capability in the protected bootstrap fragment and selected origin's session storage, never process arguments, query strings, logs or redirects. OS-account permissions remain the local security boundary. ESET exemptions are not prerequisites, and Hephaera changes no scanner settings.

The user's normal browser is never owned or killed by the viewer. Stop removes only the service's unchanged bootstrap files, closes its server and preserves all history, including historical managed profiles. A service restart opens a new authenticated tab; old disconnected tabs belong to the user.

Stop the owned viewer before baseline updates, acquire the maintenance write lease and reopen the same session UUID. Version2 literal-HTTP and version1 legacy-HTTPS records remain accepted only for validated owned probe/shutdown. New startup requires version3. Preserve event files, replay, recorded Goal state, approvals, fences and cache location. Open a fresh authenticated bootstrap for the new origin; old IP-origin storage is not transferred.

## Verification and delivery

Reproduce alias rejection, then require the exact hostname to succeed while wrong Host/Origin/port combinations fail. Measure the IPv4-only socket and LAN/IPv6 refusal. Prove health works with DNS disabled and proxy settings poisoned. Reject invalid endpoint pairs before a credentialed connection.

Capture production handoff arguments, default HTTP registration selection, DNS failures, bounded opening, repeat-start reuse and no browser termination on stop. Test unavailable browser/default tools without changing command results. Separately exercise controlled native Chromium with QA-only resolver mapping: verify the actual peer is `127.0.0.1`, domain HTTP, ordinary insecure context and absence of security exceptions. Retain live activity, replay, refresh/reconnect, accessibility, concurrency, background continuation and the10000-event freshness test. Headless Chromium evidence is not a test of a user's normal Firefox/Safari profile.

Run native Windows/Linux/macOS verification before claiming each platform result. Preserve history through a real instrumented migration. Package publication is separate from this change. Earlier HTTPS evidence remains historical; the former trust-store proposal is superseded, not an optional installation requirement.
