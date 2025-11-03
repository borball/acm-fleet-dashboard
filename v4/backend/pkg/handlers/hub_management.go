package handlers

import (
	"encoding/base64"
	"fmt"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/rhacm-global-hub-monitor/backend/pkg/client"
	"github.com/rhacm-global-hub-monitor/backend/pkg/models"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// HubManagementHandler handles hub management operations
type HubManagementHandler struct {
	kubeClient *client.KubeClient
}

// NewHubManagementHandler creates a new hub management handler
func NewHubManagementHandler(kubeClient *client.KubeClient) *HubManagementHandler {
	return &HubManagementHandler{
		kubeClient: kubeClient,
	}
}

// AddHubRequest represents the request to add a new hub
type AddHubRequest struct {
	HubName       string `json:"hubName" binding:"required"`
	Kubeconfig    string `json:"kubeconfig"`    // Base64 encoded kubeconfig
	KubeconfigRaw string `json:"kubeconfigRaw"` // Raw kubeconfig text (YAML or JSON format)
	APIEndpoint   string `json:"apiEndpoint"`   // API server endpoint (e.g., https://api.cluster:6443)
	Username      string `json:"username"`      // Username for basic auth
	Password      string `json:"password"`      // Password for basic auth
	Token         string `json:"token"`         // Bearer token (alternative to username/password)
}

// AddHub godoc
// @Summary Add a new hub
// @Description Add a new managed hub by creating a kubeconfig secret
// @Tags hubs
// @Accept json
// @Produce json
// @Param body body AddHubRequest true "Hub configuration"
// @Success 200 {object} models.APIResponse
// @Failure 400 {object} models.APIResponse
// @Failure 500 {object} models.APIResponse
// @Router /api/hubs/add [post]
func (h *HubManagementHandler) AddHub(c *gin.Context) {
	ctx := c.Request.Context()
	log.Println("DEBUG AddHub: Function called")

	var req AddHubRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{
			Success: false,
			Error:   "Invalid request: " + err.Error(),
		})
		return
	}

	// Decode kubeconfig (supports both YAML and JSON formats)
	var kubeconfigData []byte
	var err error

	if req.Kubeconfig != "" {
		// Base64 encoded kubeconfig
		kubeconfigData, err = base64.StdEncoding.DecodeString(req.Kubeconfig)
		if err != nil {
			c.JSON(http.StatusBadRequest, models.APIResponse{
				Success: false,
				Error:   "Invalid base64 kubeconfig: " + err.Error(),
			})
			return
		}
	} else if req.KubeconfigRaw != "" {
		// Raw text (YAML or JSON - both are valid kubeconfig formats)
		kubeconfigData = []byte(req.KubeconfigRaw)
	} else if req.APIEndpoint != "" && (req.Username != "" || req.Token != "") {
		// Generate kubeconfig from API endpoint and credentials
		kubeconfigData = generateKubeconfig(req.HubName, req.APIEndpoint, req.Username, req.Password, req.Token)
	} else {
		c.JSON(http.StatusBadRequest, models.APIResponse{
			Success: false,
			Error:   "Must provide either: kubeconfig, or API endpoint with credentials",
		})
		return
	}

	// Validate kubeconfig has some basic structure
	kubeconfigStr := string(kubeconfigData)
	if len(kubeconfigStr) < 50 || (!contains(kubeconfigStr, "apiVersion") && !contains(kubeconfigStr, "clusters")) {
		c.JSON(http.StatusBadRequest, models.APIResponse{
			Success: false,
			Error:   "Invalid kubeconfig format: must contain apiVersion and clusters",
		})
		return
	}

	// Store secret in rhacm-monitor namespace (no separate namespace per hub)
	secretNamespace := "rhacm-monitor"
	secretName := fmt.Sprintf("%s-admin-kubeconfig", req.HubName)
	
	log.Printf("DEBUG AddHub: hubName=%s, secretName=%s, secretNamespace=%s", req.HubName, secretName, secretNamespace)
	
	secret := &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{
			Name:      secretName,
			Namespace: secretNamespace,
			Labels: map[string]string{
				"created-by": "rhacm-monitor",
			},
		},
		Data: map[string][]byte{
			"kubeconfig": kubeconfigData,
		},
		Type: corev1.SecretTypeOpaque,
	}

	// Try to create, if exists then update
	log.Printf("DEBUG AddHub: Creating secret %s in namespace %s", secretName, secretNamespace)
	_, err = h.kubeClient.ClientSet.CoreV1().Secrets(secretNamespace).Create(ctx, secret, metav1.CreateOptions{})
	log.Printf("DEBUG AddHub: Create result - error: %v", err)
	if err != nil {
		if isAlreadyExistsError(err) {
			// Secret exists, update it
			_, err = h.kubeClient.ClientSet.CoreV1().Secrets(secretNamespace).Update(ctx, secret, metav1.UpdateOptions{})
			if err != nil {
				c.JSON(http.StatusInternalServerError, models.APIResponse{
					Success: false,
					Error:   "Failed to update existing kubeconfig secret: " + err.Error(),
				})
				return
			}
		} else {
			c.JSON(http.StatusInternalServerError, models.APIResponse{
				Success: false,
				Error:   "Failed to create kubeconfig secret: " + err.Error(),
			})
			return
		}
	}

	c.JSON(http.StatusOK, models.APIResponse{
		Success: true,
		Message: fmt.Sprintf("Hub '%s' added successfully", req.HubName),
		Data: map[string]interface{}{
			"hubName":    req.HubName,
			"namespace":  secretNamespace,
			"secretName": secretName,
		},
	})
}

