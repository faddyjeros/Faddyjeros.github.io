#!/usr/bin/env bash
# =============================================================================
# finance-app/azure-setup.sh
# One-time Azure infrastructure provisioning for the Finance App.
# Run once, then add the printed values as GitHub Secrets.
#
# Prerequisites:
#   - Azure CLI installed (https://aka.ms/installazurecli)
#   - Logged in: az login
#   - An active Azure subscription
# =============================================================================
set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────────
RESOURCE_GROUP="finance-rg"
LOCATION="northeurope"
ACR_NAME="financeregistry$(openssl rand -hex 3)"   # must be globally unique
STORAGE_ACCOUNT="financestorage$(openssl rand -hex 3)"
FILE_SHARE="finance-data"
ENVIRONMENT="finance-env"
BACKEND_APP="finance-backend"
FRONTEND_APP="finance-frontend"

echo ""
echo "======================================================"
echo "  Finance App — Azure Infrastructure Setup"
echo "======================================================"
echo "  Resource Group : $RESOURCE_GROUP"
echo "  Location       : $LOCATION"
echo "  ACR            : $ACR_NAME"
echo "  Storage        : $STORAGE_ACCOUNT"
echo ""
read -p "Continue? (y/N) " -n 1 -r
echo ""
[[ $REPLY =~ ^[Yy]$ ]] || exit 0

# ── 1. Resource Group ──────────────────────────────────────────────────────────
echo ""
echo "▶ Creating resource group..."
az group create --name "$RESOURCE_GROUP" --location "$LOCATION" --output none
echo "  ✓ $RESOURCE_GROUP"

# ── 2. Container Registry ─────────────────────────────────────────────────────
echo ""
echo "▶ Creating Container Registry..."
az acr create \
  --resource-group "$RESOURCE_GROUP" \
  --name "$ACR_NAME" \
  --sku Basic \
  --admin-enabled true \
  --output none
echo "  ✓ $ACR_NAME.azurecr.io"

ACR_LOGIN_SERVER=$(az acr show --name "$ACR_NAME" --query loginServer -o tsv)
ACR_USERNAME=$(az acr credential show --name "$ACR_NAME" --query username -o tsv)
ACR_PASSWORD=$(az acr credential show --name "$ACR_NAME" --query "passwords[0].value" -o tsv)

# ── 3. Storage Account + File Share (SQLite persistence) ──────────────────────
echo ""
echo "▶ Creating storage account and file share..."
az storage account create \
  --name "$STORAGE_ACCOUNT" \
  --resource-group "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --sku Standard_LRS \
  --output none

STORAGE_KEY=$(az storage account keys list \
  --account-name "$STORAGE_ACCOUNT" \
  --resource-group "$RESOURCE_GROUP" \
  --query "[0].value" -o tsv)

az storage share create \
  --name "$FILE_SHARE" \
  --account-name "$STORAGE_ACCOUNT" \
  --account-key "$STORAGE_KEY" \
  --output none
echo "  ✓ $STORAGE_ACCOUNT / $FILE_SHARE"

# ── 4. Container Apps Environment ─────────────────────────────────────────────
echo ""
echo "▶ Creating Container Apps environment..."
az containerapp env create \
  --name "$ENVIRONMENT" \
  --resource-group "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --output none

# Mount the Azure Files share to the environment
az containerapp env storage set \
  --name "$ENVIRONMENT" \
  --resource-group "$RESOURCE_GROUP" \
  --storage-name "finance-storage" \
  --azure-file-account-name "$STORAGE_ACCOUNT" \
  --azure-file-account-key "$STORAGE_KEY" \
  --azure-file-share-name "$FILE_SHARE" \
  --access-mode ReadWrite \
  --output none
echo "  ✓ $ENVIRONMENT"

