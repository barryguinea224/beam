# BEAM Travel History — responsive dashboard refactor

Status: implementation pending. This is a design/acceptance contract, **not** a claim that the new UI has been implemented.

## Preconditions
- Six real-world staging/Preview #3 contact/PDF/share/journal checks reported passed.
- Staging contacts migration already applied; **no SQL changes in this PR**.
- Keep previews private, never enable public preview access.
- Base: `feature/beam-travel-history-v1`; do not merge into `main`.

## Visual reference
Five approved mockup views: mobile dashboard, mobile filter sheet, mobile account read-only, mobile account edit, desktop/tablet split dashboard. Treat mockup map and example identity as illustrative only.

## Mobile (< 900 CSS px)
- Hero with responsive serif title, 3 existing metrics, actions; real map visible in first viewport.
- Map from existing trip data, height `min(55vh, 460px)`, full available width; country labels below.
- Trips below map. Compact filter trigger, removable active chips and clear-all.
- Filter bottom sheet scrollable with fixed reachable actions, including 320 px and keyboard open.
- Account as separate screen via top-right avatar: profile read-only, explicit edit/cancel/save, searchable single country selector, sign out, collapsed deletion area.
- No autosave; confirm before discarding unsaved changes.

## Desktop/tablet (>= 900 CSS px)
- Header includes factual PDF and printable journal actions.
- Split columns: left hero/metrics/map sticky with short-height scroll fallback; right trips independently scrollable.
- Filters in anchored popover, dismiss on Escape and outside click.
- Account in right-side drawer ~420 px, retaining dashboard behind.

## Invariants
- Keep existing trip CRUD, metrics, national/foreign semantics, filtering, factual PDF, printable journal, authentication, and Supabase access controls unchanged.
- Map selection derived from visited countries; robust multi-continent bounds; never leave a dark outline on unvisited countries after touch. Keyboard outline only with `:focus-visible`.
- Android Back and Escape close topmost overlay before navigating away; focus trap/restore where appropriate; 44 px touch targets; no horizontal overflow.
- Contact consent remains unchecked by default and after each generation; factual PDF only includes contacts on explicit opt-in; printable journal never includes contacts.
- Use synthetic identities and contact values in screenshots and tests; never embed real user identity.

## Acceptance gates
1. Responsive screenshots at 320, 360, 390, 768, 1280 CSS px.
2. Filter opening/closing, chips, reset, keyboard focus and Android Back.
3. Profile read/edit/cancel/save, dirty-form exit confirmation, residence selection, logout, deletion protections.
4. Real map with visited countries in distant continents, touch focus regression.
5. Existing automated suites + new responsive and accessibility checks green.
6. Recheck factual PDF opt-in/out, Android share PDF, and journal privacy.
7. PWA cache version bump; staging/Preview #3 real-device acceptance before merge.
