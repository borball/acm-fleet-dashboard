#!/bin/bash
set -e

# ACM Fleet Dashboard v3.0.0 - Quick Deploy Script

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                                                                ║"
echo "║    ACM Fleet Dashboard v3.0.0 - Quick Deploy             ║"
echo "║                                                                ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

NAMESPACE="acm-fleet"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Step 1: Deploy infrastructure
echo "📦 Step 1/3: Deploying infrastructure..."
oc apply -f "${SCRIPT_DIR}/k8s/all-in-one.yaml"
echo "✅ Infrastructure deployed"
echo ""

# Step 2: Deploy frontend files
echo "📦 Step 2/3: Deploying frontend files..."
if oc get configmap frontend-html -n ${NAMESPACE} &>/dev/null; then
    echo "   Deleting existing frontend-html configmap..."
    oc delete configmap frontend-html -n ${NAMESPACE}
fi

echo "   Creating frontend-html configmap..."
oc create configmap frontend-html \
  --from-file="${SCRIPT_DIR}/../frontend-static/" \
  -n ${NAMESPACE}
echo "✅ Frontend deployed"
echo ""

# Step 3: Restart pods to pick up changes
echo "📦 Step 3/3: Restarting pods..."
oc delete pods -l component=proxy -n ${NAMESPACE} &>/dev/null || true
echo "✅ Pods restarting"
echo ""

# Wait for deployment to be ready
echo "⏳ Waiting for deployment to be ready..."
oc wait --for=condition=available --timeout=120s \
  deployment/acm-fleet-backend \
  deployment/acm-fleet-proxy \
  -n ${NAMESPACE}
echo ""

# Get route URL
ROUTE_URL=$(oc get route acm-fleet -n ${NAMESPACE} -o jsonpath='{.spec.host}' 2>/dev/null || echo "")

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                                                                ║"
echo "║    ✅ Deployment Complete!                                    ║"
echo "║                                                                ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo "📊 Status:"
echo "   Namespace: ${NAMESPACE}"
echo "   Backend Pods: $(oc get pods -l component=backend -n ${NAMESPACE} --no-headers 2>/dev/null | wc -l)/2"
echo "   Frontend Pods: $(oc get pods -l component=proxy -n ${NAMESPACE} --no-headers 2>/dev/null | wc -l)/2"
echo ""

if [ -n "$ROUTE_URL" ]; then
    echo "🌐 Access URL:"
    echo "   https://${ROUTE_URL}"
    echo ""
fi

echo "📋 Next Steps:"
echo "   1. Create hub kubeconfig secrets (see README.md)"
echo "   2. Access the web UI at the URL above"
echo "   3. Toggle dark/light mode with button in header"
echo ""

echo "📝 Monitoring:"
echo "   Backend logs:  oc logs -l component=backend -n ${NAMESPACE}"
echo "   Frontend logs: oc logs -l component=proxy -n ${NAMESPACE}"
echo "   All pods:      oc get pods -n ${NAMESPACE}"
echo ""

echo "🎉 ACM Fleet Dashboard v3.0.0 is ready!"


