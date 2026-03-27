package api

import (
	"crypto/tls"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/rhacm-global-hub-monitor/backend/internal/middleware"
	"github.com/rhacm-global-hub-monitor/backend/pkg/auth"
	"github.com/rhacm-global-hub-monitor/backend/pkg/handlers"
)

// SetupRouter sets up the API routes
func SetupRouter(
	hubHandler *handlers.HubHandler,
	healthHandler *handlers.HealthHandler,
	policyHandler *handlers.PolicyHandler,
	cguHandler *handlers.CGUHandler,
	hubManagementHandler *handlers.HubManagementHandler,
	spokeHandler *handlers.SpokeHandler,
	tokenValidator *auth.TokenValidator,
	authEnabled bool,
	oauthIssuerURL string,
	oauthClientID string,
	corsOrigins []string,
) *gin.Engine {
	router := gin.Default()

	router.Use(middleware.CORSMiddleware(corsOrigins))
	router.Use(middleware.AuthMiddleware(tokenValidator, authEnabled))

	v1 := router.Group("/api")
	{
		v1.GET("/health", healthHandler.Health)
		v1.GET("/ready", healthHandler.Ready)
		v1.GET("/live", healthHandler.Live)
		v1.GET("/version", healthHandler.GetVersion)

		// Auth config endpoint (unauthenticated - frontend needs this to start OAuth flow)
		v1.GET("/auth/config", func(c *gin.Context) {
			if !authEnabled {
				c.JSON(http.StatusOK, gin.H{"enabled": false})
				return
			}

			// Discover the OAuth authorization endpoint from the API server
			authEndpoint := ""
			httpClient := &http.Client{
				Timeout:   5 * time.Second,
				Transport: &http.Transport{TLSClientConfig: &tls.Config{InsecureSkipVerify: true}},
			}
			wellKnownURL := strings.TrimRight(oauthIssuerURL, "/") + "/.well-known/oauth-authorization-server"
			resp, err := httpClient.Get(wellKnownURL)
			if err == nil {
				defer resp.Body.Close()
				if resp.StatusCode == http.StatusOK {
					var metadata struct {
						AuthorizationEndpoint string `json:"authorization_endpoint"`
					}
					if json.NewDecoder(resp.Body).Decode(&metadata) == nil {
						authEndpoint = metadata.AuthorizationEndpoint
					}
				}
			}

			c.JSON(http.StatusOK, gin.H{
				"enabled":               true,
				"clientID":              oauthClientID,
				"authorizationEndpoint": authEndpoint,
			})
		})

		// Auth user endpoint (returns current user info from token)
		v1.GET("/auth/user", func(c *gin.Context) {
			user, exists := c.Get("user")
			if !exists {
				c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "Not authenticated"})
				return
			}
			c.JSON(http.StatusOK, gin.H{"success": true, "data": user})
		})

		hubs := v1.Group("/hubs")
		{
			hubs.GET("", hubHandler.ListHubs)
			hubs.GET("/:name", hubHandler.GetHub)
			hubs.GET("/:name/clusters", hubHandler.ListHubClusters)
			hubs.POST("/add", hubManagementHandler.AddHub)
			hubs.DELETE("/:name/remove", hubManagementHandler.RemoveHub)
			hubs.GET("/:name/spokes/:spoke", spokeHandler.GetSpokeDetail)
			hubs.GET("/:name/spokes/:spoke/operators", spokeHandler.GetSpokeOperators)
			hubs.POST("/:name/refresh", hubHandler.RefreshHubCache)
		}

		policies := v1.Group("/policies")
		{
			policies.GET("/:namespace/:name/yaml", policyHandler.GetPolicyYAML)
		}

		cgu := v1.Group("/cgu")
		{
			cgu.POST("/create", cguHandler.CreateCGU)
		}
	}

	return router
}
