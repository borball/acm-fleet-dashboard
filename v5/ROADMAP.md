# RHACM Global Hub Monitor v5 - Roadmap

**Status:** Released
**Release:** March 2026

## Overview

v5 is a security hardening, code quality, and UI modernization release built on top of v4.

## What Changed in v5

### Backend: Security & Code Quality

**Security Fixes (HIGH):**
- Removed mock JWT key fallback that accepted ANY token when JWKS was unavailable
- Fixed JWT issuer validation from prefix match to exact match (prevents subdomain spoofing)
- Removed credential leaks (bearer tokens, usernames, cert lengths logged to stdout)
- Fixed YAML injection in kubeconfig generation (now uses `yaml.Marshal` instead of `fmt.Sprintf`)
- Added `sanitizeFilename()` for Content-Disposition headers to prevent header injection
- Added DNS-compatible hub name validation via regex

**Bug Fixes:**
- Fixed `context.Background()` → `c.Request.Context()` for proper timeout/cancellation in spoke handlers
- Fixed shadowed `err` variable in `GetPoliciesCount`
- Replaced fragile string-matching error checks with `apierrors.IsAlreadyExists`/`apierrors.IsNotFound`

**Code Quality:**
- Standardized all logging to `log.Printf` (was inconsistent mix of `fmt.Printf`)
- Deduplicated operator CSV parsing into shared `convertCSVList()` function
- Replaced custom nested-string helpers with k8s built-in `unstructured.NestedString`
- Removed unused imports and dead code

### Frontend: BEM UI Redesign

**CSS Architecture:**
- Complete rewrite of `styles.css` using BEM methodology (`block__element--modifier`)
- CSS custom properties organized as design tokens (colors, spacing, radii, typography)
- Dark/light mode via variable overrides on `body.dark-mode`
- Flexbox/Grid for all layout - zero inline styles, zero utility classes

**Key BEM Blocks:**
- `site-header`, `card`, `grid`, `info-row`, `status`, `badge`, `policy-badge`
- `btn`, `tabs`, `stat-card`, `spoke-stat-card`, `filter-bar`
- `policy-detail`, `hub-form`, `hardware-grid`, `data-table`
- `topology-tree`, `empty-state`, `loading`, `error-panel`

**JavaScript:**
- All inline `style="..."` attributes replaced with BEM class names
- Removed debug `console.log` statements from theme management
- Cleaner HTML templates throughout `app.js` and `operators.js`

## Migration from v4

**Backward Compatible:** v5 includes all v4 features. No API changes.

**Upgrade:**
```bash
oc set image deployment/rhacm-monitor-backend \
  rhacm-monitor-backend=quay.io/bzhai/rhacm-monitor-backend:v5.0.0 \
  -n rhacm-monitor
```

## Future Directions

- Authentication improvements (OAuth flow)
- Metrics and Prometheus integration
- Redis-backed shared cache
- Historical compliance data
