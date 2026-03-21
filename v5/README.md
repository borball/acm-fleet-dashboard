# RHACM Global Hub Monitor v5

Security hardening, code quality improvements, and BEM UI redesign.

## Quick Start

```bash
cd v5/deployment
./deploy.sh

# Get URL
oc get route hubs -n rhacm-monitor -o jsonpath='{.spec.host}'
```

## What's New in v5

### Security
- Fixed JWT validation (removed insecure mock key fallback)
- Fixed credential leaks in logs
- Fixed YAML injection in kubeconfig generation
- Added input validation for hub names and filenames

### Code Quality
- Standardized logging (`log.Printf`)
- Deduplicated operator CSV parsing, node helpers, hub card rendering
- Replaced fragile string-matching error checks with proper k8s API error types
- Fixed context propagation in spoke handlers

### UI Redesign
- **BEM CSS** - All class names follow `block__element--modifier` convention
- **CSS Custom Properties** - Design tokens for colors, spacing, typography
- **Zero inline styles** - All styling in `styles.css`
- **Flexbox/Grid layout** - No utility classes
- **Dark/Light mode** preserved via CSS variable overrides

## Architecture

```
v5/
├── backend/
│   └── pkg/
│       ├── auth/         # JWT validation (OpenShift OAuth)
│       ├── cache/        # In-memory cache (30min TTL)
│       ├── client/       # Kubernetes API client
│       ├── handlers/     # HTTP handlers (gin)
│       └── models/       # Data models
├── frontend-static/
│   ├── index.html        # Entry point
│   ├── styles.css        # BEM stylesheet
│   ├── app.js            # Main application
│   └── operators.js      # Operator detail view
└── deployment/           # OpenShift/K8s manifests
```

## Requirements

- OpenShift 4.x or Kubernetes 1.24+
- RHACM installed (optional - works without it)
- Hub kubeconfig secrets in `rhacm-monitor` namespace

## Features

- Multi-hub monitoring (managed + unmanaged)
- Spoke cluster details with lazy-loaded operators
- Policy compliance tracking with filtering
- Node hardware inventory (K8s + BareMetalHost)
- Per-hub refresh and cache management
- Dark/Light theme toggle
- Add/remove unmanaged hubs via UI
