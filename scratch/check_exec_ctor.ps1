Add-Type -Path "C:\Program Files\NinjaTrader 8\bin\NinjaTrader.Cbi.dll"
[NinjaTrader.Cbi.Execution].GetConstructors() | ForEach-Object { Write-Host $_.ToString() }
