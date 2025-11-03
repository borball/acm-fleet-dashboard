package config

import (
	"os"
	"strconv"
)

// Config holds the application configuration
type Config struct {
	Port              string
	KubeConfig        string
	EnableAuth        bool
	OAuthIssuerURL    string
	OAuthClientID     string
	OAuthClientSecret string
	LogLevel          string
	CORSOrigins       []string
}

// LoadConfig loads configuration from environment variables
func LoadConfig() *Config {
	enableAuth := true
	if val := os.Getenv("ENABLE_AUTH"); val != "" {
		enableAuth, _ = strconv.ParseBool(val)
	}

	return &Config{
		Port:              getEnv("PORT", "8080"),
		KubeConfig:        getEnv("KUBECONFIG", ""),
		EnableAuth:        enableAuth,
		OAuthIssuerURL:    getEnv("OAUTH_ISSUER_URL", "https://kubernetes.default.svc"),
		OAuthClientID:     getEnv("OAUTH_CLIENT_ID", "rhacm-monitor"),
		OAuthClientSecret: getEnv("OAUTH_CLIENT_SECRET", ""),
		LogLevel:          getEnv("LOG_LEVEL", "info"),
		CORSOrigins: []string{
			getEnv("CORS_ORIGIN", "*"),
		},
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
