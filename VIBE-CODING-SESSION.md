# Vibe-Coding Session Log

**Date:** 2026-03-27
**Tool:** Claude Code (Claude Opus 4.6)
**Project:** ACM Fleet Dashboard
**Duration:** ~4 hours

---

## Session Summary

Started with a freshly pulled fix for OAuth token exchange when adding unmanaged clusters. Ended with a fully redesigned, performance-optimized dashboard with OpenShift SSO authentication. Every change was built, pushed to `quay.io/bzhai/acm-fleet-backend:latest`, deployed to a live cluster (acm0), and verified before moving on.

---

## 1. OAuth Token Exchange Fix

**Problem:** Adding clusters with kubeadmin credentials failed because the OAuth URL was hardcoded to the API server endpoint, but OpenShift's OAuth server runs at a different URL.

**Fix:** Added a discovery step that queries `/.well-known/oauth-authorization-server` to find the real authorization endpoint before performing the token exchange.

**Commits:** `953dd83`

---

## 2. Performance Crisis — Hub with 350+ Spokes

**Problem:** Page timed out loading hub list. A single hub (`151-1`) had ~350 managed clusters. For each spoke, the backend made 2 API calls (policies + BMH nodes) = ~700 sequential API calls per hub.

### Round 1: Parallelize per-spoke fetching
- Added goroutines with `sync.WaitGroup` for concurrent spoke data fetching
- Added semaphore (max 10) to avoid overwhelming the API server
- **Result:** Still slow due to K8s client-side throttling (default QPS=5)

### Round 2: Increase K8s client QPS
- Changed QPS from 5→50, Burst from 10→100 on hub client REST config
- Added `GetHub` fallback to `hubs:list` cache
- **Result:** 29s → still timing out, plus client-side throttling messages gone

### Round 3: Brief mode for list views
- Added `brief` parameter to `getSpokesClustersFromHub` and `enrichHubWithRemoteData`
- List views (`/api/hubs`) skip per-spoke policies/nodes entirely
- **API calls reduced:** ~707 → 7 per hub (99% reduction)
- **Result:** Much faster, but OOM killed

### Round 4: Fix OOM
- Reverted hub-level parallelism (too many concurrent spokes in memory)
- Increased memory limits 1Gi → 2Gi
- **Result:** No more OOM, 17.7s load time

### Round 5: Re-enable controlled parallelism
- Added hub-level semaphore (max 3 concurrent hubs)
- Safe with brief mode since memory per hub is low
- **Result:** Load time reduced further

**Commits:** `953dd83`, `6e5b332`, multiple intermediate

---

## 3. UI Redesign — Table-Based Drill-Down

**Problem:** Card-based hub grid didn't scale for many hubs. Loading all data upfront was unnecessary.

### Homepage redesign
- Replaced hub cards with a compact table (name, type, status, OpenShift, spokes, nodes, links, actions)
- Added hub name filter input
- Clickable rows drill down to hub detail

### Spoke list redesign
- Replaced inline spoke cards with clickable table rows
- Removed Actions column — entire row is clickable
- Policies column shows "-" placeholder, updates after lazy load
- Removed Platform column (moved to spoke detail)

### Spoke detail lazy loading
- Added `GET /api/hubs/:name/spokes/:spoke` endpoint (returns policies + nodes)
- Frontend fetches spoke detail + operators in parallel on click
- Added `renderSpokeDetailsLazy()` with cluster info, labels, hardware, operators, policies
- Policy count in table row updates after lazy load

### Hub policies alignment
- Rewrote hub policies page to match spoke policies layout (compact filter bar, same button sizes)

**Commits:** `6e5b332`, `99e65b6`, `79d95e3`, `ee2ec8d`, `535b6e2`, `d1e1b53`

---

## 4. Code Cleanup — ~550 Lines Removed

### Frontend dead code removed
- `renderHubCardHTML`, `renderHubCard`, `renderHubSections` (old card layout)
- `renderLocalClusterSection`, `renderTopology` (never called)
- `renderSpokeHardware`, `renderNodeCard` (replaced by compact/merged versions)
- `renderSpokeDetails`, `updateSpokeOperators` (replaced by lazy load)
- `toggleSpokePolicies`, `debounce`, `renderDiskDetails` (unused)
- `testDirectAPI` (hardcoded dev IP)
- `operators.js` (entirely duplicate of app.js functions)
- Unused debounced filter wrappers, `rhacmInstalled` flag

### Frontend bugs fixed
- `refreshHub` — broken after table redesign, now reloads list
- `showError` — removed hardcoded IPs and cluster-specific data
- Null-safe access: `hub.clusterInfo.` → `hub.clusterInfo?.`
- Table consistency: added missing `data-table` class
- Undefined CSS variables: `--surface-secondary` → `--bg-card-secondary`
- Added missing `.spoke-detail-loading` CSS class
- JSON parse errors handled gracefully in spoke lazy load

