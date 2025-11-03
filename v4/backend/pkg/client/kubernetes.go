package client

import (
	"context"
	"fmt"
	"os"
	"path/filepath"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
	clusterv1 "open-cluster-management.io/api/cluster/v1"
)

var (
	// ManagedClusterGVR is the GroupVersionResource for ManagedCluster
	ManagedClusterGVR = schema.GroupVersionResource{
		Group:    "cluster.open-cluster-management.io",
		Version:  "v1",
		Resource: "managedclusters",
	}

	// PolicyGVR is the GroupVersionResource for Policy
	PolicyGVR = schema.GroupVersionResource{
		Group:    "policy.open-cluster-management.io",
		Version:  "v1",
		Resource: "policies",
	}
)

// KubeClient holds Kubernetes clients
type KubeClient struct {
	ClientSet     kubernetes.Interface
	DynamicClient dynamic.Interface
	RestConfig    *rest.Config
}

// NewKubeClient creates a new Kubernetes client
func NewKubeClient(kubeconfigPath string) (*KubeClient, error) {
	config, err := buildConfig(kubeconfigPath)
	if err != nil {
		return nil, fmt.Errorf("failed to build config: %w", err)
	}

	clientSet, err := kubernetes.NewForConfig(config)
	if err != nil {
		return nil, fmt.Errorf("failed to create clientset: %w", err)
	}

	dynamicClient, err := dynamic.NewForConfig(config)
	if err != nil {
		return nil, fmt.Errorf("failed to create dynamic client: %w", err)
	}

	return &KubeClient{
		ClientSet:     clientSet,
		DynamicClient: dynamicClient,
		RestConfig:    config,
	}, nil
}

// buildConfig builds a Kubernetes config from kubeconfig or in-cluster config
func buildConfig(kubeconfigPath string) (*rest.Config, error) {
	// Try in-cluster config first
	if kubeconfigPath == "" {
		config, err := rest.InClusterConfig()
		if err == nil {
			return config, nil
		}
	}

	// Try kubeconfig path
	if kubeconfigPath != "" {
		return clientcmd.BuildConfigFromFlags("", kubeconfigPath)
	}

	// Try default kubeconfig location
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, fmt.Errorf("failed to get home directory: %w", err)
	}

	kubeconfigPath = filepath.Join(home, ".kube", "config")
	return clientcmd.BuildConfigFromFlags("", kubeconfigPath)
}

// GetManagedClusters returns all managed clusters
func (k *KubeClient) GetManagedClusters(ctx context.Context) (*clusterv1.ManagedClusterList, error) {
	list, err := k.DynamicClient.Resource(ManagedClusterGVR).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to list managed clusters: %w", err)
	}

	mcList := &clusterv1.ManagedClusterList{}
	err = runtime.DefaultUnstructuredConverter.FromUnstructured(list.UnstructuredContent(), mcList)
	if err != nil {
		return nil, fmt.Errorf("failed to convert to ManagedClusterList: %w", err)
	}

	return mcList, nil
}

// GetManagedCluster returns a specific managed cluster
func (k *KubeClient) GetManagedCluster(ctx context.Context, name string) (*clusterv1.ManagedCluster, error) {
	obj, err := k.DynamicClient.Resource(ManagedClusterGVR).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to get managed cluster %s: %w", name, err)
	}

	mc := &clusterv1.ManagedCluster{}
	err = runtime.DefaultUnstructuredConverter.FromUnstructured(obj.UnstructuredContent(), mc)
	if err != nil {
		return nil, fmt.Errorf("failed to convert to ManagedCluster: %w", err)
	}

	return mc, nil
}

// GetPoliciesCount returns the count of policies in a namespace
func (k *KubeClient) GetPoliciesCount(ctx context.Context, namespace string) (int, error) {
	var err error

	if namespace != "" {
		obj, err := k.DynamicClient.Resource(PolicyGVR).Namespace(namespace).List(ctx, metav1.ListOptions{})
		if err != nil {
			// Policies may not be available, return 0 without error
			return 0, nil
		}
		return len(obj.Items), nil
	}

	obj, err := k.DynamicClient.Resource(PolicyGVR).List(ctx, metav1.ListOptions{})
	if err != nil {
		// Policies may not be available, return 0 without error
		return 0, nil
	}
	return len(obj.Items), nil
}

// GetNodes returns all nodes in the cluster
func (k *KubeClient) GetNodes(ctx context.Context) (*corev1.NodeList, error) {
	nodes, err := k.ClientSet.CoreV1().Nodes().List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to list nodes: %w", err)
	}
	return nodes, nil
}

// GetClusterVersion returns the cluster version information
func (k *KubeClient) GetClusterVersion(ctx context.Context) (string, error) {
	version, err := k.ClientSet.Discovery().ServerVersion()
	if err != nil {
		return "", fmt.Errorf("failed to get server version: %w", err)
	}
	return version.GitVersion, nil
}
