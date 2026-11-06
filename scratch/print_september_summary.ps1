Add-Type -Path "C:\Program Files\NinjaTrader 8\bin\System.Data.SQLite.dll"
$con = New-Object System.Data.SQLite.SQLiteConnection("Data Source=C:\Users\Pichau\Documents\NinjaTrader 8\db\NinjaTrader.sqlite;Version=3;Read Only=True;")
$con.Open()

$cmd = $con.CreateCommand()
$cmd.CommandText = "SELECT Id FROM Accounts WHERE Name = 'FFFUNDED478338';"
$accId = [int]$cmd.ExecuteScalar()

$cmd.CommandText = "SELECT Id, ExecutionId, OrderId, Name, IsEntry, IsExit, MarketPosition, Price, Quantity, Time, Commission FROM Executions WHERE Account = $accId AND Instrument = 699839150768054 ORDER BY Time ASC;"
$reader = $cmd.ExecuteReader()
$execs = @()
while ($reader.Read()) {
    $ticks = $reader.GetInt64(9)
    $dt = (New-Object DateTime($ticks, [DateTimeKind]::Utc)).ToLocalTime()
    $execs += [PSCustomObject]@{
        Id = $reader.GetInt32(0)
        IsEntry = $reader.GetInt32(4)
        IsExit = $reader.GetInt32(5)
        MarketPos = $reader.GetInt32(6)
        Price = $reader.GetDouble(7)
        Qty = $reader.GetInt32(8)
        Time = $dt
    }
}
$reader.Close()
$con.Close()

$openEntries = [System.Collections.Generic.Queue[PSCustomObject]]::new()
$trades = [System.Collections.Generic.List[PSCustomObject]]::new()
$pointValue = 2.0 # MNQ

foreach ($ex in $execs) {
    if ($ex.IsEntry -eq 1) {
        $openEntries.Enqueue([PSCustomObject]@{
            Price = $ex.Price
            Time = $ex.Time
            Qty = $ex.Qty
            MarketPos = $ex.MarketPos
        })
    } elseif ($ex.IsExit -eq 1 -and $openEntries.Count -gt 0) {
        $remQty = $ex.Qty
        while ($remQty -gt 0 -and $openEntries.Count -gt 0) {
            $top = $openEntries.Peek()
            $matchQty = [Math]::Min($remQty, $top.Qty)
            $pts = if ($top.MarketPos -eq 0) { $ex.Price - $top.Price } else { $top.Price - $ex.Price }
            $grossPnl = $pts * $matchQty * $pointValue
            
            # Comissao exata do NinjaTrader para FFFUNDED478338 (MNQ): $1.90 por contrato redondo
            $commRoundTurn = 1.90 * $matchQty
            $netPnl = $grossPnl - $commRoundTurn

            $trades.Add([PSCustomObject]@{
                Data = $ex.Time.ToString("dd/MM/yyyy")
                Time = $ex.Time
                Gross = $grossPnl
                Comiss = $commRoundTurn
                Net = $netPnl
            })

            $remQty -= $matchQty
            $top.Qty -= $matchQty
            if ($top.Qty -le 0) {
                $openEntries.Dequeue() | Out-Null
            }
        }
    }
}

$daily = $trades | Group-Object Data
Write-Host "=== RESUMO DETALHADO POR DIA NO MES DE SETEMBRO ==="
$totGross = 0; $totNet = 0; $totComm = 0; $totWins = 0; $totLoss = 0
foreach ($g in $daily) {
    $dGross = ($g.Group | Measure-Object -Property Gross -Sum).Sum
    $dNet = ($g.Group | Measure-Object -Property Net -Sum).Sum
    $dComm = ($g.Group | Measure-Object -Property Comiss -Sum).Sum
    $w = ($g.Group | Where-Object { $_.Net -gt 0 }).Count
    $l = ($g.Group | Where-Object { $_.Net -lt 0 }).Count
    $totGross += $dGross; $totNet += $dNet; $totComm += $dComm; $totWins += $w; $totLoss += $l
    Write-Host ("Data: " + $g.Name + " | Trades: " + $g.Count.ToString().PadLeft(2) + " (" + $w + "W/" + $l + "L) | Bruto: US$ " + $dGross.ToString("F2").PadLeft(9) + " | Comiss: US$ " + $dComm.ToString("F2").PadLeft(6) + " | Liquido: US$ " + $dNet.ToString("F2").PadLeft(9))
}

Write-Host ""
Write-Host ("TOTAL DE TRADES NO PERIODO: " + $trades.Count + " (" + $totWins + " Vitorias / " + $totLoss + " Derrotas)")
Write-Host ("Taxa de Acerto (Win Rate):  " + [Math]::Round(($totWins / $trades.Count) * 100, 1) + "%")
Write-Host ("PnL Bruto Total:           US$ " + $totGross.ToString("F2"))
Write-Host ("Total Comissoes:           US$ " + $totComm.ToString("F2"))
Write-Host ("PnL Liquido Total:         US$ " + $totNet.ToString("F2"))
