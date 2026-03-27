# ACM Fleet Dashboard - Roadmap

## Completed

### Performance & Scalability
- **Brief mode for list views** — Hub and spoke lists skip per-spoke API calls (policies, nodes), reducing API calls from ~700 to ~7 per hub
- **Lazy-loaded spoke details** — Policies, nodes, and operators fetched on demand when user expands a spoke
- **Concurrent hub fetching** — Hubs processed in parallel with semaphore (max 3) to balance speed and memory
- **Increased K8s client QPS/Burst** — 50/100 (up from 5/10) to avoid client-side throttling
- **Timeout tuning** — 120s across route, nginx proxy, and backend write timeout
- **Memory limit increase** — Backend pods: 2Gi (up from 1Gi) for large spoke counts

### Authentication
- **OpenShift OAuth SSO** — Login via OpenShift web console credentials
- **Token validation** — Validates opaque OAuth tokens via OpenShift user API
- **Token caching** — 5-minute cache to avoid per-request API calls
- **Auto-discovery** — OAuth authorization endpoint discovered from `.well-known/oauth-authorization-server`
- **OAuthClient auto-setup** — deploy.sh creates the OAuthClient resource automatically

### UI Redesign
- **Table-based hub list** — Replaced card grid with compact table, clickable rows
- **Table-based spoke list** — Clickable rows with lazy-loaded detail expansion
- **Hub filter** — Filter hubs by name on homepage
- **Spoke filters** — Filter by cluster name, version, configuration
- **Policy filters** — Filter by name, compliance state (All/Compliant/NonCompliant)
- **Aligned policy views** — Hub and spoke policy pages use same compact layout
- **Spoke detail overview** — Shows cluster info, labels, hardware, policies, operators
- **Toast notifications** — Replaced all alert() popups with non-blocking toasts
- **Flash-free dark mode** — Theme applied in `<head>` before body renders
- **Dead code cleanup** — Removed ~550 lines of unused functions, duplicate files, stale CSS

### Backend Quality
- **OAuth token exchange** — Exchange kubeadmin credentials for OAuth tokens when adding hubs
- **OAuth endpoint discovery** — Discover OAuth server via `.well-known` instead of hardcoding
- **Removed excessive logging** — Debug cluster status logs, verbose cache logs
- **Removed dead code** — Unused functions, duplicate operator file, stale handlers

## Future Directions

- **Bulk spoke policy loading** — "Load all policies" button to fetch all spoke policies at once for a hub
- **Policy compliance summary** — Aggregate compliance stats in hub list (requires background pre-fetching)
- **Prometheus metrics** — Expose `/metrics` endpoint for monitoring dashboard performance
- **Redis-backed cache** — Shared cache for multi-pod deployments
- **Historical compliance data** — Track compliance trends over time
- **Webhook notifications** — Alert on status changes (hub disconnected, policy non-compliant)
- **RBAC** — Role-based access control (restrict hub visibility per user/group)
- **Export** — CSV/JSON export of hub/spoke/policy data
