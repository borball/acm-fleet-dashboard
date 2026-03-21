package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/rhacm-global-hub-monitor/backend/pkg/client"
	"github.com/rhacm-global-hub-monitor/backend/pkg/models"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

// GlobalHubHandler handles global hub information requests
type GlobalHubHandler struct {
	kubeClient *client.KubeClient
	rhacmClient *client.RHACMClient
}

// NewGlobalHubHandler creates a new global hub handler
func NewGlobalHubHandler(kubeClient *client.KubeClient, rhacmClient *client.RHACMClient) *GlobalHubHandler {
	return &GlobalHubHandler{
		kubeClient: kubeClient,
		rhacmClient: rhacmClient,
	}
}

// GetGlobalHubInfo returns information about the global hub cluster
func (h *GlobalHubHandler) GetGlobalHubInfo(c *gin.Context) {
	ctx := c.Request.Context()

	// Detect environment
	isOpenShift, hasRHACM, clusterName, err := h.kubeClient.DetectEnvironment(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{
			Success: false,
			Error:   "Failed to detect environment: " + err.Error(),
		})
		return
	}

	if clusterName == "" {
		clusterName = "global-hub"
	}

	// Get cluster version info
	version := "Unknown"
	openshiftVersion := "N/A"
	platform := "Kubernetes"

	if isOpenShift {
		platform = "OpenShift"
		cvGVR := schema.GroupVersionResource{
			Group:    "config.openshift.io",
			Version:  "v1",
			Resource: "clusterversions",
		}
		cvList, err := h.kubeClient.DynamicClient.Resource(cvGVR).List(ctx, metav1.ListOptions{})
		if err == nil && len(cvList.Items) > 0 {
			cv := cvList.Items[0]
			if v, found, _ := unstructured.NestedString(cv.Object, "status", "desired", "version"); found {
				openshiftVersion = v
			}
			if kv, found, _ := unstructured.NestedString(cv.Object, "status", "desired", "image"); found {
				version = kv
			}
		}
	}

	// Get node count
	nodes, err := h.kubeClient.ClientSet.CoreV1().Nodes().List(ctx, metav1.ListOptions{})
	nodeCount := 0
	if err == nil {
		nodeCount = len(nodes.Items)
	}

	// Get hub and spoke counts
	managedHubCount := 0
	spokeCount := 0
	policyCount := 0
	topology := &models.HubTopology{Hubs: []models.HubNode{}}

	if hasRHACM {
		// Get all hubs
		hubs, err := h.rhacmClient.GetManagedHubs(ctx)
		if err == nil {
			managedHubCount = len(hubs)
			
			// Build topology
			for _, hub := range hubs {
				hubNode := models.HubNode{
					Name:       hub.Name,
					Status:     hub.Status,
					SpokeCount: len(hub.ManagedClusters),
					Spokes:     []models.SpokeNode{},
					IsManaged:  hub.Annotations["source"] != "manual",
				}
				
				// Add spokes
				for _, spoke := range hub.ManagedClusters {
					spokeNode := models.SpokeNode{
						Name:   spoke.Name,
						Status: spoke.Status,
						Hub:    hub.Name,
					}
					hubNode.Spokes = append(hubNode.Spokes, spokeNode)
					spokeCount++
				}
				
				topology.Hubs = append(topology.Hubs, hubNode)
				policyCount += len(hub.PoliciesInfo)
			}
		}
	}

	globalHub := models.GlobalHub{
		Name:             clusterName,
		Version:          version,
		OpenshiftVersion: openshiftVersion,
		Platform:         platform,
		NodeCount:        nodeCount,
		RHACMInstalled:   hasRHACM,
		ManagedHubCount:  managedHubCount,
		SpokeCount:       spokeCount,
		PolicyCount:      policyCount,
		Topology:         topology,
	}

	c.JSON(http.StatusOK, models.APIResponse{
		Success: true,
		Data:    globalHub,
	})
}

