# ACM Fleet Dashboard

**Unified dashboard for Red Hat Advanced Cluster Management (ACM) multi-hub environments.**

Monitor all your ACM hubs, spoke clusters, policies, and operators from a single pane of glass.

## Quick Start

```bash
cd deployment
./deploy.sh

# Get URL
oc get route hubs -n acm-fleet -o jsonpath='{.spec.host}'
```

Access at: `https://<route-url>`

The deploy script automatically:
- Deploys backend and frontend pods
- Creates the OpenShift OAuthClient for SSO login
- Configures the route with appropriate timeouts

## Features

- **Multi-hub fleet view** — Table-based hub list with drill-down to details
- **OpenShift SSO** — Login via OpenShift OAuth (uses web console credentials)
- **Spoke cluster management** — Lazy-loaded details (policies, nodes, operators) for fast page loads
- **Policy compliance** — Filtering, YAML export, CGU enforcement via TALM
- **Node inventory** — Kubernetes nodes + BareMetalHost hardware info (merged view)
- **Operators monitoring** — Installed operators on hubs and spokes (lazy-loaded)
- **Dark/Light mode** — Flash-free theme switching with localStorage persistence
- **Performance optimized** — Brief mode for list views, in-memory caching (30min TTL), concurrent hub fetching with semaphore
- **Add/remove hubs** — Via UI with kubeconfig file or API credentials (OAuth token exchange)
- **Toast notifications** — Non-blocking feedback for all user actions

## Architecture

```
├── backend/              # Go backend (Gin framework)
│   ├── cmd/server/       # Entry point
│   ├── internal/         # Config and middleware
│   └── pkg/
│       ├── api/          # Router setup + auth config endpoint
│       ├── auth/         # OpenShift OAuth token validation
│       ├── cache/        # In-memory cache (30min TTL)
│       ├── client/       # Kubernetes/RHACM API clients
│       ├── handlers/     # HTTP handlers (hubs, spokes, policies, CGU)
│       └── models/       # Data models
├── frontend-static/      # Vanilla JS frontend (PatternFly-inspired CSS)
│   ├── index.html        # Entry point with flash-free theme init
│   ├── styles.css        # BEM stylesheet with CSS custom properties
│   └── app.js            # Main application (OAuth flow, lazy loading, toast UI)
└── deployment/           # OpenShift/K8s manifests
    ├── deploy.sh         # One-command deployment (includes OAuthClient setup)
    ├── docker/           # Dockerfiles (multi-stage builds)
    └── k8s/              # Kubernetes resources (all-in-one.yaml)
```

## Authentication

SSO is enabled by default using OpenShift OAuth:

1. User visits the dashboard
2. Frontend redirects to OpenShift login page
3. After login, OpenShift redirects back with a bearer token
4. Token is stored in sessionStorage and sent with all API requests
5. Backend validates the token against the OpenShift user API (cached 5 min)

To disable auth (development only):
```bash
oc set env deployment/acm-fleet-backend ENABLE_AUTH=false -n acm-fleet
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/hubs` | List all hubs (brief mode) |
| GET | `/api/hubs/:name` | Hub detail with spoke list |
| GET | `/api/hubs/:name/spokes/:spoke` | Spoke policies and nodes (lazy load) |
| GET | `/api/hubs/:name/spokes/:spoke/operators` | Spoke operators (lazy load) |
| POST | `/api/hubs/add` | Add hub (kubeconfig or API credentials) |
| DELETE | `/api/hubs/:name/remove` | Remove manually added hub |
| POST | `/api/hubs/:name/refresh` | Clear hub cache |
| GET | `/api/policies/:ns/:name/yaml` | Download policy YAML |
| POST | `/api/cgu/create` | Create ClusterGroupUpgrade for policy enforcement |
| GET | `/api/auth/config` | OAuth configuration (unauthenticated) |
| GET | `/api/auth/user` | Current user info |

## Requirements

- OpenShift 4.x
- ACM installed (optional — works without it for manually added hubs)
- Hub kubeconfig secrets in `acm-fleet` namespace

## Development

```bash
# Build backend
cd backend && make build

# Run locally (auth disabled)
ENABLE_AUTH=false ./bin/server

# Frontend is static — serve with any HTTP server
cd frontend-static && python3 -m http.server 8000
```

## License

Apache 2.0
