package handlers

import (
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/rhacm-global-hub-monitor/backend/pkg/client"
	"github.com/rhacm-global-hub-monitor/backend/pkg/models"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

var (
	// ClusterGroupUpgradeGVR is the GroupVersionResource for ClusterGroupUpgrade
	ClusterGroupUpgradeGVR = schema.GroupVersionResource{
		Group:    "ran.openshift.io",
		Version:  "v1alpha1",
		Resource: "clustergroupupgrades",
	}
)

// CGUHandler handles ClusterGroupUpgrade-related requests
type CGUHandler struct {
	kubeClient  *client.KubeClient
	rhacmClient *client.RHACMClient
}

// NewCGUHandler creates a new CGU handler
func NewCGUHandler(kubeClient *client.KubeClient, rhacmClient *client.RHACMClient) *CGUHandler {
	return &CGUHandler{
		kubeClient:  kubeClient,
		rhacmClient: rhacmClient,
	}
}

// CreateCGU godoc
// @Summary Create ClusterGroupUpgrade
// @Description Create a CGU to enforce a policy on a cluster
// @Tags cgu
// @Accept json
// @Produce json
// @Param body body object true "CGU creation parameters"
// @Success 200 {object} models.APIResponse
// @Failure 400 {object} models.APIResponse
// @Failure 500 {object} models.APIResponse
// @Router /api/cgu/create [post]
func (h *CGUHandler) CreateCGU(c *gin.Context) {
	ctx := c.Request.Context()

	var req struct {
		ClusterName string `json:"clusterName" binding:"required"`
		PolicyName  string `json:"policyName" binding:"required"`
		Namespace   string `json:"namespace" binding:"required"`
		HubName     string `json:"hubName"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{
			Success: false,
			Error:   "Invalid request: " + err.Error(),
		})
		return
	}

	// Generate CGU name with short timestamp (max 63 chars for labels)
	timestamp := time.Now().Unix()
	shortTimestamp := fmt.Sprintf("%d", timestamp%1000000) // Last 6 digits

	// Remove 'ztp-vdu.' prefix from policy name for CGU name
	shortPolicyName := req.PolicyName
	if len(shortPolicyName) > 8 && shortPolicyName[:8] == "ztp-vdu." {
		shortPolicyName = shortPolicyName[8:]
	}

	// Create name: {cluster}-{timestamp}
	// Keep it short to avoid 63 char limit
	cguName := fmt.Sprintf("%s-%s", req.ClusterName, shortTimestamp)

	// If still too long, truncate
	if len(cguName) > 50 {
		cguName = cguName[:50]
	}

	// CGU namespace is always ztp-install
	targetNamespace := "ztp-install"

	// Extract short policy name for managedPolicies (remove ztp-vdu. prefix)
	managedPolicyName := req.PolicyName
	if len(managedPolicyName) > 8 && managedPolicyName[:8] == "ztp-vdu." {
		managedPolicyName = managedPolicyName[8:]
	}

	// Determine which client to use
	var dynamicClient = h.kubeClient.DynamicClient

	// If hubName is provided, create CGU on that hub
	if req.HubName != "" {
		hubClient, err := client.NewHubClientFromSecret(ctx, h.kubeClient, req.HubName)
		if err != nil {
			c.JSON(http.StatusInternalServerError, models.APIResponse{
				Success: false,
				Error:   "Failed to connect to hub: " + err.Error(),
			})
			return
		}
		dynamicClient = hubClient.GetKubeClient().DynamicClient
	}

	// Create CGU resource
	cgu := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "ran.openshift.io/v1alpha1",
			"kind":       "ClusterGroupUpgrade",
			"metadata": map[string]interface{}{
				"name":      cguName,
				"namespace": targetNamespace,
				"labels": map[string]interface{}{
					"created-by": "rhacm-monitor",
				},
			},
			"spec": map[string]interface{}{
				"clusters": []interface{}{
					req.ClusterName,
				},
				"enable": true,
				"managedPolicies": []interface{}{
					managedPolicyName,
				},
				"remediationStrategy": map[string]interface{}{
					"maxConcurrency": 1,
					"timeout":        240,
				},
			},
		},
	}

	// Create the CGU
	created, err := dynamicClient.Resource(ClusterGroupUpgradeGVR).Namespace(targetNamespace).Create(ctx, cgu, metav1.CreateOptions{})
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{
			Success: false,
			Error:   "Failed to create CGU: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, models.APIResponse{
		Success: true,
		Message: fmt.Sprintf("ClusterGroupUpgrade '%s' created successfully", cguName),
		Data: map[string]interface{}{
			"cguName":   cguName,
			"namespace": targetNamespace,
			"cluster":   req.ClusterName,
			"policy":    req.PolicyName,
			"created":   created.GetCreationTimestamp().String(),
		},
	})
}
