package client

import (
	"context"
	"time"

	"github.com/rhacm-global-hub-monitor/backend/pkg/models"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
)

// GetPoliciesForNamespace fetches policies from a specific namespace
func (k *KubeClient) GetPoliciesForNamespace(ctx context.Context, namespace string) ([]models.PolicyInfo, error) {
	// Query Policy resources using dynamic client
	policyList, err := k.DynamicClient.Resource(PolicyGVR).Namespace(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		// Policies may not be available, return empty list
		return []models.PolicyInfo{}, nil
	}

	var policies []models.PolicyInfo
	for _, item := range policyList.Items {
		policy, err := convertUnstructuredToPolicy(&item)
		if err != nil {
			// Skip policies we can't parse
			continue
		}
		policies = append(policies, policy)
	}

	return policies, nil
}

// convertUnstructuredToPolicy converts an unstructured policy to PolicyInfo
func convertUnstructuredToPolicy(obj *unstructured.Unstructured) (models.PolicyInfo, error) {
	policy := models.PolicyInfo{
		Name:        obj.GetName(),
		Namespace:   obj.GetNamespace(),
		Labels:      obj.GetLabels(),
		Annotations: obj.GetAnnotations(),
		CreatedAt:   obj.GetCreationTimestamp().Time,
	}

	// Extract spec fields
	spec, found, err := unstructured.NestedMap(obj.Object, "spec")
	if err == nil && found {
		if remediationAction, ok := spec["remediationAction"].(string); ok {
			policy.RemediationAction = remediationAction
		}
		if disabled, ok := spec["disabled"].(bool); ok {
			policy.Disabled = disabled
		}
	}

	// Extract status fields
	status, found, err := unstructured.NestedMap(obj.Object, "status")
	if err == nil && found {
		if compliant, ok := status["compliant"].(string); ok {
			policy.ComplianceState = compliant
		}

		// Extract latest status message from details
		if details, ok := status["details"].([]interface{}); ok && len(details) > 0 {
			if detail, ok := details[0].(map[string]interface{}); ok {
				if history, ok := detail["history"].([]interface{}); ok && len(history) > 0 {
					// Find the most recent history entry by timestamp
					var latestMessage string
					var latestTimestamp string
					var latestTime time.Time

					for _, h := range history {
						if historyEntry, ok := h.(map[string]interface{}); ok {
							if timestamp, ok := historyEntry["lastTimestamp"].(string); ok {
								t, err := time.Parse(time.RFC3339, timestamp)
								if err == nil {
									if t.After(latestTime) {
										latestTime = t
										latestTimestamp = timestamp
										if message, ok := historyEntry["message"].(string); ok {
											latestMessage = message
										}
									}
								}
							}
						}
					}

					// Store the latest message
					if latestMessage != "" {
						if policy.Annotations == nil {
							policy.Annotations = make(map[string]string)
						}
						policy.Annotations["latest-status-message"] = latestMessage
						policy.Annotations["latest-status-timestamp"] = latestTimestamp
					}
				}
			}
		}
	}

	// Extract annotations for additional info
	if annotations := obj.GetAnnotations(); annotations != nil {
		// Try to get severity from annotations
		if severity, ok := annotations["policy.open-cluster-management.io/severity"]; ok {
			policy.Severity = severity
		} else {
			policy.Severity = "medium" // default
		}

		// Try to get categories
		if categories, ok := annotations["policy.open-cluster-management.io/categories"]; ok {
			policy.Categories = []string{categories}
		}

		// Try to get standards
		if standards, ok := annotations["policy.open-cluster-management.io/standards"]; ok {
			policy.Standards = []string{standards}
		}

		// Try to get controls
		if controls, ok := annotations["policy.open-cluster-management.io/controls"]; ok {
			policy.Controls = []string{controls}
		}
	}

	// Count actual violations from status details
	if status, found, err := unstructured.NestedMap(obj.Object, "status"); err == nil && found {
		if details, ok := status["details"].([]interface{}); ok {
			violationCount := 0
			for _, detail := range details {
				if detailMap, ok := detail.(map[string]interface{}); ok {
					// Check if this detail shows a non-compliant state
					if compliant, ok := detailMap["compliant"].(string); ok {
						if compliant != "Compliant" {
							violationCount++
						}
					}
				}
			}
			policy.Violations = violationCount
		}
	}

	return policy, nil
}
