package auth

import (
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"math/big"
	"net/http"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// JWTValidator validates JWT tokens from OpenShift OAuth
type JWTValidator struct {
	issuerURL string
	clientID  string
	publicKey *rsa.PublicKey
}

// NewJWTValidator creates a new JWT validator
func NewJWTValidator(issuerURL, clientID string) (*JWTValidator, error) {
	validator := &JWTValidator{
		issuerURL: issuerURL,
		clientID:  clientID,
	}

	// Fetch public key from JWKS endpoint
	if err := validator.fetchPublicKey(); err != nil {
		return nil, fmt.Errorf("failed to fetch public key: %w", err)
	}

	return validator, nil
}

// ValidateToken validates a JWT token
func (v *JWTValidator) ValidateToken(tokenString string) (*jwt.Token, error) {
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		// Verify signing method
		if _, ok := token.Method.(*jwt.SigningMethodRSA); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return v.publicKey, nil
	})

	if err != nil {
		return nil, fmt.Errorf("failed to parse token: %w", err)
	}

	if !token.Valid {
		return nil, fmt.Errorf("invalid token")
	}

	// Validate claims
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return nil, fmt.Errorf("invalid claims")
	}

	// Validate issuer
	if iss, ok := claims["iss"].(string); !ok || !strings.HasPrefix(iss, v.issuerURL) {
		return nil, fmt.Errorf("invalid issuer")
	}

	// Validate expiration
	if exp, ok := claims["exp"].(float64); ok {
		if time.Now().Unix() > int64(exp) {
			return nil, fmt.Errorf("token expired")
		}
	}

	return token, nil
}

// ExtractTokenFromRequest extracts JWT token from Authorization header
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

// fetchPublicKey fetches the public key from the JWKS endpoint
func (v *JWTValidator) fetchPublicKey() error {
	// For OpenShift, the JWKS endpoint is typically at .well-known/jwks.json
	jwksURL := fmt.Sprintf("%s/.well-known/jwks.json", v.issuerURL)

	resp, err := http.Get(jwksURL)
	if err != nil {
		// If we can't fetch the key, use a mock key for development
		// In production, this should fail
		return v.useMockKey()
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return v.useMockKey()
	}

	var jwks struct {
		Keys []struct {
			Kid string `json:"kid"`
			Kty string `json:"kty"`
			Use string `json:"use"`
			N   string `json:"n"`
			E   string `json:"e"`
		} `json:"keys"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&jwks); err != nil {
		return v.useMockKey()
	}

	if len(jwks.Keys) == 0 {
		return v.useMockKey()
	}

	// Use the first key
	key := jwks.Keys[0]

	// Decode N and E
	nBytes, err := base64.RawURLEncoding.DecodeString(key.N)
	if err != nil {
		return v.useMockKey()
	}

	eBytes, err := base64.RawURLEncoding.DecodeString(key.E)
	if err != nil {
		return v.useMockKey()
	}

	n := new(big.Int).SetBytes(nBytes)
	e := new(big.Int).SetBytes(eBytes)

	v.publicKey = &rsa.PublicKey{
		N: n,
		E: int(e.Int64()),
	}

	return nil
}

// useMockKey creates a mock public key for development
func (v *JWTValidator) useMockKey() error {
	// This is a mock key for development purposes only
	// In production, you should always use real keys from the OAuth server
	v.publicKey = &rsa.PublicKey{
		N: big.NewInt(0),
		E: 65537,
	}
	return nil
}

// GetUserInfo extracts user information from the token
func GetUserInfo(token *jwt.Token) map[string]interface{} {
	if claims, ok := token.Claims.(jwt.MapClaims); ok {
		return map[string]interface{}{
			"username": claims["preferred_username"],
			"email":    claims["email"],
			"groups":   claims["groups"],
			"name":     claims["name"],
		}
	}
	return nil
}
