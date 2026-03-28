#!/usr/bin/env bash
# =============================================================================
# MergeWatch SSM Parameter Store Setup
# =============================================================================
#
# This script populates AWS SSM Parameter Store with the GitHub App credentials
# that MergeWatch needs to authenticate with GitHub.
#
# Usage:
#   ./scripts/setup-ssm.sh              # Setup for production (default)
#   ./scripts/setup-ssm.sh staging      # Setup for staging
#   ./scripts/setup-ssm.sh dev          # Setup for development
#
# What gets stored in SSM:
#   /mergewatch/{stage}/github-app-id        — Your GitHub App's numeric ID
#   /mergewatch/{stage}/github-private-key   — PEM private key for the GitHub App
#   /mergewatch/{stage}/github-webhook-secret — Webhook secret for signature verification
#
# Security:
#   - All parameters are stored as SecureString (encrypted with AWS KMS)
#   - Lambda functions read these at runtime via the AWS SDK
#   - No secrets are ever stored in environment variables, code, or config files
#
# Prerequisites:
#   1. AWS CLI installed and configured
#   2. A GitHub App created at https://github.com/settings/apps
#   3. The GitHub App's private key (.pem file) downloaded
# =============================================================================

set -euo pipefail

# --- Configuration ---
STAGE="${1:-prod}"
REGION="${AWS_DEFAULT_REGION:-us-west-2}"

# SSM parameter paths (must match the paths in template.yaml)
APP_ID_PARAM="/mergewatch/${STAGE}/github-app-id"
PRIVATE_KEY_PARAM="/mergewatch/${STAGE}/github-private-key"
WEBHOOK_SECRET_PARAM="/mergewatch/${STAGE}/github-webhook-secret"

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
  info "MergeWatch SSM Parameter Setup"
  info "=============================="
  info "Stage:  ${STAGE}"
  info "Region: ${REGION}"
  echo ""

  # Verify AWS credentials
  if ! aws sts get-caller-identity &>/dev/null; then
    error "AWS credentials are not configured. Run: aws configure"
    exit 1
  fi

  local account_id
  account_id=$(aws sts get-caller-identity --query 'Account' --output text)
  info "AWS Account: ${account_id}"
  echo ""

  # --- GitHub App ID ---
  prompt "Enter your GitHub App ID (numeric, found on the App settings page):"
  read -r GITHUB_APP_ID

  if [ -z "$GITHUB_APP_ID" ]; then
    error "GitHub App ID cannot be empty."
    exit 1
  fi

  # --- GitHub Private Key ---
  prompt "Enter the path to your GitHub App private key (.pem file):"
  read -r PEM_FILE_PATH

  # Expand ~ to home directory
  PEM_FILE_PATH="${PEM_FILE_PATH/#\~/$HOME}"

  if [ ! -f "$PEM_FILE_PATH" ]; then
    error "File not found: ${PEM_FILE_PATH}"
    exit 1
  fi

  GITHUB_PRIVATE_KEY=$(cat "$PEM_FILE_PATH")

  # --- GitHub Webhook Secret ---
  prompt "Enter your GitHub webhook secret (the secret you configured in the App settings):"
  read -rs GITHUB_WEBHOOK_SECRET  # -s for silent input (no echo)
  echo ""  # Newline after silent input

  if [ -z "$GITHUB_WEBHOOK_SECRET" ]; then
    error "Webhook secret cannot be empty."
    exit 1
  fi

  # --- Confirmation ---
  echo ""
  info "The following SSM parameters will be created/updated:"
  info "  ${APP_ID_PARAM}         = ${GITHUB_APP_ID}"
  info "  ${PRIVATE_KEY_PARAM}    = (PEM file: ${PEM_FILE_PATH})"
  info "  ${WEBHOOK_SECRET_PARAM} = (hidden)"
  echo ""
  prompt "Proceed? (y/N)"
  read -r CONFIRM

  if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
    info "Aborted."
    exit 0
  fi

  # --- Store parameters ---
  echo ""
  info "Storing GitHub App ID..."
  aws ssm put-parameter \
    --name "$APP_ID_PARAM" \
    --type "SecureString" \
    --value "$GITHUB_APP_ID" \
    --overwrite \
    --region "$REGION" \
    --description "MergeWatch GitHub App ID (${STAGE})" \
    > /dev/null

  info "Storing GitHub private key..."
  aws ssm put-parameter \
    --name "$PRIVATE_KEY_PARAM" \
    --type "SecureString" \
    --value "$GITHUB_PRIVATE_KEY" \
    --overwrite \
    --region "$REGION" \
    --description "MergeWatch GitHub App private key (${STAGE})" \
    > /dev/null

  info "Storing GitHub webhook secret..."
  aws ssm put-parameter \
    --name "$WEBHOOK_SECRET_PARAM" \
    --type "SecureString" \
    --value "$GITHUB_WEBHOOK_SECRET" \
    --overwrite \
    --region "$REGION" \
    --description "MergeWatch GitHub webhook secret (${STAGE})" \
    > /dev/null

  echo ""
  info "============================================"
  info "  SSM parameters stored successfully!"
  info "============================================"
  info ""
  info "  You can now deploy MergeWatch:"
  info "    ./scripts/deploy.sh ${STAGE}"
  info ""
  info "  To verify parameters were stored:"
  info "    aws ssm get-parameter --name ${APP_ID_PARAM} --with-decryption"
  info ""
  info "============================================"
}

main
