#!/usr/bin/env bash
# =============================================================================
# MergeWatch Web Dashboard — SSM + Amplify Environment Setup
# =============================================================================
#
# This script stores the web dashboard secrets in SSM Parameter Store and
# then configures them as environment variables on the Amplify app.
#
# Usage:
#   ./scripts/setup-web-ssm.sh                  # production (default)
#   ./scripts/setup-web-ssm.sh staging           # staging
#   ./scripts/setup-web-ssm.sh dev               # development
#
# Prerequisites:
#   1. AWS CLI installed and configured
#   2. The MergeWatch stack deployed (./scripts/deploy.sh)
#   3. A GitHub OAuth App created at https://github.com/settings/developers
#      - Authorization callback URL: https://<amplify-url>/api/auth/callback/github
#
# What gets stored in SSM:
#   /mergewatch/{stage}/web/github-client-id      — GitHub OAuth App client ID
#   /mergewatch/{stage}/web/github-client-secret   — GitHub OAuth App client secret
#   /mergewatch/{stage}/web/nextauth-secret         — Random secret for NextAuth.js
#
# After storing in SSM, this script updates the Amplify app's environment
# variables so the Next.js app can read them at build and runtime.
# =============================================================================

set -euo pipefail

# --- Configuration ---
STAGE="${1:-prod}"
REGION="${AWS_DEFAULT_REGION:-us-west-2}"

# Derive the stack name to look up the Amplify App ID
STACK_NAME="mergewatch"
case "$STAGE" in
  staging) STACK_NAME="mergewatch-staging" ;;
  dev)     STACK_NAME="mergewatch-dev" ;;
esac

# SSM parameter paths
CLIENT_ID_PARAM="/mergewatch/${STAGE}/web/github-client-id"
CLIENT_SECRET_PARAM="/mergewatch/${STAGE}/web/github-client-secret"
NEXTAUTH_SECRET_PARAM="/mergewatch/${STAGE}/web/nextauth-secret"

# --- Color output helpers ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*" >&2; }
prompt() { echo -e "${CYAN}$*${NC}"; }