// RemoveHub godoc
// @Summary Remove a hub
// @Description Remove a managed hub by deleting its kubeconfig secret and namespace
// @Tags hubs
// @Param name path string true "Hub name"
// @Success 200 {object} models.APIResponse
// @Failure 500 {object} models.APIResponse
// @Router /api/hubs/{name}/remove [delete]
func (h *HubManagementHandler) RemoveHub(c *gin.Context) {
	ctx := c.Request.Context()
	hubName := c.Param("name")

	// Delete the kubeconfig secret from rhacm-monitor namespace
	secretName := fmt.Sprintf("%s-admin-kubeconfig", hubName)
	err := h.kubeClient.ClientSet.CoreV1().Secrets("rhacm-monitor").Delete(ctx, secretName, metav1.DeleteOptions{})
	if err != nil && !isNotFoundError(err) {
		c.JSON(http.StatusInternalServerError, models.APIResponse{
			Success: false,
			Error:   "Failed to delete kubeconfig secret: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, models.APIResponse{
		Success: true,
		Message: fmt.Sprintf("Hub '%s' kubeconfig secret removed", hubName),
	})
}

func isAlreadyExistsError(err error) bool {
	return err != nil && (err.Error() == "already exists" ||
		(len(err.Error()) > 14 && err.Error()[len(err.Error())-14:] == "already exists"))
}

func isNotFoundError(err error) bool {
	return err != nil && (err.Error() == "not found" ||
		(len(err.Error()) > 9 && err.Error()[len(err.Error())-9:] == "not found"))
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr ||
		len(s) > len(substr) && (s[:len(substr)] == substr ||
			s[len(s)-len(substr):] == substr ||
			findSubstring(s, substr)))
}

func findSubstring(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}

// generateKubeconfig creates a kubeconfig from API endpoint and credentials
func generateKubeconfig(clusterName, apiEndpoint, username, password, token string) []byte {
	var authConfig string

	if token != "" {
		// Token-based authentication
		authConfig = fmt.Sprintf(`- name: %s-admin
  user:
    token: %s`, clusterName, token)
	} else {
		// Username/password authentication
		authConfig = fmt.Sprintf(`- name: %s-admin
  user:
    username: %s
    password: %s`, clusterName, username, password)
	}

	kubeconfig := fmt.Sprintf(`apiVersion: v1
kind: Config
clusters:
- cluster:
    insecure-skip-tls-verify: true
    server: %s
  name: %s
contexts:
- context:
    cluster: %s
    user: %s-admin
  name: %s-context
current-context: %s-context
users:
%s
`, apiEndpoint, clusterName, clusterName, clusterName, clusterName, clusterName, authConfig)

	return []byte(kubeconfig)
}