# ── 5. Backend Container App ───────────────────────────────────────────────────
echo ""
echo "▶ Creating backend Container App (placeholder image)..."
az containerapp create \
  --name "$BACKEND_APP" \
  --resource-group "$RESOURCE_GROUP" \
  --environment "$ENVIRONMENT" \
  --image "mcr.microsoft.com/azuredocs/containerapps-helloworld:latest" \
  --target-port 8000 \
  --ingress internal \
  --registry-server "$ACR_LOGIN_SERVER" \
  --registry-username "$ACR_USERNAME" \
  --registry-password "$ACR_PASSWORD" \
  --registry-secret-name "acr-secret" \
  --env-vars "DB_PATH=/data/finance.db" \
  --cpu 0.5 --memory 1.0Gi \
  --min-replicas 0 --max-replicas 2 \
  --output none

# Attach the Azure Files volume
az containerapp update \
  --name "$BACKEND_APP" \
  --resource-group "$RESOURCE_GROUP" \
  --volume "name=finance-vol,storageType=AzureFile,storageName=finance-storage" \
  --mount "volumeName=finance-vol,mountPath=/data" \
  --output none
echo "  ✓ $BACKEND_APP (internal ingress)"

# ── 6. Frontend Container App ─────────────────────────────────────────────────
echo ""
echo "▶ Creating frontend Container App (placeholder image)..."
az containerapp create \
  --name "$FRONTEND_APP" \
  --resource-group "$RESOURCE_GROUP" \
  --environment "$ENVIRONMENT" \
  --image "mcr.microsoft.com/azuredocs/containerapps-helloworld:latest" \
  --target-port 80 \
  --ingress external \
  --registry-server "$ACR_LOGIN_SERVER" \
  --registry-username "$ACR_USERNAME" \
  --registry-password "$ACR_PASSWORD" \
  --registry-secret-name "acr-secret" \
  --env-vars "BACKEND_HOST=$BACKEND_APP" \
  --cpu 0.25 --memory 0.5Gi \
  --min-replicas 0 --max-replicas 2 \
  --output none
echo "  ✓ $FRONTEND_APP (external ingress)"

FRONTEND_FQDN=$(az containerapp show \
  --name "$FRONTEND_APP" \
  --resource-group "$RESOURCE_GROUP" \
  --query "properties.configuration.ingress.fqdn" -o tsv)

# ── 7. Service Principal for GitHub Actions ────────────────────────────────────
echo ""
echo "▶ Creating service principal for GitHub Actions..."
SUBSCRIPTION_ID=$(az account show --query id -o tsv)
SP_JSON=$(az ad sp create-for-rbac \
  --name "finance-github-actions" \
  --role contributor \
  --scopes "/subscriptions/$SUBSCRIPTION_ID/resourceGroups/$RESOURCE_GROUP" \
  --sdk-auth \
  --output json)
echo "  ✓ Service principal created"

# ── 8. Summary ────────────────────────────────────────────────────────────────
echo ""
echo "======================================================"
echo "  DONE — Add these as GitHub Secrets"
echo "  (Settings → Secrets → Actions → New secret)"
echo "======================================================"
echo ""
echo "AZURE_CREDENTIALS"
echo "$SP_JSON"
echo ""
echo "AZURE_RESOURCE_GROUP"
echo "$RESOURCE_GROUP"
echo ""
echo "ACR_LOGIN_SERVER"
echo "$ACR_LOGIN_SERVER"
echo ""
echo "ACR_USERNAME"
echo "$ACR_USERNAME"
echo ""
echo "ACR_PASSWORD"
echo "$ACR_PASSWORD"
echo ""
echo "ANTHROPIC_API_KEY"
echo "(paste your key)"
echo ""
echo "FINANCE_AUTH_USER"
echo "(choose a username)"
echo ""
echo "FINANCE_AUTH_PASS"
echo "(choose a strong password)"
echo ""
echo "======================================================"
echo "  App will be live at: https://$FRONTEND_FQDN"
echo "  Point finance.faddyjeros.com CNAME → $FRONTEND_FQDN"
echo "  (DNS: add CNAME record in your domain registrar)"
echo "======================================================"
