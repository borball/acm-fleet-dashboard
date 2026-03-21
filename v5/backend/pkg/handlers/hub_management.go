package handlers

import (
	"encoding/base64"
	"fmt"
	"log"
	"net/http"
	"regexp"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/rhacm-global-hub-monitor/backend/pkg/cache"
	"github.com/rhacm-global-hub-monitor/backend/pkg/client"
	"github.com/rhacm-global-hub-monitor/backend/pkg/models"
	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"sigs.k8s.io/yaml"
)

// HubManagementHandler handles hub management operations
type HubManagementHandler struct {
	kubeClient *client.KubeClient
	cache      *cache.Cache
}

// NewHubManagementHandler creates a new hub management handler
func NewHubManagementHandler(kubeClient *client.KubeClient, cache *cache.Cache) *HubManagementHandler {
	return &HubManagementHandler{
		kubeClient: kubeClient,
		cache:      cache,
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

	var req AddHubRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{
			Success: false,
			Error:   "Invalid request: " + err.Error(),
		})
		return
	}

	// Validate hub name (DNS-compatible: lowercase alphanumeric and hyphens)
	if !isValidHubName(req.HubName) {
		c.JSON(http.StatusBadRequest, models.APIResponse{
			Success: false,
			Error:   "Invalid hub name: must be lowercase alphanumeric with hyphens, max 63 chars",
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
	if len(kubeconfigStr) < 50 || (!strings.Contains(kubeconfigStr, "apiVersion") && !strings.Contains(kubeconfigStr, "clusters")) {
		c.JSON(http.StatusBadRequest, models.APIResponse{
			Success: false,
			Error:   "Invalid kubeconfig format: must contain apiVersion and clusters",
		})
		return
	}

	// Store secret in rhacm-monitor namespace (no separate namespace per hub)
	secretNamespace := "rhacm-monitor"
	secretName := fmt.Sprintf("%s-admin-kubeconfig", req.HubName)
	
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
	_, err = h.kubeClient.ClientSet.CoreV1().Secrets(secretNamespace).Create(ctx, secret, metav1.CreateOptions{})
	if err != nil {
		if apierrors.IsAlreadyExists(err) {
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

	// v4: Clear hub list cache so new hub appears immediately
	h.cache.Delete("hubs:list")
	log.Println("Cache cleared after adding hub:", req.HubName)

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
	if err != nil && !apierrors.IsNotFound(err) {
		c.JSON(http.StatusInternalServerError, models.APIResponse{
			Success: false,
			Error:   "Failed to delete kubeconfig secret: " + err.Error(),
		})
		return
	}

	// v4: Clear cache so removed hub disappears immediately
	h.cache.Delete("hubs:list")
	h.cache.Delete("hub:" + hubName)
	log.Println("Cache cleared after removing hub:", hubName)

	c.JSON(http.StatusOK, models.APIResponse{
		Success: true,
		Message: fmt.Sprintf("Hub '%s' removed successfully", hubName),
	})
}

// isValidHubName validates hub name is DNS-compatible
var validHubName = regexp.MustCompile(`^[a-z0-9]([a-z0-9-]*[a-z0-9])?$`)

func isValidHubName(name string) bool {
	return len(name) > 0 && len(name) <= 63 && validHubName.MatchString(name)
}

// generateKubeconfig creates a kubeconfig from API endpoint and credentials
func generateKubeconfig(clusterName, apiEndpoint, username, password, token string) []byte {
	userName := clusterName + "-admin"
	contextName := clusterName + "-context"

	user := map[string]interface{}{}
	if token != "" {
		user["token"] = token
	} else {
		user["username"] = username
		user["password"] = password
	}

	kubeconfig := map[string]interface{}{
		"apiVersion":      "v1",
		"kind":            "Config",
		"current-context": contextName,
		"clusters": []map[string]interface{}{
			{
				"name": clusterName,
				"cluster": map[string]interface{}{
					"insecure-skip-tls-verify": true,
					"server":                   apiEndpoint,
				},
			},
		},
		"contexts": []map[string]interface{}{
			{
				"name": contextName,
				"context": map[string]interface{}{
					"cluster": clusterName,
					"user":    userName,
				},
			},
		},
		"users": []map[string]interface{}{
			{
				"name": userName,
				"user": user,
			},
		},
	}

	data, err := yaml.Marshal(kubeconfig)
	if err != nil {
		log.Printf("Error marshaling kubeconfig: %v", err)
		return nil
	}
	return data
}
