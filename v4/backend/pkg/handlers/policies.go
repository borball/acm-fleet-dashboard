package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/rhacm-global-hub-monitor/backend/pkg/client"
	"github.com/rhacm-global-hub-monitor/backend/pkg/models"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"sigs.k8s.io/yaml"
)

// PolicyHandler handles policy-related requests
type PolicyHandler struct {
	kubeClient  *client.KubeClient
	rhacmClient *client.RHACMClient
}

// NewPolicyHandler creates a new policy handler
func NewPolicyHandler(kubeClient *client.KubeClient, rhacmClient *client.RHACMClient) *PolicyHandler {
	return &PolicyHandler{
		kubeClient:  kubeClient,
		rhacmClient: rhacmClient,
	}
}

// GetPolicyYAML godoc
// @Summary Get policy YAML
// @Description Get the actual policy YAML from the cluster
// @Tags policies
// @Param namespace path string true "Policy namespace"
// @Param name path string true "Policy name"
// @Param hub query string false "Hub name (for spoke policies)"
// @Produce text/yaml
// @Success 200 {string} string "Policy YAML"
// @Failure 404 {object} models.APIResponse
// @Failure 500 {object} models.APIResponse
// @Router /api/policies/{namespace}/{name}/yaml [get]
func (h *PolicyHandler) GetPolicyYAML(c *gin.Context) {
	ctx := c.Request.Context()
	namespace := c.Param("namespace")
	name := c.Param("name")
	hubName := c.Query("hub") // Optional: if provided, fetch from this hub

	var policy interface{}
	var err error

	// If hub parameter is provided, fetch from that hub (for spoke policies)
	if hubName != "" {
		// Create client for the hub
		hubClient, err := client.NewHubClientFromSecret(ctx, h.kubeClient, hubName)
		if err != nil {
			c.JSON(http.StatusNotFound, models.APIResponse{
				Success: false,
				Error:   "Failed to connect to hub: " + err.Error(),
			})
			return
		}

		// Get policy from the hub
		policyGVR := client.PolicyGVR
		policyObj, err := hubClient.GetKubeClient().DynamicClient.Resource(policyGVR).Namespace(namespace).Get(ctx, name, metav1.GetOptions{})
		if err != nil {
			c.JSON(http.StatusNotFound, models.APIResponse{
				Success: false,
				Error:   "Policy not found on hub: " + err.Error(),
			})
			return
		}
		policy = policyObj.Object
	} else {
		// Get the policy from global hub
		policyGVR := client.PolicyGVR
		policyObj, err := h.kubeClient.DynamicClient.Resource(policyGVR).Namespace(namespace).Get(ctx, name, metav1.GetOptions{})
		if err != nil {
			c.JSON(http.StatusNotFound, models.APIResponse{
				Success: false,
				Error:   "Policy not found: " + err.Error(),
			})
			return
		}
		policy = policyObj.Object
	}

	// Convert to YAML
	yamlBytes, err := yaml.Marshal(policy)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{
			Success: false,
			Error:   "Failed to convert policy to YAML: " + err.Error(),
		})
		return
	}

	// Return YAML with appropriate content type
	// Use namespace (cluster name) as prefix for filename
	filename := namespace + "_" + name + ".yaml"
	c.Header("Content-Type", "text/yaml")
	c.Header("Content-Disposition", `attachment; filename="`+filename+`"`)
	c.String(http.StatusOK, string(yamlBytes))
}
