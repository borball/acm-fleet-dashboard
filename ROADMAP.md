# RHACM Global Hub Monitor - Roadmap

## Recent Changes (v5.0.0)

### Backend: Security & Code Quality

**Security Fixes:**
- Removed mock JWT key fallback that accepted ANY token when JWKS was unavailable
- Fixed JWT issuer validation from prefix match to exact match (prevents subdomain spoofing)
- Removed credential leaks (bearer tokens, usernames, cert lengths logged to stdout)
- Fixed YAML injection in kubeconfig generation (now uses `yaml.Marshal`)
- Added `sanitizeFilename()` for Content-Disposition headers
- Added DNS-compatible hub name validation

**Bug Fixes:**
- Fixed `context.Background()` to `c.Request.Context()` for proper timeout/cancellation
- Fixed shadowed `err` variable in `GetPoliciesCount`
- Replaced fragile string-matching error checks with `apierrors.IsAlreadyExists`/`apierrors.IsNotFound`

**Code Quality:**
- Standardized logging to `log.Printf`
- Deduplicated operator CSV parsing into shared `convertCSVList()`
- Replaced custom nested-string helpers with k8s built-in `unstructured.NestedString`
- Removed unused imports and dead code

### Frontend: BEM UI Redesign

- Complete CSS rewrite using BEM methodology (`block__element--modifier`)
- CSS custom properties as design tokens (colors, spacing, radii, typography)
- Dark/light mode via CSS variable overrides
- Flexbox/Grid layout throughout — zero inline styles, zero utility classes
- Removed debug `console.log` statements

## Future Directions

- OAuth authentication flow improvements
- Prometheus metrics integration
- Redis-backed shared cache for multi-pod deployments
- Historical compliance data and trending
- Webhook notifications for status changes
