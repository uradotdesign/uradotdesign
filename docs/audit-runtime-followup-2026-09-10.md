# Brand assets and runtime audit follow-up

This pass follows the broader audit in `audit-2026-09-10.md`. It reviews favicon source selection, weather failures and cache behavior, rate-limit lifecycle, theme initialization, contact-dialog navigation and team-profile interactions. The existing visual identity and page layouts are retained.

| Priority | Finding and impact | Correction |
| --- | --- | --- |
| P1 | The new local ICO and touch icon used a generic U instead of Ura's existing mark. The ICO could be selected instead of the CMS SVG. | PR #18 restores the exact SVG configured in Directus, regenerates square raster variants, prefers the CMS icon in document order and refreshes local URLs. The live ICO and touch icon match the corrected exports byte for byte. |
| P2 | Missing weather credentials and HTTP 401 responses returned fabricated clear-sky measurements as real, cacheable data. Runtime TTL configuration was ignored. | Weather now returns unavailable without invented data. Provider payloads and runtime TTLs are validated; failures are not cached. New server and client cache identities exclude old sample results. Both SSR callers share the same weather module. |
| P1 | Separate Redis increment and expiry requests could leave a permanent rate-limit key after a connection failure, indefinitely blocking a contact sender. | Contact and weather share one atomic Lua operation. It sets an expiry only when absent, also repairing old orphaned counters without extending normal windows. Existing outage behavior is retained. |
| P2 | The theme picker forced light mode when no saved preference existed, overriding the CMS default. A blocked storage read could prevent listener setup. Selection left focus in the closed panel. | Initialization follows the head bootstrap's chosen theme without reading storage again. Buttons expose their pressed state and return focus to the summary after selection. |
| P1 | Contact-dialog document/hash listeners and delayed callbacks survived Astro navigation. Background content remained available to assistive navigation. | Listeners and timers are disposed before swaps. The dialog preserves/restores background inert state and scrolling, excludes hidden/non-tab stops from its trap, cancels stale focus callbacks and restores trigger focus. |
| P1 | Team-profile link Enter events were intercepted by a parent button handler, flipping the card instead of opening the link. Hidden back-face links remained exposed, and profile overlays lacked focus containment/close controls. Mobile stacking rules obscured the active profile. | The front trigger and back dialog have separate semantics. Hidden faces are inert; links keep native activation; the profile has a labeled close button, focus wrapping, Escape and focus restoration. Navigation disposes listeners/timers. Mobile stacking/overflow and reduced-motion behavior are corrected; the card-row design remains. |

The rate-limit failure mode and atomic-script approach are also described in the [Redis INCR documentation](https://redis.io/docs/latest/commands/incr/).

## Verification

- 64 automated tests pass with the Redis integration enabled. CI starts isolated Redis and runs that test alongside the existing suite.
- The Redis test verifies 50 concurrent increments, a non-extending fixed window, recovery of an orphaned counter and a fresh count after expiry.
- Weather tests cover absent/placeholder credentials, rejected credentials, malformed provider payloads, invalid locations, runtime TTL validation, API limits and cache headers. Theme initialization is tested with browser storage blocked.
- Lint and the production Astro build pass. Astro checks 112 files with no errors, warnings or hints. Compiled navbar glass checks remain in place.
- Browser checks cover contact focus wrapping/restoration and navigation, theme selection and focus, team-profile link activation and dialog controls, unavailable weather, and desktop/375px profile layouts.
- Test weather credentials were disabled; Redis was isolated. No inquiry or newsletter submissions, CMS content mutations, or production synthetic accounts were used in this pass.

These are verified fixes for the listed paths. They do not constitute full screen-reader/WCAG certification, load testing or a complete review of every browser/platform combination. The earlier documented rich-HTML review, committed-record scheduling and CMS-class rebuild workflows still apply.
