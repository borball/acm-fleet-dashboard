package api

import (
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
	jwtValidator *auth.JWTValidator,
	authEnabled bool,
	corsOrigins []string,
) *gin.Engine {
	router := gin.Default()

	// Add CORS middleware
	router.Use(middleware.CORSMiddleware(corsOrigins))

	// Add auth middleware
	router.Use(middleware.AuthMiddleware(jwtValidator, authEnabled))

	// API v1 routes
	v1 := router.Group("/api")
	{
		// Health endpoints
		v1.GET("/health", healthHandler.Health)
		v1.GET("/ready", healthHandler.Ready)
		v1.GET("/live", healthHandler.Live)

		// Hub endpoints
		hubs := v1.Group("/hubs")
		{
			hubs.GET("", hubHandler.ListHubs)
			hubs.GET("/:name", hubHandler.GetHub)
			hubs.GET("/:name/clusters", hubHandler.ListHubClusters)
			hubs.POST("/add", hubManagementHandler.AddHub)
			hubs.DELETE("/:name/remove", hubManagementHandler.RemoveHub)
			hubs.GET("/:name/spokes/:spoke/operators", spokeHandler.GetSpokeOperators)
			hubs.POST("/:name/refresh", hubHandler.RefreshHubCache)
		}

		// Policy endpoints
		policies := v1.Group("/policies")
		{
			policies.GET("/:namespace/:name/yaml", policyHandler.GetPolicyYAML)
		}

		// CGU endpoints
		cgu := v1.Group("/cgu")
		{
			cgu.POST("/create", cguHandler.CreateCGU)
		}
	}

	return router
}
