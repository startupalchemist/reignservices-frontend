# Aerial site plans and export branding

The staff Operations page includes aerial site studies linked to customer leads. Confirm the map center: Census address matching is interpolated and may locate a street rather than the intended building. A confirmed latitude/longitude can override the center. The current workflow covers the continental United States.

Imagery uses Mapbox Satellite when MAPBOX_TOKEN is configured; otherwise it uses the public USGS NAIP Plus orthoimagery service, which includes NAIP and high-resolution local imagery. Coverage, acquisition dates and native resolution vary. Source display scale is computed with the 512-pixel Web Mercator convention; upsampling does not improve native imagery accuracy. USGS/USDA attribution is retained; Mapbox attribution remains embedded in the image. Platform white labeling never removes provider attribution.

AI markup uses OPENROUTER_VISION_MODEL (default openrouter/free) and the existing OPENROUTER_API_KEY. Image capability is selected by the free router; only free model identifiers are accepted. The shared daily inference budget also applies to vision requests. Provider errors retain the prior plan. Staff can draw boundaries manually, undo points, remove uncertain regions, and review the result. Polygons are validated and measurements are calculated by the server; the model does not supply trusted measurements. AI outlines are visual estimates, not legal parcel boundaries or survey data.

Site studies can be downloaded as professionally formatted PNG or SVG exports with numbered outlines, a legend, north marker, estimated areas/perimeters, source/date notes, and branding. Preliminary exports are visibly marked. A reviewed outline can be copied into measurements, where it remains unverified until a separate staff check before proposal use. Edits invalidate the site study review; version checks reject stale edits and AI results. Deleting a site study removes its saved image but does not delete existing measurement or proposal snapshots.

## Export entitlements

| Tier | Platform mark | Both marks | Tenant only |
| --- | --- | --- | --- |
| Starter | Yes | No | No |
| Pro | Yes | Yes | No |
| White Label | Yes | Yes | Yes |

A subscription must be active or trialing and unexpired. Premium tiers require an explicit expiry. Past-due, canceled, paused, incomplete, expired or unknown entitlements cannot export. The server rechecks current access on every export, including after rendering. Selecting a mode in a URL or altering the browser cannot grant access. No exported public object URL is created; image and export routes require staff authentication and use no-store caching.

This Reign installation has one tenant database. LAUNCHWORKS_TENANT_ID fixes its site-study scope on the server (default reign); clients cannot submit or select a tenant identity. Existing Reign CRM records are not a shared-database, multi-tenant CRM. A future shared deployment requires tenant membership and isolation across all legacy tables too.

The Webmaster/root role controls subscription entitlements and the platform PNG logo. Tenant admins can edit their own business name and PNG logo, but cannot change subscription access. Logo uploads are size/pixel limited, decoded, and re-encoded; remote URLs and SVG uploads are rejected. Until a platform PNG is uploaded, exports use the LaunchWorks wordmark. Reign's existing logo initializes tenant branding.

No billing processor or subscription model existed in this app. These are owner-provisioned access records, not an automated payment integration: changing access does not charge/refund a customer. A future verified billing webhook must write this trusted entitlement state; browser-supplied payment status must never do so.

The website footer uses two restrained lines: LaunchWorks by Ocotillo Intelligence / Engineered by TachyonXLabs. Export white labeling applies to exported site studies; it does not hide the website footer.

## Release checks

TypeScript, 14 domain tests and 16 PostgreSQL/API tests pass locally, including forged premium requests, admin privilege boundaries, subscription expiry/status transitions, tenant scoping, PNG output, attribution retention, stale updates, AI output validation, and separate measurement verification. CI and the native ARM64 source build passed, and migration 0002 was applied to isolated staging. Live USGS imagery, free vision markup (eight regions on a public Dallas test site), all three PNG/SVG branding modes, root-only entitlement controls, and canceled/expired denial passed. The original Starter entitlement was restored after testing. Desktop/mobile browser validation passed at 1440 × 1000 and 390 × 844, including manual drawing, review, measurement transfer, tenant logo upload, PNG downloads, locked premium options and the footer copy. No horizontal overflow, page errors or console errors were observed. A mobile button-wrap issue found during QA was fixed. Regions may overlap; region areas must not be summed blindly. Keep production promotion separate from staging.

Primary provider references:
- https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPPlus/ImageServer
- https://geocoding.geo.census.gov/geocoder/Geocoding_Services_API.html
- https://docs.mapbox.com/api/maps/static-images/
- https://docs.mapbox.com/help/glossary/zoom-level/
