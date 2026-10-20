# Reign Services Oracle launch

Build the Docker image without database credentials. Run the migration service separately with the database owner role, then start the app using the restricted runtime role. Runtime secrets live outside Git under /etc/txl/apps.

The first launch uses an isolated, initially empty reign_services database. It does not restore prior Replit or DigitalOcean records. The existing main domain is not changed.

The preview is served over HTTPS at https://reign.209-74-71-35.sslip.io through Starlight Caddy and an automatically restarted SSH tunnel to Oracle localhost:5000. Both hosts are required. Direct Oracle ingress and the final domain remain a later cutover.

Production secrets: DATABASE_URL; initial ROOT_EMAIL/ROOT_PASSWORD for one-time bootstrap. Optional integrations: OPENAI_API_KEY/OPENAI_BASE_URL (or existing Replit AI variables), RESEND_API_KEY/RESEND_FROM_EMAIL. AI and mail have not been configured or end-to-end validated.

Admin credentials are kept in a root-only file /etc/txl/apps/reign-services-owner.json and copied to the root-only Starlight secrets directory. Do not commit credentials. Remove ROOT_PASSWORD from the runtime environment after the first successful seed.

Before public marketing: transfer owner access to Bitwarden, confirm contact/brand details and real lead notification delivery, configure the final domain, complete billing if applicable, and review abuse controls.

The legacy startup deletion routine has been removed. API logging excludes response bodies.

## DNS cutover

Spaceship nameservers are launch1.spaceship.net and launch2.spaceship.net. Change the apex A record from 8.228.239.83 to 209.74.71.35 (Starlight ingress), TTL 300 seconds. Add www CNAME getreignservices.com, TTL 300. Preserve verification TXT and mail records. No AAAA record should point elsewhere for these hosts.

The Oracle app private endpoint is reached through the supervised SSH tunnel. Do not point the domain directly at Oracle 129.153.109.242 until its ingress and TLS are configured and verified.

DNS was not changed during initial preparation because the Spaceship browser session required a new login.

## Verified initial launch

The ARM64 Docker production build and npm run check passed. HTTPS preview returned 200 and the database health endpoint returned 200. Playwright at 1440x1000 and 390x844 verified meaningful home content without a framework overlay or horizontal mobile overflow. The home assessment link opened the contact form; a synthetic request returned 201 and rendered the confirmation. Authenticated retrieval confirmed persistence. Anonymous lead retrieval returned 401. Owner login used a Secure, HttpOnly, SameSite=Lax cookie; admin rendered and logout invalidated the session. The synthetic lead was removed after validation.

Database role checks confirmed the Reign runtime role can connect to its own database and cannot connect to clinical_massage or platform_control. ROOT_PASSWORD was removed from the application environment after seeding; owner access remains stored privately. Historical application records were not imported. AI and email delivery remain unconfigured.

Screenshots and temporary smoke scripts are outside the repository under /opt/txl/logs.
