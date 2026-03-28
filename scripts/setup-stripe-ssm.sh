#!/usr/bin/env bash
# =============================================================================
# MergeWatch Stripe SSM Parameter Setup
# =============================================================================
#
# Stores Stripe credentials and billing API secret in AWS SSM Parameter Store.
# Only required when DEPLOYMENT_MODE=saas.
#
# Usage:
#   ./scripts/setup-stripe-ssm.sh              # Setup for production (default)
#   ./scripts/setup-stripe-ssm.sh dev          # Setup for development
#
# What gets stored:
#   /mergewatch/{stage}/stripe-secret-key     — Stripe secret key
#   /mergewatch/{stage}/stripe-webhook-secret  — Stripe webhook signing secret
#   /mergewatch/{stage}/billing-api-secret     — Shared secret for dashboard → Lambda auth
#
# Security:
#   All parameters are stored as SecureString (encrypted with AWS KMS).
# =============================================================================

set -euo pipefail

STAGE="${1:-prod}"
REGION="${AWS_DEFAULT_REGION:-us-east-1}"
PROFILE="${AWS_PROFILE:-mergewatch}"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

info()   { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()   { echo -e "${YELLOW}[WARN]${NC} $*"; }
error()  { echo -e "${RED}[ERROR]${NC} $*" >&2; }
prompt() { echo -e "${CYAN}$*${NC}"; }

store_param() {
  local name="$1" value="$2" desc="$3"
  aws ssm put-parameter \
    --name "$name" \
    --type "SecureString" \
    --value "$value" \
    --overwrite \
    --region "$REGION" \
    --profile "$PROFILE" \
    --description "$desc" \
    > /dev/null
}

main() {
  echo ""
  info "MergeWatch Stripe SSM Parameter Setup"
  info "======================================"
  info "Stage:  ${STAGE}"
  info "Region: ${REGION}"
  echo ""

  if ! aws sts get-caller-identity --profile "$PROFILE" &>/dev/null; then
    error "AWS credentials not configured. Run: aws sso login --profile ${PROFILE}"
    exit 1
  fi

  local account_id
  account_id=$(aws sts get-caller-identity --profile "$PROFILE" --query 'Account' --output text)
  info "AWS Account: ${account_id}"
  echo ""

  # --- Stripe Secret Key ---
  prompt "Enter your Stripe secret key (sk_live_... or sk_test_...):"
  read -rs STRIPE_SECRET_KEY
  echo ""
  if [ -z "$STRIPE_SECRET_KEY" ]; then
    error "Stripe secret key cannot be empty."
    exit 1
  fi
  if [[ ! "$STRIPE_SECRET_KEY" =~ ^sk_(live|test)_ ]]; then
    warn "Key doesn't start with sk_live_ or sk_test_ — are you sure?"
  fi

  # --- Stripe Webhook Secret ---
  prompt "Enter your Stripe webhook signing secret (whsec_...):"
  read -rs STRIPE_WEBHOOK_SECRET
  echo ""
  if [ -z "$STRIPE_WEBHOOK_SECRET" ]; then
    error "Stripe webhook secret cannot be empty."
    exit 1
  fi

  # --- Billing API Secret ---
  # Auto-generate if not provided
  prompt "Enter a billing API secret (or press Enter to auto-generate):"
  read -rs BILLING_API_SECRET
  echo ""
  if [ -z "$BILLING_API_SECRET" ]; then
    BILLING_API_SECRET=$(openssl rand -base64 32)
    info "Auto-generated billing API secret"
  fi

  # --- Confirmation ---
  echo ""
  info "The following SSM parameters will be created/updated:"
  info "  /mergewatch/${STAGE}/stripe-secret-key      = (hidden)"
  info "  /mergewatch/${STAGE}/stripe-webhook-secret   = (hidden)"
  info "  /mergewatch/${STAGE}/billing-api-secret      = (hidden)"
  echo ""
  prompt "Proceed? (y/N)"
  read -r CONFIRM
  if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
    info "Aborted."
    exit 0
  fi

  echo ""
  info "Storing Stripe secret key..."
  store_param "/mergewatch/${STAGE}/stripe-secret-key" "$STRIPE_SECRET_KEY" "Stripe secret key (${STAGE})"

  info "Storing Stripe webhook secret..."
  store_param "/mergewatch/${STAGE}/stripe-webhook-secret" "$STRIPE_WEBHOOK_SECRET" "Stripe webhook signing secret (${STAGE})"

  info "Storing billing API secret..."
  store_param "/mergewatch/${STAGE}/billing-api-secret" "$BILLING_API_SECRET" "Dashboard-to-Lambda billing auth secret (${STAGE})"

  echo ""
  info "============================================"
  info "  Stripe SSM parameters stored!"
  info "============================================"
  info ""
  info "  Next steps:"
  info "    1. Deploy with billing enabled:"
  info "       pnpm run deploy:dev -- --parameter-overrides DeploymentMode=saas"
  info ""
  info "    2. Configure Stripe webhook endpoint:"
  info "       URL: <BillingUrl from stack outputs>/webhook"
  info "       Events: customer.updated, payment_intent.succeeded,"
  info "               payment_intent.payment_failed"
  info ""
  info "    3. Set Amplify environment variables:"
  info "       DEPLOYMENT_MODE    = saas"
  info "       BILLING_API_URL    = <BillingUrl from stack outputs>"
  info "       BILLING_API_SECRET = (the value stored above)"
  info ""
  info "    4. To retrieve the billing API secret later:"
  info "       aws ssm get-parameter --name /mergewatch/${STAGE}/billing-api-secret \\"
  info "         --with-decryption --profile ${PROFILE} --query Parameter.Value --output text"
  info ""
  info "============================================"
}

main
