---
id: F-aws-deployment
title: AWS Deployment
status: open
priority: high
parent: E-food-tracking-ai
prerequisites:
  - F-mcp-server-core-and-food-data
  - F-unit-conversion-and-meal
  - F-custom-food-storage
  - F-mcp-oauth-21-authentication
affectedFiles: {}
log: []
schema: v1.0
childrenIds: []
created: 2026-02-28T16:58:50.002Z
updated: 2026-02-28T16:58:50.002Z
---

## Purpose

Deploy the MCP server to AWS so it is accessible remotely via Streamable HTTP over HTTPS. This makes the server available to the Claude Code plugin from any device.

## Key Components

- **AWS infrastructure** -- Provision compute (ECS, Lambda, or EC2 -- decide during implementation based on simplicity and cost for single-user v1), networking, and HTTPS termination
- **HTTPS** -- TLS certificate for the server endpoint (ACM or similar)
- **SQLite persistence** -- Ensure the SQLite database file persists across deployments/restarts (EBS volume, EFS mount, or equivalent depending on compute choice)
- **Environment configuration** -- USDA API key, OAuth secrets, and any other configuration via environment variables or secrets manager
- **Infrastructure as code** -- Deployment should be reproducible (CDK, CloudFormation, Terraform, or similar)
- **Health check** -- Basic health endpoint for monitoring

## Acceptance Criteria

- MCP server is accessible at a public HTTPS URL
- Claude Code plugin can connect to the deployed server and complete the OAuth flow
- All four MCP tools function correctly on the deployed server
- SQLite data persists across server restarts/redeployments
- USDA API key and other secrets are not hardcoded or committed to the repository
- Deployment is reproducible from infrastructure-as-code definitions
- Server starts and responds within reasonable time after deployment

## Technical Notes

- Start with the simplest viable AWS deployment for a single-user system -- do not over-engineer for scale
- The specific AWS service choice (ECS, Lambda, EC2) should be made during implementation based on what best supports a long-running Node.js process with SQLite file persistence
- Lambda may complicate SQLite persistence; ECS or EC2 with an attached volume is likely simpler
- Consider a Dockerfile for the server to simplify deployment regardless of compute target

## Testing Requirements

- No automated tests -- validation is through the deployment acceptance criteria (server accessible, tools functional, data persists)