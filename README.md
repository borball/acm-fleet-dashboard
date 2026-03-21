# RHACM Global Hub Monitor

**One-stop monitoring solution for Red Hat Advanced Cluster Management (RHACM) multi-cluster environments.**

## Quick Start

```bash
cd deployment
./deploy.sh

# Get URL
oc get route hubs -n rhacm-monitor -o jsonpath='{.spec.host}'
```

Access at: `https://<route-url>`

## Features

- **Multi-hub monitoring** - Managed (auto-discovered) and unmanaged (manually added) hubs
- **Spoke cluster details** - Status, versions, hardware inventory with lazy-loaded operators
- **Policy compliance** - Tracking, filtering, YAML export, CGU enforcement
- **Node inventory** - Kubernetes nodes + BareMetalHost hardware info
- **Operators monitoring** - Installed operators on hubs and spokes
- **Dark/Light mode** - Professional themes with localStorage persistence
- **Performance** - In-memory caching (30min TTL), session affinity, client-side cache
- **Per-hub refresh** - Granular cache invalidation
- **Add/remove hubs** - Via UI with kubeconfig or API credentials

## Architecture

```
├── backend/              # Go backend (gin framework)
│   ├── cmd/server/       # Entry point
│   ├── internal/         # Config and middleware
│   └── pkg/
│       ├── api/          # Router setup
│       ├── auth/         # JWT validation (OpenShift OAuth)
│       ├── cache/        # In-memory cache (30min TTL)
│       ├── client/       # Kubernetes API client
│       ├── handlers/     # HTTP handlers
│       └── models/       # Data models
├── frontend-static/      # Vanilla JS frontend (BEM CSS)
│   ├── index.html
│   ├── styles.css        # BEM stylesheet with CSS custom properties
│   ├── app.js            # Main application
│   └── operators.js      # Operator detail view
└── deployment/           # OpenShift/K8s manifests
    ├── deploy.sh         # One-command deployment
    ├── docker/           # Dockerfiles
    └── k8s/              # Kubernetes resources
```

## Requirements

- OpenShift 4.x or Kubernetes 1.24+
- RHACM installed (optional — works without it)
- Hub kubeconfig secrets in `rhacm-monitor` namespace

## Development

```bash
# Build backend
cd backend && make build

# Run locally
./bin/server

# Frontend is static — serve with any HTTP server
cd frontend-static && python3 -m http.server 8000
```

## Versioning

Versions are managed via git tags (e.g., `v5.0.0`).

## License

Apache 2.0
