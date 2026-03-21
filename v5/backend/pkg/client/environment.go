package client

import (
	"context"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
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
			if name, found, _ := unstructured.NestedString(infra.Object, "status", "infrastructureName"); found {
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


