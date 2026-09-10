# Directus picker correction and extension toolchain

The Compose services build `ura-directus:12.3.1-ura.1` from the official Directus 12.3.1 image. Its API, database migrations and permissions are unchanged. The only Studio logic change makes the native page builder's **Create New** menu use the collection list that Directus already filters by create permission. **Add Existing** and the displayed blocks keep their original behavior.

## Why a local image is needed

In [the upstream 12.3.1 component](https://github.com/directus/directus/blob/v12.3.1/app/src/interfaces/list-m2a/list-m2a.vue), the menu condition checks `createCollections`, but the menu's loop renders `allowedCollections`. This exposes drawers that ordinary Editors cannot successfully create or publish. The correction changes that one loop to `createCollections`; it does not grant or revoke permissions.

`scripts/patch-directus-picker.mjs` verifies the exact upstream bundle SHA-256 and the bundled `@directus/app` version, then verifies the patched checksum. A changed upstream release fails the build before editing any files. Every JavaScript chunk receives a new URL with Directus's required eight-character hash format. References in HTML and chunks are updated together, preventing browsers from mixing cached old modules with the corrected app. The Docker build in CI exercises both the patch and the actual API resolver for all five shared extension dependencies against the official image.

When upgrading Directus, check whether the upstream loop is fixed. If so, remove this patch and return Compose to the official image. Otherwise review the new source and build before updating checksums; never simply weaken the guard. An already open Studio tab should be reloaded after deployment.

## Extension dependency compatibility

Both extension packages retain the current `@directus/extensions-sdk` 18.0.4 and pin its Unhead Vue peer to 2.1.17 through a scoped package override. The SDK brings this peer through `@directus/themes`; neither Ura extension ships Unhead or the theme provider in its built bundle.

The override was verified with clean installs, both extension builds, SDK runtime exports, computed theme-link input, entry updates/disposal, unsafe-link filtering and bundle checks. The deployed JavaScript bundles are byte-for-byte identical to their pre-override versions. All three npm dependency audits, including the extension development trees, report zero findings at this revision. CI now runs these audits and compatibility checks; a future change must pass them again.

This verification covers the two existing Ura extensions. A future extension that uses the theme provider directly needs its own browser compatibility test. Do not treat this as a general recommendation to override Unhead in unrelated Directus projects.
