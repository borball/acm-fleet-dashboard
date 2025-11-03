package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/rhacm-global-hub-monitor/backend/internal/config"
	"github.com/rhacm-global-hub-monitor/backend/pkg/api"
	"github.com/rhacm-global-hub-monitor/backend/pkg/auth"
	"github.com/rhacm-global-hub-monitor/backend/pkg/cache"
	"github.com/rhacm-global-hub-monitor/backend/pkg/client"
	"github.com/rhacm-global-hub-monitor/backend/pkg/handlers"
)

func main() {
	// Load configuration
	cfg := config.LoadConfig()

	log.Printf("Starting RHACM Global Hub Monitor API Server on port %s", cfg.Port)
	log.Printf("Auth enabled: %v", cfg.EnableAuth)

	// Initialize Kubernetes client
	kubeClient, err := client.NewKubeClient(cfg.KubeConfig)
	if err != nil {
		log.Fatalf("Failed to create Kubernetes client: %v", err)
	}

	// Initialize RHACM client
	rhacmClient := client.NewRHACMClient(kubeClient)

	// Initialize JWT validator
	var jwtValidator *auth.JWTValidator
	if cfg.EnableAuth {
		jwtValidator, err = auth.NewJWTValidator(cfg.OAuthIssuerURL, cfg.OAuthClientID)
		if err != nil {
			log.Printf("Warning: Failed to create JWT validator: %v", err)
			log.Println("Continuing without authentication")
			cfg.EnableAuth = false
		}
	}

	// Create shared cache instance (30 minute TTL)
	sharedCache := cache.NewCache(30 * time.Minute)

	// Initialize handlers
	hubHandler := handlers.NewHubHandler(rhacmClient, sharedCache)
	healthHandler := handlers.NewHealthHandler()
	policyHandler := handlers.NewPolicyHandler(kubeClient, rhacmClient)
	cguHandler := handlers.NewCGUHandler(kubeClient, rhacmClient)
	hubManagementHandler := handlers.NewHubManagementHandler(kubeClient)
	spokeHandler := handlers.NewSpokeHandler(rhacmClient, kubeClient)

	// Setup router
	router := api.SetupRouter(
		hubHandler,
		healthHandler,
		policyHandler,
		cguHandler,
		hubManagementHandler,
		spokeHandler,
		jwtValidator,
		cfg.EnableAuth,
		cfg.CORSOrigins,
	)

	// Create HTTP server
	srv := &http.Server{
		Addr:         fmt.Sprintf(":%s", cfg.Port),
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Start server in a goroutine
	go func() {
		log.Printf("Server listening on :%s", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Failed to start server: %v", err)
		}
	}()

	// Wait for interrupt signal to gracefully shutdown the server
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down server...")

	// Graceful shutdown with timeout
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}

	log.Println("Server exited")
}
