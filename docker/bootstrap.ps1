PARAM(
  [string]$Tag = "24.0",
  [string]$Name = "centralgauge",
  [string]$MemoryLimit = "8G"
)

Write-Host "Setting up Business Central container for CentralGauge..." -ForegroundColor Green
Write-Host "Container: $Name" -ForegroundColor Yellow
Write-Host "BC Version: $Tag" -ForegroundColor Yellow
Write-Host "Memory Limit: $MemoryLimit" -ForegroundColor Yellow

# Check if bccontainerhelper is available
if (-not (Get-Module -ListAvailable -Name bccontainerhelper)) {
    Write-Host "Installing bccontainerhelper module..." -ForegroundColor Blue
    Install-Module bccontainerhelper -Force -AllowClobber
}

Import-Module bccontainerhelper

# Remove existing container if it exists
if (Get-BcContainer -containerName $Name -ErrorAction SilentlyContinue) {
    Write-Host "Removing existing container: $Name" -ForegroundColor Yellow
    Remove-BcContainer -containerName $Name
}

# Create new container
Write-Host "Creating Business Central container..." -ForegroundColor Blue
New-BcContainer `
    -containerName $Name `
    -bcVersion $Tag `
    -accept_eula `
    -includeAL `
    -includeTestToolkit `
    -auth NavUserPassword `
    -memoryLimit $MemoryLimit `
    -accept_outdated `
    -updateHosts

Write-Host "Container setup complete!" -ForegroundColor Green
Write-Host "Container name: $Name" -ForegroundColor Cyan
Write-Host "You can now run AL compilation and tests within this container." -ForegroundColor Cyan