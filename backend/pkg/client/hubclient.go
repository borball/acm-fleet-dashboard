package client

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/rhacm-global-hub-monitor/backend/pkg/models"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
	clusterv1 "open-cluster-management.io/api/cluster/v1"
)

// HubClient represents a client for a specific managed hub
type HubClient struct {
	kubeClient *KubeClient
	hubName    string
}

// GetKubeClient returns the underlying KubeClient
func (h *HubClient) GetKubeClient() *KubeClient {
	return h.kubeClient
}

// NewHubClientFromSecret creates a new hub client from a kubeconfig secret.
// If the token has expired and stored credentials exist, it re-exchanges for a fresh token.
func NewHubClientFromSecret(ctx context.Context, globalHubClient *KubeClient, hubName string) (*HubClient, error) {
	secretName := fmt.Sprintf("%s-admin-kubeconfig", hubName)

	// Try hub's namespace first (for managed hubs)
	secret, err := globalHubClient.ClientSet.CoreV1().Secrets(hubName).Get(ctx, secretName, metav1.GetOptions{})
	secretNamespace := hubName
	if err != nil {
		// If not found, try acm-fleet namespace (for unmanaged hubs)
		secret, err = globalHubClient.ClientSet.CoreV1().Secrets("acm-fleet").Get(ctx, secretName, metav1.GetOptions{})
		secretNamespace = "acm-fleet"
		if err != nil {
			return nil, fmt.Errorf("failed to get kubeconfig secret in %s or acm-fleet namespace: %w", hubName, err)
		}
	}

	kubeconfigData, ok := secret.Data["kubeconfig"]
	if !ok {
		return nil, fmt.Errorf("kubeconfig not found in secret %s", secretName)
	}

	hubClient, err := NewHubClientFromKubeconfigData(kubeconfigData, hubName)
	if err != nil {
		return nil, err
	}

	// Quick auth check — if it fails, try to refresh the token using stored credentials
	_, authErr := hubClient.kubeClient.ClientSet.Discovery().ServerVersion()
	if authErr != nil && secret.Data["username"] != nil && secret.Data["password"] != nil && secret.Data["api-endpoint"] != nil {
		log.Printf("Info: Token expired for %s, attempting credential refresh", hubName)
		newToken, refreshErr := RefreshOAuthToken(
			string(secret.Data["api-endpoint"]),
			string(secret.Data["username"]),
			string(secret.Data["password"]),
		)
		if refreshErr != nil {
			log.Printf("Warning: Token refresh failed for %s: %v", hubName, refreshErr)
			return hubClient, nil // Return original client, let caller handle errors
		}

		// Update kubeconfig with new token
		newKubeconfig := GenerateKubeconfig(hubName, string(secret.Data["api-endpoint"]), newToken)
		secret.Data["kubeconfig"] = newKubeconfig
		_, updateErr := globalHubClient.ClientSet.CoreV1().Secrets(secretNamespace).Update(ctx, secret, metav1.UpdateOptions{})
		if updateErr != nil {
			log.Printf("Warning: Failed to update secret with refreshed token for %s: %v", hubName, updateErr)
		} else {
			log.Printf("Info: Token refreshed successfully for %s", hubName)
		}

		// Create new client with fresh token
		hubClient, err = NewHubClientFromKubeconfigData(newKubeconfig, hubName)
		if err != nil {
			return nil, err
		}
	}

	return hubClient, nil
}

// NewSpokeClientFromKubeconfig creates a spoke client from kubeconfig bytes
func NewSpokeClientFromKubeconfig(kubeconfigData []byte, spokeName string) (*HubClient, error) {
	// Use improved authentication parsing
	return NewHubClientFromKubeconfigData(kubeconfigData, spokeName)
}

