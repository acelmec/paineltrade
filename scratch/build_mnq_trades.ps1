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
        ExecId = $reader.GetString(1)
        OrderId = if ($reader.IsDBNull(2)) { "" } else { $reader.GetString(2) }
        Name = if ($reader.IsDBNull(3)) { "" } else { $reader.GetString(3) }
        IsEntry = $reader.GetInt32(4)
        IsExit = $reader.GetInt32(5)
        MarketPos = $reader.GetInt32(6) # 0=Long, 1=Short
        Price = $reader.GetDouble(7)
        Qty = $reader.GetInt32(8)
        Time = $dt
        Comm = $reader.GetDouble(10)
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
            OrderId = $ex.OrderId
            Name = $ex.Name
        })
    } elseif ($ex.IsExit -eq 1 -and $openEntries.Count -gt 0) {
        $remQty = $ex.Qty
        while ($remQty -gt 0 -and $openEntries.Count -gt 0) {
            $top = $openEntries.Peek()
            $matchQty = [Math]::Min($remQty, $top.Qty)

            $pts = if ($top.MarketPos -eq 0) { $ex.Price - $top.Price } else { $top.Price - $ex.Price }
            $grossPnl = $pts * $matchQty * $pointValue
            
            # Taxa da corretora do print do NinjaTrader:
            # $3.80 por 2 contratos = $1.90 por contrato round-turn
            $commRoundTurn = 1.90 * $matchQty
            $netPnl = $grossPnl - $commRoundTurn

            $trades.Add([PSCustomObject]@{
                Num = $trades.Count + 1
                Data = $ex.Time.ToString("dd/MM/yyyy")
                HoraEntrada = $top.Time.ToString("HH:mm:ss")
                HoraSaida = $ex.Time.ToString("HH:mm:ss")
                Posicao = if ($top.MarketPos -eq 0) { "Comprada" } else { "Vendida" }
                Qtd = $matchQty
                PrecoEntr = $top.Price
                PrecoSaid = $ex.Price
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

Write-Host "Total de trades MNQ reconstruidos: $($trades.Count)"

# Resumo por Dia
$daily = $trades | Group-Object Data
Write-Host "`n=== RESUMO POR DIA (SETEMBRO 2026) ==="
$totGross = 0; $totNet = 0; $totComm = 0; $totTrades = 0
foreach ($g in $daily) {
    $dGross = ($g.Group | Measure-Object -Property Gross -Sum).Sum
    $dNet = ($g.Group | Measure-Object -Property Net -Sum).Sum
    $dComm = ($g.Group | Measure-Object -Property Comiss -Sum).Sum
    $totGross += $dGross; $totNet += $dNet; $totComm += $dComm; $totTrades += $g.Count
    Write-Host "$($g.Name) -> Trades: $($g.Count) | Bruto: US$ $($dGross.ToString('F2')) | Comiss: US$ $($dComm.ToString('F2')) | Liquido: US$ $($dNet.ToString('F2'))"
}

Write-Host "`n=== TOTAL GERAL DO PERIODO ==="
Write-Host "Trades: $totTrades"
Write-Host "PnL Bruto Total:   US$ $($totGross.ToString('F2'))"
Write-Host "Comissoes Totais:  US$ $($totComm.ToString('F2'))"
Write-Host "PnL Liquido Total: US$ $($totNet.ToString('F2'))"

Write-Host "`n=== TODOS OS $($trades.Count) TRADES ==="
$trades | Format-Table Num, Data, HoraEntrada, HoraSaida, Posicao, Qtd, PrecoEntr, PrecoSaid, Gross, Comiss, Net
