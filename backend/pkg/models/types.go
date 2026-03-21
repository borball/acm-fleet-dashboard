package models

import "time"

// ManagedHub represents a managed RHACM hub cluster
type ManagedHub struct {
	Name            string            `json:"name"`
	Namespace       string            `json:"namespace"`
	Status          string            `json:"status"`
	Version         string            `json:"version"`
	Conditions      []Condition       `json:"conditions"`
	ClusterInfo     ClusterInfo       `json:"clusterInfo"`
	NodesInfo       []NodeInfo        `json:"nodesInfo"`
	PoliciesInfo    []PolicyInfo      `json:"policiesInfo"`
	OperatorsInfo   []OperatorInfo    `json:"operatorsInfo"`
	ManagedClusters []ManagedCluster  `json:"managedClusters"`
	Labels          map[string]string `json:"labels"`
	Annotations     map[string]string `json:"annotations"`
	CreatedAt       time.Time         `json:"createdAt"`
}

// ManagedCluster represents a managed spoke cluster (SNO)
type ManagedCluster struct {
	Name          string            `json:"name"`
	Namespace     string            `json:"namespace"`
	Status        string            `json:"status"`
	Version       string            `json:"version"`
	Conditions    []Condition       `json:"conditions"`
	ClusterInfo   ClusterInfo       `json:"clusterInfo"`
	NodesInfo     []NodeInfo        `json:"nodesInfo"`
	PoliciesInfo  []PolicyInfo      `json:"policiesInfo"`
	OperatorsInfo []OperatorInfo    `json:"operatorsInfo"`
	Labels        map[string]string `json:"labels"`
	Annotations   map[string]string `json:"annotations"`
	HubName       string            `json:"hubName"`
	CreatedAt     time.Time         `json:"createdAt"`
}

// ClusterInfo represents basic cluster information
type ClusterInfo struct {
	ClusterID         string    `json:"clusterID"`
	KubernetesVersion string    `json:"kubernetesVersion"`
	Platform          string    `json:"platform"`
	Region            string    `json:"region"`
	OpenshiftVersion  string    `json:"openshiftVersion"`
	ConsoleURL        string    `json:"consoleURL"`
	GitOpsURL         string    `json:"gitopsURL"`
	APIURL            string    `json:"apiURL"`
	NetworkType       string    `json:"networkType"`
	CreatedAt         time.Time `json:"createdAt"`
}

// NodeInfo represents node information
type NodeInfo struct {
	Name             string            `json:"name"`
	Status           string            `json:"status"`
	Role             string            `json:"role"`
	InternalIP       string            `json:"internalIP"`
	ExternalIP       string            `json:"externalIP"`
	KernelVersion    string            `json:"kernelVersion"`
	OSImage          string            `json:"osImage"`
	ContainerRuntime string            `json:"containerRuntime"`
	KubeletVersion   string            `json:"kubeletVersion"`
	Conditions       []Condition       `json:"conditions"`
	Capacity         ResourceList      `json:"capacity"`
	Allocatable      ResourceList      `json:"allocatable"`
	Labels           map[string]string `json:"labels"`
	Annotations      map[string]string `json:"annotations"`
	CreatedAt        time.Time         `json:"createdAt"`
}

// PolicyInfo represents policy information
type PolicyInfo struct {
	Name              string            `json:"name"`
	Namespace         string            `json:"namespace"`
	RemediationAction string            `json:"remediationAction"`
	ComplianceState   string            `json:"complianceState"`
	Severity          string            `json:"severity"`
	Categories        []string          `json:"categories"`
	Standards         []string          `json:"standards"`
	Controls          []string          `json:"controls"`
	Violations        int               `json:"violations"`
	PlacementRules    []string          `json:"placementRules"`
	Disabled          bool              `json:"disabled"`
	Labels            map[string]string `json:"labels"`
	Annotations       map[string]string `json:"annotations"`
	CreatedAt         time.Time         `json:"createdAt"`
}

// OperatorInfo represents operator information
type OperatorInfo struct {
	Name        string    `json:"name"`
	DisplayName string    `json:"displayName"`
	Version     string    `json:"version"`
	Namespace   string    `json:"namespace"`
	Phase       string    `json:"phase"`
	Provider    string    `json:"provider"`
	CreatedAt   time.Time `json:"createdAt"`
}

// Condition represents a kubernetes condition
type Condition struct {
	Type               string    `json:"type"`
	Status             string    `json:"status"`
	LastTransitionTime time.Time `json:"lastTransitionTime"`
	Reason             string    `json:"reason"`
	Message            string    `json:"message"`
}

// ResourceList represents compute resources
type ResourceList struct {
	CPU              string `json:"cpu"`
	Memory           string `json:"memory"`
	Storage          string `json:"storage"`
	EphemeralStorage string `json:"ephemeralStorage"`
	Pods             string `json:"pods"`
}

// APIResponse represents a generic API response
type APIResponse struct {
	Success bool        `json:"success"`
	Message string      `json:"message,omitempty"`
	Data    interface{} `json:"data,omitempty"`
	Error   string      `json:"error,omitempty"`
}

// HealthResponse represents health check response
type HealthResponse struct {
	Status    string `json:"status"`
	Version   string `json:"version"`
	Timestamp string `json:"timestamp"`
}