// NewHubClientFromKubeconfigData creates a hub client from kubeconfig bytes with proper authentication
// This is the v4 fix for system:anonymous issue
func NewHubClientFromKubeconfigData(kubeconfigData []byte, hubName string) (*HubClient, error) {
	// Parse kubeconfig
	config, err := clientcmd.Load(kubeconfigData)
	if err != nil {
		return nil, fmt.Errorf("failed to load kubeconfig: %w", err)
	}
	
	// Determine which context to use
	contextName := config.CurrentContext
	if contextName == "" {
		// Use first available context
		for name := range config.Contexts {
			contextName = name
			break
		}
	}
	
	if contextName == "" {
		return nil, fmt.Errorf("no context found in kubeconfig")
	}
	
	context := config.Contexts[contextName]
	if context == nil {
		return nil, fmt.Errorf("context %s not found", contextName)
	}
	
	cluster := config.Clusters[context.Cluster]
	if cluster == nil {
		return nil, fmt.Errorf("cluster %s not found", context.Cluster)
	}
	
	authInfo := config.AuthInfos[context.AuthInfo]
	if authInfo == nil {
		return nil, fmt.Errorf("user %s not found", context.AuthInfo)
	}
	
	// Build REST config with explicit auth and timeouts
	restConfig := &rest.Config{
		Host: cluster.Server,
		TLSClientConfig: rest.TLSClientConfig{
			Insecure:   cluster.InsecureSkipTLSVerify,
			ServerName: cluster.TLSServerName,
		},
		Timeout: 30 * time.Second,
		QPS:     50,
		Burst:   100,
	}
	
	// Handle CA certificate
	if len(cluster.CertificateAuthorityData) > 0 {
		restConfig.TLSClientConfig.CAData = cluster.CertificateAuthorityData
	} else if cluster.CertificateAuthority != "" {
		restConfig.TLSClientConfig.CAFile = cluster.CertificateAuthority
	}
	
	// Handle client authentication (priority order: cert, token, basic)
	if len(authInfo.ClientCertificateData) > 0 && len(authInfo.ClientKeyData) > 0 {
		restConfig.TLSClientConfig.CertData = authInfo.ClientCertificateData
		restConfig.TLSClientConfig.KeyData = authInfo.ClientKeyData
	} else if authInfo.Token != "" {
		restConfig.BearerToken = authInfo.Token
	} else if authInfo.TokenFile != "" {
		restConfig.BearerTokenFile = authInfo.TokenFile
	} else if authInfo.Username != "" {
		restConfig.Username = authInfo.Username
		restConfig.Password = authInfo.Password
	} else {
		log.Printf("Warning: %s has no valid authentication method in kubeconfig", hubName)
	}
	
	// Create client
	kubeClient, err := NewKubeClientFromConfig(restConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to create client: %w", err)
	}
	
	return &HubClient{
		kubeClient: kubeClient,
		hubName:    hubName,
	}, nil
}

// NewKubeClientFromConfig creates a KubeClient from an existing rest.Config
func NewKubeClientFromConfig(config *rest.Config) (*KubeClient, error) {
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

// GetManagedClusters returns all managed clusters (spokes) on this hub
func (h *HubClient) GetManagedClusters(ctx context.Context) (*clusterv1.ManagedClusterList, error) {
	return h.kubeClient.GetManagedClusters(ctx)
}

// GetNodesForCluster returns node information for a cluster
func (h *HubClient) GetNodesForCluster(ctx context.Context, namespace string) ([]models.NodeInfo, error) {
	var allNodes []models.NodeInfo

	// Get Kubernetes Node resources if this is the cluster itself
	// For spoke clusters, we query nodes in the spoke's namespace which gives us BMH
	nodes, err := h.kubeClient.GetNodes(ctx)
	if err == nil && namespace == "" {
		// This is the hub cluster itself, use actual nodes
		for i := range nodes.Items {
			nodeInfo := ConvertNodeToNodeInfo(&nodes.Items[i])
			if nodeInfo.Annotations == nil {
				nodeInfo.Annotations = make(map[string]string)
			}
			nodeInfo.Annotations["data-source"] = "Node"
			allNodes = append(allNodes, nodeInfo)
		}
	}

	// Also get BareMetalHost resources for hardware details
	if namespace != "" {
		bmhNodes, err := h.kubeClient.GetBareMetalHostsForNamespace(ctx, namespace)
		if err == nil {
			allNodes = append(allNodes, bmhNodes...)
		}
	}

	return allNodes, nil
}
