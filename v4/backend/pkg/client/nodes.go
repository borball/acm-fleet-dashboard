package client

import (
	"context"
	"fmt"

	"github.com/rhacm-global-hub-monitor/backend/pkg/models"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

var (
	// BareMetalHostGVR is the GroupVersionResource for BareMetalHost
	BareMetalHostGVR = schema.GroupVersionResource{
		Group:    "metal3.io",
		Version:  "v1alpha1",
		Resource: "baremetalhosts",
	}
)

// GetNodesForCluster fetches both Node resources and BareMetalHosts for a cluster
// It combines K8s nodes and BMH information into a unified view
func (k *KubeClient) GetNodesForCluster(ctx context.Context, namespace string) ([]models.NodeInfo, error) {
	var allNodes []models.NodeInfo

	// First, get BareMetalHost resources (hardware inventory)
	bmhList, err := k.DynamicClient.Resource(BareMetalHostGVR).Namespace(namespace).List(ctx, metav1.ListOptions{})
	if err == nil {
		for _, item := range bmhList.Items {
			node, err := convertBMHToNodeInfo(&item)
			if err != nil {
				continue
			}
			// Mark this as BMH data source
			if node.Annotations == nil {
				node.Annotations = make(map[string]string)
			}
			node.Annotations["data-source"] = "BareMetalHost"
			allNodes = append(allNodes, node)
		}
	}

	return allNodes, nil
}

// GetBareMetalHostsForNamespace fetches BareMetalHosts from a specific namespace
func (k *KubeClient) GetBareMetalHostsForNamespace(ctx context.Context, namespace string) ([]models.NodeInfo, error) {
	return k.GetNodesForCluster(ctx, namespace)
}

// convertBMHToNodeInfo converts a BareMetalHost to NodeInfo model (simplified for important info)
func convertBMHToNodeInfo(obj *unstructured.Unstructured) (models.NodeInfo, error) {
	node := models.NodeInfo{
		Name:        obj.GetName(),
		Role:        "baremetal",
		Labels:      obj.GetLabels(),
		Annotations: make(map[string]string),
		CreatedAt:   obj.GetCreationTimestamp().Time,
		Capacity:    models.ResourceList{},
		Allocatable: models.ResourceList{},
	}

	// Extract BMC address from spec
	if spec, found, _ := unstructured.NestedMap(obj.Object, "spec"); found {
		if bmc, ok := spec["bmc"].(map[string]interface{}); ok {
			if bmcAddress, ok := bmc["address"].(string); ok {
				node.Annotations["bmc-address"] = bmcAddress
			}
		}
	}

	// Extract status fields
	status, found, err := unstructured.NestedMap(obj.Object, "status")
	if err != nil || !found {
		return node, nil
	}

	// Get provisioning state and power status
	if provisioningState, ok := getNestedString(status, "provisioning", "state"); ok {
		node.Status = provisioningState
		if provisioningState == "provisioned" {
			node.Status = "Ready"
		}
	}

	if poweredOn, ok := status["poweredOn"].(bool); ok {
		if poweredOn {
			node.Annotations["power-status"] = "on"
		} else {
			node.Annotations["power-status"] = "off"
			if node.Status == "Ready" {
				node.Status = "Ready (PoweredOff)"
			}
		}
	}

	// Extract hardware info
	hardwareMap, found, _ := unstructured.NestedMap(obj.Object, "status", "hardware")
	if !found {
		return node, nil
	}

	// CPU information
	if cpu, ok := hardwareMap["cpu"].(map[string]interface{}); ok {
		// Try to get count as different types
		if count, ok := cpu["count"]; ok {
			var cpuCount int
			switch v := count.(type) {
			case float64:
				cpuCount = int(v)
			case int:
				cpuCount = v
			case int64:
				cpuCount = int(v)
			}
			if cpuCount > 0 {
				node.Capacity.CPU = fmt.Sprintf("%d cores", cpuCount)
				node.Allocatable.CPU = fmt.Sprintf("%d cores", cpuCount)
				node.Annotations["cpu-cores"] = fmt.Sprintf("%d", cpuCount)
			}
		}
		if arch, ok := cpu["arch"].(string); ok {
			node.KernelVersion = arch
			node.Annotations["cpu-arch"] = arch
		}
		if clockMHz, ok := cpu["clockMegahertz"]; ok {
			var mhz float64
			switch v := clockMHz.(type) {
			case float64:
				mhz = v
			case int:
				mhz = float64(v)
			case int64:
				mhz = float64(v)
			}
			if mhz > 0 {
				node.Annotations["cpu-clock-mhz"] = fmt.Sprintf("%.0f", mhz)
			}
		}
		if model, ok := cpu["model"].(string); ok {
			node.Annotations["cpu-model"] = model
		}
	}

	// Memory (RAM) information
	if ramMebibytes, ok := hardwareMap["ramMebibytes"]; ok {
		var ramMiB float64
		switch v := ramMebibytes.(type) {
		case float64:
			ramMiB = v
		case int:
			ramMiB = float64(v)
		case int64:
			ramMiB = float64(v)
		}
		if ramMiB > 0 {
			memoryGi := ramMiB / 1024
			node.Capacity.Memory = fmt.Sprintf("%.0fGi", memoryGi)
			node.Allocatable.Memory = fmt.Sprintf("%.0fGi", memoryGi)
		}
	}

	// Storage information
	if storage, ok := hardwareMap["storage"].([]interface{}); ok {
		totalStorageBytes := int64(0)
		diskCount := 0
		var diskDetails []string

		for _, disk := range storage {
			if diskMap, ok := disk.(map[string]interface{}); ok {
				diskCount++
				if sizeBytes, ok := diskMap["sizeBytes"]; ok {
					var bytes int64
					switch v := sizeBytes.(type) {
					case float64:
						bytes = int64(v)
					case int64:
						bytes = v
					case int:
						bytes = int64(v)
					}

					if bytes > 0 {
						totalStorageBytes += bytes
						diskType := "Unknown"
						diskModel := ""
						if dt, ok := diskMap["type"].(string); ok {
							diskType = dt
						}
						if model, ok := diskMap["model"].(string); ok {
							diskModel = model
						}
						sizeGi := float64(bytes) / (1024 * 1024 * 1024)
						diskDetails = append(diskDetails, fmt.Sprintf("%s %.0fGi (%s)", diskType, sizeGi, diskModel))
					}
				}
			}
		}

		if totalStorageBytes > 0 {
			totalGi := float64(totalStorageBytes) / (1024 * 1024 * 1024)
			node.Capacity.Storage = fmt.Sprintf("%.0fGi (%d disks)", totalGi, diskCount)
			node.Allocatable.Storage = fmt.Sprintf("%.0fGi", totalGi)
		}

		// Store disk details in annotations
		if len(diskDetails) > 0 {
			for i, detail := range diskDetails {
				node.Annotations[fmt.Sprintf("disk-%d", i+1)] = detail
			}
		}
	}

	// Network (NIC) information
	if nics, ok := hardwareMap["nics"].([]interface{}); ok {
		nicCount := len(nics)
		node.Annotations["nic-count"] = fmt.Sprintf("%d", nicCount)

		// Get primary NIC with IP
		for _, nic := range nics {
			if nicMap, ok := nic.(map[string]interface{}); ok {
				if ip, ok := nicMap["ip"].(string); ok && ip != "" {
					node.InternalIP = ip
					if mac, ok := nicMap["mac"].(string); ok {
						node.Annotations["primary-mac"] = mac
					}
					if name, ok := nicMap["name"].(string); ok {
						node.Annotations["primary-nic"] = name
					}
					break
				}
			}
		}

		// Store all MACs for reference
		var macs []string
		for _, nic := range nics {
			if nicMap, ok := nic.(map[string]interface{}); ok {
				if mac, ok := nicMap["mac"].(string); ok {
					macs = append(macs, mac)
				}
			}
		}
		if len(macs) > 0 {
			node.Annotations["all-macs"] = fmt.Sprintf("%v", macs)
		}
	}

	// System vendor info
	if systemVendor, ok := hardwareMap["systemVendor"].(map[string]interface{}); ok {
		if manufacturer, ok := systemVendor["manufacturer"].(string); ok {
			node.Annotations["manufacturer"] = manufacturer
		}
		if productName, ok := systemVendor["productName"].(string); ok {
			node.Annotations["product-name"] = productName
		}
		if serialNumber, ok := systemVendor["serialNumber"].(string); ok {
			node.Annotations["serial-number"] = serialNumber
		}
	}

	// Create simple condition
	if node.Status == "Ready" {
		node.Conditions = []models.Condition{
			{
				Type:               "Ready",
				Status:             "True",
				LastTransitionTime: node.CreatedAt,
				Reason:             "BMHProvisioned",
				Message:            "BareMetalHost is provisioned and ready",
			},
		}
	}

	return node, nil
}

// Helper function to safely get nested string
func getNestedString(obj map[string]interface{}, keys ...string) (string, bool) {
	current := obj
	for i, key := range keys {
		if i == len(keys)-1 {
			if val, ok := current[key].(string); ok {
				return val, true
			}
			return "", false
		}
		if next, ok := current[key].(map[string]interface{}); ok {
			current = next
		} else {
			return "", false
		}
	}
	return "", false
}
