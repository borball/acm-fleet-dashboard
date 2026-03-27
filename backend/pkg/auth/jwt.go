package auth

import (
	"crypto/tls"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"
)

// TokenValidator validates OpenShift OAuth bearer tokens
type TokenValidator struct {
	apiServerURL string
	httpClient   *http.Client
	cache        sync.Map // token -> cachedUser
}

type cachedUser struct {
	info      map[string]interface{}
	expiresAt time.Time
}

// NewTokenValidator creates a new OpenShift token validator
func NewTokenValidator(apiServerURL string) *TokenValidator {
	return &TokenValidator{
		apiServerURL: strings.TrimRight(apiServerURL, "/"),
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
			Transport: &http.Transport{
				TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
			},
		},
	}
}

// ValidateToken validates an OpenShift bearer token by calling the user API
func (v *TokenValidator) ValidateToken(token string) (map[string]interface{}, error) {
	// Check cache first
	if cached, ok := v.cache.Load(token); ok {
		cu := cached.(*cachedUser)
		if time.Now().Before(cu.expiresAt) {
			return cu.info, nil
		}
		v.cache.Delete(token)
	}

	// Call OpenShift user API to validate token
	req, err := http.NewRequest("GET", v.apiServerURL+"/apis/user.openshift.io/v1/users/~", nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := v.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to validate token: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
		return nil, fmt.Errorf("invalid or expired token")
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("unexpected status from user API: %d", resp.StatusCode)
	}

	var user struct {
		Metadata struct {
			Name string `json:"name"`
		} `json:"metadata"`
		FullName string   `json:"fullName"`
		Groups   []string `json:"groups"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&user); err != nil {
		return nil, fmt.Errorf("failed to decode user info: %w", err)
	}

	info := map[string]interface{}{
		"username": user.Metadata.Name,
		"name":     user.FullName,
		"groups":   user.Groups,
	}

	// Cache for 5 minutes
	v.cache.Store(token, &cachedUser{
		info:      info,
		expiresAt: time.Now().Add(5 * time.Minute),
	})

	return info, nil
}

// ExtractTokenFromRequest extracts bearer token from Authorization header
func ExtractTokenFromRequest(r *http.Request) (string, error) {
	authHeader := r.Header.Get("Authorization")
	if authHeader == "" {
		return "", fmt.Errorf("no authorization header")
	}

	parts := strings.SplitN(authHeader, " ", 2)
	if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
		return "", fmt.Errorf("invalid authorization header format")
	}

	return parts[1], nil
}
