.PHONY: help build test clean run docker-build docker-push lint

# Variables
APP_NAME=rhacm-monitor
VERSION?=latest
REGISTRY?=quay.io
IMAGE?=$(REGISTRY)/$(APP_NAME):$(VERSION)
GO_FILES=$(shell find . -name '*.go' -not -path "./vendor/*")

help: ## Display this help
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n"} /^[a-zA-Z_-]+:.*?##/ { printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2 } /^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) } ' $(MAKEFILE_LIST)

##@ Development

build: ## Build the application
	cd cmd/server && CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o ../../bin/server

run: ## Run the application locally
	cd cmd/server && go run main.go

test: ## Run tests
	go test -v -race -coverprofile=coverage.out ./...

coverage: test ## Show test coverage
	go tool cover -html=coverage.out

lint: ## Run linter
	golangci-lint run ./...

clean: ## Clean build artifacts
	rm -rf bin/
	rm -f coverage.out

deps: ## Download dependencies
	go mod download
	go mod tidy

##@ Docker

docker-build: ## Build Docker image
	docker build -t $(IMAGE) -f ../deployment/docker/Dockerfile .

docker-push: docker-build ## Push Docker image
	docker push $(IMAGE)

##@ Utilities

fmt: ## Format code
	gofmt -s -w $(GO_FILES)

vet: ## Run go vet
	go vet ./...

