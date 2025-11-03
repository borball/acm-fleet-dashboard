package handlers

import (
	"context"
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/rhacm-global-hub-monitor/backend/pkg/client"
	"github.com/rhacm-global-hub-monitor/backend/pkg/models"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// SpokeHandler handles spoke cluster requests
type SpokeHandler struct {
	rhacmClient *client.RHACMClient
	kubeClient  *client.KubeClient
}

// NewSpokeHandler creates a new spoke handler
func NewSpokeHandler(rhacmClient *client.RHACMClient, kubeClient *client.KubeClient) *SpokeHandler {
	return &SpokeHandler{
		rhacmClient: rhacmClient,
		kubeClient:  kubeClient,
	}
}

// GetSpokeOperators fetches operators for a specific spoke cluster (lazy load)
func (h *SpokeHandler) GetSpokeOperators(c *gin.Context) {
	ctx := context.Background()
	hubName := c.Param("name") // Use 'name' to match the route parameter
	spokeName := c.Param("spoke")

	// Try to connect to the hub first
	hubClient, err := client.NewHubClientFromSecret(ctx, h.kubeClient, hubName)
	if err != nil {
		c.JSON(http.StatusNotFound, models.APIResponse{
			Success: false,
			Error:   fmt.Sprintf("Hub %s not found: %v", hubName, err),
		})
		return
	}

	// Try to get spoke kubeconfig from hub
	spokeSecret, err := hubClient.GetKubeClient().ClientSet.CoreV1().Secrets(spokeName).Get(ctx, spokeName+"-admin-kubeconfig", metav1.GetOptions{})
	if err != nil {
		c.JSON(http.StatusOK, models.APIResponse{
			Success: true,
			Data:    []models.OperatorInfo{}, // Return empty if no kubeconfig
		})
		return
	}

	if spokeSecret.Data["kubeconfig"] == nil {
		c.JSON(http.StatusOK, models.APIResponse{
			Success: true,
			Data:    []models.OperatorInfo{},
		})
		return
	}

	// Create spoke client
	spokeClient, err := client.NewSpokeClientFromKubeconfig(spokeSecret.Data["kubeconfig"], spokeName)
	if err != nil {
		c.JSON(http.StatusOK, models.APIResponse{
			Success: true,
			Data:    []models.OperatorInfo{},
		})
		return
	}

	// Fetch operators from spoke
	operators, err := spokeClient.GetKubeClient().GetOperators(ctx)
	if err != nil {
		c.JSON(http.StatusOK, models.APIResponse{
			Success: true,
			Data:    []models.OperatorInfo{},
		})
		return
	}

	c.JSON(http.StatusOK, models.APIResponse{
		Success: true,
		Data:    operators,
	})
}

