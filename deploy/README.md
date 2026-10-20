# Reign Services Oracle launch

Reign Services is live at https://getreignservices.com. The www hostname redirects to the apex over HTTPS. The secondary preview remains at https://reign.209-74-71-35.sslip.io with a noindex header.

Build the Docker image without database credentials. Run the migration service separately with the database owner role, then start the app using the restricted runtime role. Runtime secrets live outside Git under /etc/txl/apps.

The first launch uses an isolated, initially empty reign_services database. It does not restore prior Replit or DigitalOcean records. Historical application records have not been imported.

Starlight Caddy terminates HTTPS and forwards through a supervised SSH tunnel to Oracle localhost:5000. Both hosts are required. Direct Oracle public ingress remains unconfigured.

Production secrets: DATABASE_URL. ROOT_EMAIL/ROOT_PASSWORD seed the owner only during bootstrap; ROOT_PASSWORD was removed from the application environment afterward. Optional integrations: OPENAI_API_KEY/OPENAI_BASE_URL (or existing Replit AI variables), RESEND_API_KEY/RESEND_FROM_EMAIL. AI and mail have not been configured or end-to-end validated.

Admin credentials are saved in Bitwarden as Reign Services - Production Admin. Bootstrap recovery copies remain in the root-only /etc/txl/apps/reign-services-owner.json file on Oracle and the root-only Starlight secrets directory. Do not commit credentials.

Before public marketing: confirm owner access, contact/brand details and real lead notification delivery, complete billing if applicable, and review abuse controls.

The legacy startup deletion routine has been removed. API logging excludes response bodies.

## DNS cutover completed 2026-10-20

Nameservers remain launch1.spaceship.net and launch2.spaceship.net. The apex A record was changed from 8.228.239.83 to 209.74.71.35 (Starlight ingress), TTL 300 seconds. A www CNAME pointing to getreignservices.com was added, TTL 300 seconds. Existing Google verification TXT and six Resend records were preserved.

Both authoritative nameservers and public Google/Cloudflare resolvers returned the new web records. Caddy obtained valid certificates for both hostnames. The apex database health endpoint returned HTTPS 200; www returned 301 to the apex with valid TLS.

The Oracle app private endpoint is reached through the supervised SSH tunnel. Do not point the domain directly at Oracle 129.153.109.242 until its ingress and TLS are configured and verified.

## Validation

The ARM64 Docker production build and npm run check passed. Main-domain Playwright checks at 1440x1000 and 390x844 verified meaningful home content, no page errors, and no horizontal mobile overflow. The home assessment link opened the contact form; a synthetic request returned 201 and rendered confirmation. Authenticated retrieval confirmed persistence. Anonymous lead retrieval returned 401. Owner login worked with a Secure, HttpOnly cookie; logout invalidated the session. The synthetic lead was removed after validation, then a fresh encrypted database backup was created on Oracle and copied to Starlight.

Database role checks confirmed the Reign runtime role can connect to its own database and cannot connect to clinical_massage or platform_control.

Screenshots and temporary smoke scripts are outside the repository under /opt/txl/logs. AI and email delivery remain unconfigured.

## Operations release

See [PRODUCTION-TOOLS.md](PRODUCTION-TOOLS.md) for the new feature branch, OpenRouter-only configuration, isolated staging environment, verification coverage and manual promotion procedure. The prior live image is unchanged until promotion.
