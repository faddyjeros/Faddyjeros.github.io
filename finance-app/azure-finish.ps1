# finance-app/azure-finish.ps1
# Completes the Azure setup — run from PowerShell after the bash script got partway through.

$RESOURCE_GROUP = "finance-rg"
$ENVIRONMENT    = "finance-env"
$BACKEND_APP    = "finance-backend"
$FRONTEND_APP   = "finance-frontend"

Write-Host "`n>> Getting ACR details..." -ForegroundColor Cyan
$ACR_NAME         = az acr list --resource-group $RESOURCE_GROUP --query "[0].name" -o tsv
$ACR_LOGIN_SERVER = az acr show --name $ACR_NAME --query loginServer -o tsv
$ACR_USERNAME     = az acr credential show --name $ACR_NAME --query username -o tsv
$ACR_PASSWORD     = az acr credential show --name $ACR_NAME --query "passwords[0].value" -o tsv
Write-Host "   ACR: $ACR_LOGIN_SERVER" -ForegroundColor Green

Write-Host "`n>> Creating backend Container App..." -ForegroundColor Cyan
az containerapp create `
  --name $BACKEND_APP `
  --resource-group $RESOURCE_GROUP `
  --environment $ENVIRONMENT `
  --image "mcr.microsoft.com/azuredocs/containerapps-helloworld:latest" `
  --target-port 8000 `
  --ingress internal `
  --registry-server $ACR_LOGIN_SERVER `
  --registry-username $ACR_USERNAME `
  --registry-password $ACR_PASSWORD `
  --registry-secret-name "acr-secret" `
  --env-vars "DB_PATH=/data/finance.db" `
  --cpu 0.5 --memory 1.0Gi `
  --min-replicas 0 --max-replicas 2
Write-Host "   finance-backend created" -ForegroundColor Green

Write-Host "`n>> Creating frontend Container App..." -ForegroundColor Cyan
az containerapp create `
  --name $FRONTEND_APP `
  --resource-group $RESOURCE_GROUP `
  --environment $ENVIRONMENT `
  --image "mcr.microsoft.com/azuredocs/containerapps-helloworld:latest" `
  --target-port 80 `
  --ingress external `
  --registry-server $ACR_LOGIN_SERVER `
  --registry-username $ACR_USERNAME `
  --registry-password $ACR_PASSWORD `
  --registry-secret-name "acr-secret" `
  --env-vars "BACKEND_HOST=$BACKEND_APP" `
  --cpu 0.25 --memory 0.5Gi `
  --min-replicas 0 --max-replicas 2
Write-Host "   finance-frontend created" -ForegroundColor Green

Write-Host "`n>> Creating GitHub Actions service principal..." -ForegroundColor Cyan
$SUBSCRIPTION_ID = az account show --query id -o tsv
$SP_JSON = az ad sp create-for-rbac `
  --name "finance-github-actions" `
  --role contributor `
  --scopes "/subscriptions/$SUBSCRIPTION_ID/resourceGroups/$RESOURCE_GROUP" `
  --sdk-auth
Write-Host "   Service principal created" -ForegroundColor Green

$FRONTEND_FQDN = az containerapp show `
  --name $FRONTEND_APP `
  --resource-group $RESOURCE_GROUP `
  --query "properties.configuration.ingress.fqdn" -o tsv

Write-Host "`n============================================" -ForegroundColor Yellow
Write-Host "  ADD THESE AS GITHUB SECRETS" -ForegroundColor Yellow
Write-Host "============================================" -ForegroundColor Yellow
Write-Host "AZURE_CREDENTIALS`n$SP_JSON" -ForegroundColor White
Write-Host "`nAZURE_RESOURCE_GROUP`n$RESOURCE_GROUP" -ForegroundColor White
Write-Host "`nACR_LOGIN_SERVER`n$ACR_LOGIN_SERVER" -ForegroundColor White
Write-Host "`nACR_USERNAME`n$ACR_USERNAME" -ForegroundColor White
Write-Host "`nACR_PASSWORD`n$ACR_PASSWORD" -ForegroundColor White
Write-Host "`nANTHROPIC_API_KEY`n(paste your key)" -ForegroundColor White
Write-Host "`nFINANCE_AUTH_USER`n(pick a username)" -ForegroundColor White
Write-Host "`nFINANCE_AUTH_PASS`n(pick a password)" -ForegroundColor White
Write-Host "`n============================================" -ForegroundColor Yellow
Write-Host "  App URL (placeholder): https://$FRONTEND_FQDN" -ForegroundColor Green
Write-Host "  Point finance.faddyjeros.com CNAME -> $FRONTEND_FQDN" -ForegroundColor Green
Write-Host "============================================`n" -ForegroundColor Yellow
