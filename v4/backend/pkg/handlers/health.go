package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/rhacm-global-hub-monitor/backend/pkg/models"
)

const Version = "1.0.0"

// HealthHandler handles health check requests
type HealthHandler struct{}

// NewHealthHandler creates a new health handler
func NewHealthHandler() *HealthHandler {
	return &HealthHandler{}
}

// Health godoc
// @Summary Health check
// @Description Check if the service is healthy
// @Tags health
// @Accept json
// @Produce json
// @Success 200 {object} models.HealthResponse
// @Router /api/health [get]
func (h *HealthHandler) Health(c *gin.Context) {
	c.JSON(http.StatusOK, models.HealthResponse{
		Status:    "healthy",
		Version:   Version,
		Timestamp: time.Now().Format(time.RFC3339),
	})
}

// Ready godoc
// @Summary Readiness check
// @Description Check if the service is ready to serve requests
// @Tags health
// @Accept json
// @Produce json
// @Success 200 {object} models.HealthResponse
// @Router /api/ready [get]
func (h *HealthHandler) Ready(c *gin.Context) {
	c.JSON(http.StatusOK, models.HealthResponse{
		Status:    "ready",
		Version:   Version,
		Timestamp: time.Now().Format(time.RFC3339),
	})
}

// Live godoc
// @Summary Liveness check
// @Description Check if the service is alive
// @Tags health
// @Accept json
// @Produce json
// @Success 200 {object} models.HealthResponse
// @Router /api/live [get]
func (h *HealthHandler) Live(c *gin.Context) {
	c.JSON(http.StatusOK, models.HealthResponse{
		Status:    "alive",
		Version:   Version,
		Timestamp: time.Now().Format(time.RFC3339),
	})
}
