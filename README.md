# AISO Portal v3 MVP

This project is an independent copy of `portal-v2-mvp` focused on centralized
software-to-hardware compatibility management.

## v3 changes

- Adds a dedicated **Compatibility Mapping** view as a standalone sidebar entry,
  parallel to Parameter Center (permission-gated via `compatibility.read`).
- Provides software search, status filtering, mapping summaries, and a searchable
  published-hardware selector.
- Removes compatibility selection from software create and edit forms.
- Keeps `compatible_hardware` on the software product so storefront previews,
  product details, and hardware takedown guards remain compatible with v2 data.
- Logs mapping changes to Activity Log and product history.
- Adds centralized `compatibility.read` and `compatibility.update` permission
  boundaries for future RBAC integration.
- Uses the separate localStorage key `aiso-portal-v3-mvp`, preventing v3 from
  reading or overwriting v2 prototype data.

## Synced with v2 (2026-07-20)

- Ported the Licensing feature from v2: per-software single-select licensing
  offer, shown as a storefront badge next to the product name, selectable in the
  software create form, and managed in Parameter Center → Licensing Options
  (`SOFTWARE_LICENSE_OPTIONS` is persisted and covered by state rollback).
- Re-synced all other shared code with v2's latest working tree; the remaining
  differences between the two prototypes are v3's compatibility centralization,
  the permission scaffold, and the separate storage key.

## Current policy

- Only published hardware can be added to a mapping.
- Draft and published software can be configured.
- Archived software mappings are read-only.
- Changes to published software take effect immediately.
- Bundled software without a mapping is highlighted as needing configuration,
  but remains allowed until the final business rule is confirmed.

## Run locally

Serve this directory with any static HTTP server, then open `index.html`.

Demo credentials:

- Email: `root@aiso.com`
- Password: `aiso1234`
