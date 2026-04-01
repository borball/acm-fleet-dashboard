package client

import (
	"crypto/tls"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"

	"sigs.k8s.io/yaml"
)

// RefreshOAuthToken exchanges username/password for a fresh OAuth bearer token
func RefreshOAuthToken(apiEndpoint, username, password string) (string, error) {
	httpClient := &http.Client{
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
		},
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}

	// Discover OAuth endpoint
	wellKnownURL := strings.TrimRight(apiEndpoint, "/") + "/.well-known/oauth-authorization-server"
	resp, err := httpClient.Get(wellKnownURL)
	if err != nil {
		return "", fmt.Errorf("OAuth discovery failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("OAuth metadata endpoint returned status %d", resp.StatusCode)
	}

	var metadata struct {
		AuthorizationEndpoint string `json:"authorization_endpoint"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&metadata); err != nil {
		return "", fmt.Errorf("failed to parse OAuth metadata: %w", err)
	}
	if metadata.AuthorizationEndpoint == "" {
		return "", fmt.Errorf("no authorization_endpoint in OAuth metadata")
	}

	// Exchange credentials for token
	oauthURL := metadata.AuthorizationEndpoint + "?response_type=token&client_id=openshift-challenging-client"
	req, err := http.NewRequest("GET", oauthURL, nil)
	if err != nil {
		return "", fmt.Errorf("failed to create OAuth request: %w", err)
	}
	req.SetBasicAuth(username, password)
	req.Header.Set("X-CSRF-Token", "1")

	resp2, err := httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("OAuth request failed: %w", err)
	}
	defer resp2.Body.Close()

	if resp2.StatusCode == http.StatusUnauthorized {
		return "", fmt.Errorf("invalid credentials (401 Unauthorized)")
	}
	if resp2.StatusCode != http.StatusFound {
		return "", fmt.Errorf("unexpected OAuth response status: %d", resp2.StatusCode)
	}

	location := resp2.Header.Get("Location")
	if location == "" {
		return "", fmt.Errorf("no Location header in OAuth response")
	}

	u, err := url.Parse(location)
	if err != nil {
		return "", fmt.Errorf("failed to parse OAuth redirect URL: %w", err)
	}

	fragment, err := url.ParseQuery(u.Fragment)
	if err != nil {
		return "", fmt.Errorf("failed to parse OAuth fragment: %w", err)
	}

	token := fragment.Get("access_token")
	if token == "" {
		return "", fmt.Errorf("no access_token in OAuth response fragment")
	}

	return token, nil
}

// GenerateKubeconfig creates a kubeconfig YAML from API endpoint and token
func GenerateKubeconfig(clusterName, apiEndpoint, token string) []byte {
	userName := clusterName + "-admin"
	contextName := clusterName + "-context"

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
				"user": map[string]interface{}{
					"token": token,
				},
			},
		},
	}

	data, _ := yaml.Marshal(kubeconfig)
	return data
}