### Backend dead code removed
- `GetOperatorsForNamespace`, `GetPoliciesCount` (unused functions)
- `shortPolicyName` variable (unused)
- Excessive debug logging (cluster status on every spoke, cache hit/miss on every request)

### Alert popups → Toast notifications
- Replaced all `alert()` calls with non-blocking toast notifications
- Color-coded: green (success), red (error), orange (warning), blue (info)
- Auto-dismiss after 5s, click to dismiss early
- Kept `confirm()` for destructive actions only

**Commits:** `e58e004`, `8c7a8ff`, `a75e1a7`, `835f44f`, `fa2fa7d`

---

## 5. OpenShift OAuth SSO

**Problem:** Dashboard had no authentication. Anyone with the URL could access all cluster data.

### Backend
- Replaced JWT/JWKS validation with OpenShift opaque token validation
- Validates tokens by calling `GET /apis/user.openshift.io/v1/users/~` with bearer token
- Token validation cached for 5 minutes (sync.Map)
- Added `GET /api/auth/config` — returns OAuth endpoint and client ID (unauthenticated)
- Added `GET /api/auth/user` — returns current user info
- Auth middleware skips only `/api/auth/config`, health/ready/live endpoints
- Removed `golang-jwt` dependency

### Frontend
- OAuth implicit grant flow: redirect to OpenShift login, handle callback
- Token extracted from URL fragment, stored in sessionStorage
- `window.fetch` patched to auto-attach Authorization header to all API requests
- Username displayed in header
- Graceful fallback when auth is disabled

### Deployment
- `ENABLE_AUTH=true` by default
- `deploy.sh` auto-creates OAuthClient resource with correct redirect URI
- OAuthClient uses `grantMethod: auto` for seamless login

### Bug fix: Infinite redirect loop
- Auth middleware was skipping all `/api/auth/` paths
- `/api/auth/user` never validated token → always returned 401 → redirect loop
- Fix: only skip `/api/auth/config`

**Commits:** `49a68f1`, `03f63c1`, `765d3cc`

---

## 6. Dark Mode Flash Fix

**Problem:** Page flashed between light and dark mode on every load/redirect.

**Root cause:** Theme class was applied via JS on `<body>` after the page rendered, with a `setTimeout` making it worse.

**Fix:**
- Moved theme detection to `<script>` in `<head>` — runs before body renders
- Applied class on `<html>` element instead of `<body>`
- Changed all CSS selectors from `body.dark-mode` to `.dark-mode`
- Removed `setTimeout` hack

**Commit:** `eb393cd`

---

## 7. Timeout Tuning

**Problem:** Pages still timing out on clusters with many hubs/spokes.

**Fix:** Increased timeouts across all three layers to 120s:
- OpenShift Route: `haproxy.router.openshift.io/timeout: 120s`
- Nginx proxy: `proxy_read_timeout 120s`
- Backend: `WriteTimeout: 120 * time.Second`

**Commit:** `66419fa`

---

## Key Metrics

| Metric | Before | After |
|--------|--------|-------|
| Hub list API calls (350-spoke hub) | ~707 | 7 |
| Hub list load time | 29s (timeout) | ~6-8s |
| Hub detail load time | 16s (timeout) | instant (cache) |
| Spoke detail load time | N/A (all upfront) | ~1s per spoke |
| Frontend app.js lines | ~1950 | ~1560 |
| Backend dead functions | 5 | 0 |
| Alert popups | 15 | 0 (toast notifications) |
| Authentication | None | OpenShift SSO |

---

## Files Changed

### Backend (Go)
- `cmd/server/main.go` — Token validator init, timeout config
- `internal/config/config.go` — Auth config fields
- `internal/middleware/auth.go` — OpenShift token validation middleware
- `pkg/api/router.go` — Auth endpoints, spoke detail route
- `pkg/auth/jwt.go` — Complete rewrite: JWT → OpenShift token validator
- `pkg/client/hubclient.go` — QPS/Burst tuning
- `pkg/client/rhacm.go` — Brief mode, parallel fetching, spoke detail endpoint
- `pkg/client/operators.go` — Dead code removal
- `pkg/client/kubernetes.go` — Dead code removal
- `pkg/handlers/hubs.go` — Cache cleanup, logging cleanup
- `pkg/handlers/spokes.go` — New GetSpokeDetail handler
- `pkg/handlers/hub_management.go` — OAuth endpoint discovery
- `pkg/handlers/cgu.go` — Dead code removal

### Frontend
- `index.html` — Flash-free theme init, header restructure
- `app.js` — OAuth flow, table UI, lazy loading, toast notifications, dead code cleanup
- `styles.css` — CSS variable fixes, new classes, dark-mode selector fix
- `operators.js` — Deleted (duplicate)

### Deployment
- `k8s/all-in-one.yaml` — Auth enabled, memory limits, timeouts, route annotation
- `k8s/backend-deployment.yaml` — Memory limits
- `deploy.sh` — OAuthClient auto-creation

### Docs
- `README.md` — Complete rewrite
- `ROADMAP.md` — Complete rewrite
