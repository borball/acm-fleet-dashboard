package models

import "time"

// GlobalHub represents the global hub cluster where the monitor is deployed
type GlobalHub struct {
	Name              string        `json:"name"`
	ClusterID         string        `json:"clusterID"`
	Version           string        `json:"version"`
	OpenshiftVersion  string        `json:"openshiftVersion"`
	Platform          string        `json:"platform"`
	NodeCount         int           `json:"nodeCount"`
	RHACMInstalled    bool          `json:"rhacmInstalled"`
	ManagedHubCount   int           `json:"managedHubCount"`
	SpokeCount        int           `json:"spokeCount"`
	PolicyCount       int           `json:"policyCount"`
	OperatorCount     int           `json:"operatorCount"`
	Topology          *HubTopology  `json:"topology,omitempty"`
	CreatedAt         time.Time     `json:"createdAt"`
}

// HubTopology represents the hub-spoke topology
type HubTopology struct {
	Hubs []HubNode `json:"hubs"`
}

// HubNode represents a managed hub in the topology
type HubNode struct {
	Name         string      `json:"name"`
	Status       string      `json:"status"`
	SpokeCount   int         `json:"spokeCount"`
	Spokes       []SpokeNode `json:"spokes"`
	IsManaged    bool        `json:"isManaged"`
}

// SpokeNode represents a spoke cluster in the topology
type SpokeNode struct {
	Name   string `json:"name"`
	Status string `json:"status"`
	Hub    string `json:"hub"`
}

// EnvironmentInfo contains information about the cluster environment
type EnvironmentInfo struct {
	IsOpenShift    bool   `json:"isOpenShift"`
	HasRHACM       bool   `json:"hasRHACM"`
	ClusterName    string `json:"clusterName"`
	Version        string `json:"version"`
}




