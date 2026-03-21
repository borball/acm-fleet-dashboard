package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/rhacm-global-hub-monitor/backend/pkg/auth"
)

// AuthMiddleware creates an authentication middleware
func AuthMiddleware(validator *auth.JWTValidator, enabled bool) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Skip auth if disabled (for development)
		if !enabled {
			c.Next()
			return
		}

		// Skip auth for health endpoint
		if strings.HasPrefix(c.Request.URL.Path, "/api/health") {
			c.Next()
			return
		}

		// Extract token from request
		tokenString, err := auth.ExtractTokenFromRequest(c.Request)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{
				"success": false,
				"error":   "Missing or invalid authorization header",
			})
			c.Abort()
			return
		}

		// Validate token
		token, err := validator.ValidateToken(tokenString)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{
				"success": false,
				"error":   "Invalid token: " + err.Error(),
			})
			c.Abort()
			return
		}

		// Extract user info and add to context
		userInfo := auth.GetUserInfo(token)
		c.Set("user", userInfo)

		c.Next()
	}
}

// CORSMiddleware adds CORS headers
func CORSMiddleware(origins []string) gin.HandlerFunc {
	return func(c *gin.Context) {
		origin := c.Request.Header.Get("Origin")

		// Check if origin is allowed
		allowed := false
		for _, o := range origins {
			if o == "*" || o == origin {
				allowed = true
				break
			}
		}

		if allowed {
			if origin != "" {
				c.Writer.Header().Set("Access-Control-Allow-Origin", origin)
			} else if len(origins) > 0 {
				c.Writer.Header().Set("Access-Control-Allow-Origin", origins[0])
			}
		}

		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT, DELETE, PATCH")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	}
}
