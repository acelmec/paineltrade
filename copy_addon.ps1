$src = "experts\VortexGatewayAddOn.cs"
$dst = "C:\Users\Pichau\Documents\NinjaTrader 8\bin\Custom\AddOns\VortexGatewayAddOn.cs"
Copy-Item -Force -LiteralPath $src -Destination $dst
Write-Host "Copied OK"
