package client

import (
	"context"

	"github.com/rhacm-global-hub-monitor/backend/pkg/models"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

var csvGVR = schema.GroupVersionResource{
	Group:    "operators.coreos.com",
	Version:  "v1alpha1",
	Resource: "clusterserviceversions",
}

// GetOperators fetches all ClusterServiceVersion (CSV) resources which represent installed operators
func (k *KubeClient) GetOperators(ctx context.Context) ([]models.OperatorInfo, error) {
	csvList, err := k.DynamicClient.Resource(csvGVR).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, nil
	}
	return convertCSVList(csvList.Items), nil
}

// GetOperatorsForNamespace fetches operators from a specific namespace
func (k *KubeClient) GetOperatorsForNamespace(ctx context.Context, namespace string) ([]models.OperatorInfo, error) {
	csvList, err := k.DynamicClient.Resource(csvGVR).Namespace(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, nil
	}
	return convertCSVList(csvList.Items), nil
}

func convertCSVList(items []unstructured.Unstructured) []models.OperatorInfo {
	operators := make([]models.OperatorInfo, 0, len(items))
	for _, csv := range items {
		operator := models.OperatorInfo{
			Name:      csv.GetName(),
			Namespace: csv.GetNamespace(),
			CreatedAt: csv.GetCreationTimestamp().Time,
		}

		if spec, found, _ := unstructured.NestedMap(csv.Object, "spec"); found {
			if displayName, found, _ := unstructured.NestedString(spec, "displayName"); found {
				operator.DisplayName = displayName
			}
			if version, found, _ := unstructured.NestedString(spec, "version"); found {
				operator.Version = version
			}
			if provider, found, _ := unstructured.NestedMap(spec, "provider"); found {
				if name, found, _ := unstructured.NestedString(provider, "name"); found {
					operator.Provider = name
				}
			}
		}

		if status, found, _ := unstructured.NestedMap(csv.Object, "status"); found {
			if phase, found, _ := unstructured.NestedString(status, "phase"); found {
				operator.Phase = phase
			}
		}

		operators = append(operators, operator)
	}
	return operators
}
