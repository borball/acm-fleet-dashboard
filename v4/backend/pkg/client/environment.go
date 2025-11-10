package client

import (
	"context"
	"fmt"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

// DetectEnvironment detects the cluster environment (OpenShift, RHACM availability, etc.)
func (k *KubeClient) DetectEnvironment(ctx context.Context) (bool, bool, string, error) {
	isOpenShift := false
	hasRHACM := false
	clusterName := ""

	// Check for OpenShift by looking for ClusterVersion resource
	cvGVR := schema.GroupVersionResource{
		Group:    "config.openshift.io",
		Version:  "v1",
		Resource: "clusterversions",
	}
	
	cvList, err := k.DynamicClient.Resource(cvGVR).List(ctx, metav1.ListOptions{})
	if err == nil && len(cvList.Items) > 0 {
		isOpenShift = true
		// Try to get cluster name from infrastructure
		infraGVR := schema.GroupVersionResource{
			Group:    "config.openshift.io",
			Version:  "v1",
			Resource: "infrastructures",
		}
		infra, err := k.DynamicClient.Resource(infraGVR).Get(ctx, "cluster", metav1.GetOptions{})
		if err == nil {
			if name, found, _ := unstructuredNestedString(infra.Object, "status", "infrastructureName"); found {
				clusterName = name
			}
		}
	}

	// Check for RHACM by looking for ManagedCluster CRD
	mcGVR := schema.GroupVersionResource{
		Group:    "cluster.open-cluster-management.io",
		Version:  "v1",
		Resource: "managedclusters",
	}
	
	_, err = k.DynamicClient.Resource(mcGVR).List(ctx, metav1.ListOptions{Limit: 1})
	if err == nil {
		hasRHACM = true
	}

	return isOpenShift, hasRHACM, clusterName, nil
}

// Helper function to safely get nested string from unstructured object
func unstructuredNestedString(obj map[string]interface{}, fields ...string) (string, bool, error) {
	val, found, err := unstructuredNested(obj, fields...)
	if !found || err != nil {
		return "", found, err
	}
	s, ok := val.(string)
	if !ok {
		return "", false, fmt.Errorf("value is not a string")
	}
	return s, true, nil
}

func unstructuredNested(obj map[string]interface{}, fields ...string) (interface{}, bool, error) {
	current := obj
	for i, field := range fields {
		val, ok := current[field]
		if !ok {
			return nil, false, nil
		}
		if i == len(fields)-1 {
			return val, true, nil
		}
		current, ok = val.(map[string]interface{})
		if !ok {
			return nil, false, fmt.Errorf("field %s is not a map", field)
		}
	}
	return nil, false, nil
}