# --- Main ---
main() {
  echo ""
  info "MergeWatch Web Dashboard Setup"
  info "==============================="
  info "Stage:  ${STAGE}"
  info "Region: ${REGION}"
  echo ""

  # Verify AWS credentials
  if ! aws sts get-caller-identity &>/dev/null; then
    error "AWS credentials are not configured. Run: aws configure"
    exit 1
  fi

  # Look up the Amplify App ID from the CloudFormation stack
  local amplify_app_id
  amplify_app_id=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --query 'Stacks[0].Outputs[?OutputKey==`AmplifyAppId`].OutputValue' \
    --output text \
    --region "$REGION" 2>/dev/null || echo "")

  if [ -z "$amplify_app_id" ] || [ "$amplify_app_id" = "None" ]; then
    warn "Amplify App ID not found in stack '${STACK_NAME}'."
    warn "Make sure you deployed with GitHubRepository parameter set."
    warn "Secrets will be stored in SSM but Amplify env vars won't be updated."
    amplify_app_id=""
  else
    info "Amplify App ID: ${amplify_app_id}"
  fi

  # Look up the dashboard URL
  local dashboard_url
  dashboard_url=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --query 'Stacks[0].Outputs[?OutputKey==`DashboardUrl`].OutputValue' \
    --output text \
    --region "$REGION" 2>/dev/null || echo "https://localhost:3000")

  echo ""
  info "Your dashboard URL will be: ${dashboard_url}"
  info "Use this as the Authorization callback URL when creating your GitHub OAuth App:"
  info "  ${dashboard_url}/api/auth/callback/github"
  echo ""

  # --- GitHub OAuth Client ID ---
  prompt "Enter your GitHub OAuth App Client ID:"
  read -r GITHUB_CLIENT_ID

  if [ -z "$GITHUB_CLIENT_ID" ]; then
    error "Client ID cannot be empty."
    exit 1
  fi

  # --- GitHub OAuth Client Secret ---
  prompt "Enter your GitHub OAuth App Client Secret:"
  read -rs GITHUB_CLIENT_SECRET
  echo ""

  if [ -z "$GITHUB_CLIENT_SECRET" ]; then
    error "Client Secret cannot be empty."
    exit 1
  fi

  # --- NextAuth Secret ---
  # Generate a random secret if the user doesn't have one
  local NEXTAUTH_SECRET
  NEXTAUTH_SECRET=$(openssl rand -base64 32)
  info "Generated NextAuth secret (random 32-byte base64 string)"

  # --- Confirmation ---
  echo ""
  info "The following SSM parameters will be created/updated:"
  info "  ${CLIENT_ID_PARAM}      = ${GITHUB_CLIENT_ID}"
  info "  ${CLIENT_SECRET_PARAM}  = (hidden)"
  info "  ${NEXTAUTH_SECRET_PARAM} = (auto-generated)"
  echo ""
  prompt "Proceed? (y/N)"
  read -r CONFIRM

  if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
    info "Aborted."
    exit 0
  fi

  # --- Store parameters in SSM ---
  echo ""
  info "Storing GitHub OAuth Client ID..."
  aws ssm put-parameter \
    --name "$CLIENT_ID_PARAM" \
    --type "SecureString" \
    --value "$GITHUB_CLIENT_ID" \
    --overwrite \
    --region "$REGION" \
    --description "MergeWatch web GitHub OAuth Client ID (${STAGE})" \
    > /dev/null

  info "Storing GitHub OAuth Client Secret..."
  aws ssm put-parameter \
    --name "$CLIENT_SECRET_PARAM" \
    --type "SecureString" \
    --value "$GITHUB_CLIENT_SECRET" \
    --overwrite \
    --region "$REGION" \
    --description "MergeWatch web GitHub OAuth Client Secret (${STAGE})" \
    > /dev/null

  info "Storing NextAuth secret..."
  aws ssm put-parameter \
    --name "$NEXTAUTH_SECRET_PARAM" \
    --type "SecureString" \
    --value "$NEXTAUTH_SECRET" \
    --overwrite \
    --region "$REGION" \
    --description "MergeWatch web NextAuth.js session secret (${STAGE})" \
    > /dev/null

  # --- Update Amplify environment variables ---
  if [ -n "$amplify_app_id" ]; then
    info "Updating Amplify app environment variables..."

    aws amplify update-app \
      --app-id "$amplify_app_id" \
      --region "$REGION" \
      --environment-variables \
        "GITHUB_CLIENT_ID=${GITHUB_CLIENT_ID}" \
        "GITHUB_CLIENT_SECRET=${GITHUB_CLIENT_SECRET}" \
        "NEXTAUTH_SECRET=${NEXTAUTH_SECRET}" \
        "NEXTAUTH_URL=${dashboard_url}" \
      > /dev/null

    info "Triggering Amplify rebuild..."
    aws amplify start-job \
      --app-id "$amplify_app_id" \
      --branch-name main \
      --job-type RELEASE \
      --region "$REGION" \
      > /dev/null 2>&1 || warn "Could not trigger rebuild — you may need to push a commit or rebuild manually in the Amplify console."
  fi

  echo ""
  info "============================================"
  info "  Web dashboard secrets stored!"
  info "============================================"
  info ""
  info "  Dashboard URL: ${dashboard_url}"
  info ""
  if [ -n "$amplify_app_id" ]; then
    info "  Amplify env vars have been updated."
    info "  A rebuild has been triggered — check the Amplify console for status."
  else
    info "  To deploy the dashboard, redeploy the stack with:"
    info "    sam deploy --parameter-overrides GitHubRepository=https://github.com/your/repo GitHubAccessToken=ghp_..."
  fi
  info ""
  info "============================================"
}

main
