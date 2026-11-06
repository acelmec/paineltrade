$asm = [System.Reflection.Assembly]::LoadFrom("C:\Program Files\NinjaTrader 8\bin\System.Data.SQLite.dll")
$connType = $asm.GetType("System.Data.SQLite.SQLiteConnection")
$conn = [Activator]::CreateInstance($connType, "Data Source=C:\Users\Pichau\Documents\NinjaTrader 8\db\NinjaTrader.sqlite;Version=3;Read Only=True;")
$conn.Open()

$cmd = $conn.CreateCommand()
$cmd.CommandText = @"
SELECT e.ExecutionId, e.OrderId, e.Name, e.IsEntry, e.IsExit, e.MarketPosition, e.Price, e.Quantity, e.Time, e.Commission, m.Name, m.PointValue
FROM Executions e
LEFT JOIN Instruments i ON e.Instrument = i.Id
LEFT JOIN MasterInstruments m ON i.MasterInstrument = m.Id
WHERE e.Account = 18
ORDER BY e.Time ASC;
"@

$reader = $cmd.ExecuteReader()
$openEntries = [System.Collections.Generic.Queue[PSCustomObject]]::new()
$trades = [System.Collections.Generic.List[PSCustomObject]]::new()

while ($reader.Read()) {
    $exId = if ($reader.IsDBNull(0)) { "" } else { $reader.GetString(0) }
    $ordId = if ($reader.IsDBNull(1)) { "" } else { $reader.GetString(1) }
    $name = if ($reader.IsDBNull(2)) { "" } else { $reader.GetString(2) }
    $isEntry = if ($reader.IsDBNull(3)) { 0 } else { $reader.GetInt32(3) }
    $isExit = if ($reader.IsDBNull(4)) { 0 } else { $reader.GetInt32(4) }
    $marketPos = if ($reader.IsDBNull(5)) { 0 } else { $reader.GetInt32(5) }
    $price = if ($reader.IsDBNull(6)) { 0.0 } else { $reader.GetDouble(6) }
    $qty = if ($reader.IsDBNull(7)) { 0 } else { $reader.GetInt32(7) }
    $ticks = if ($reader.IsDBNull(8)) { 0 } else { $reader.GetInt64(8) }
    $comm = if ($reader.IsDBNull(9)) { 0.0 } else { $reader.GetDouble(9) }
    $sym = if ($reader.IsDBNull(10)) { "MNQ" } else { $reader.GetString(10) }
    $ptVal = if ($reader.IsDBNull(11)) { 2.0 } else { $reader.GetDouble(11) }

    $time = if ($ticks -gt 0) { (New-Object DateTime($ticks, [DateTimeKind]::Utc)).ToLocalTime() } else { [DateTime]::Now }

    if ($isEntry -eq 1) {
        $openEntries.Enqueue([PSCustomObject]@{
            Price = $price
            Time = $time
            Qty = $qty
            MarketPos = $marketPos
            OrderId = $ordId
            Symbol = $sym
            PointValue = $ptVal
        })
    } elseif ($isExit -eq 1 -and $openEntries.Count -gt 0) {
        $remQty = $qty
        while ($remQty -gt 0 -and $openEntries.Count -gt 0) {
            $top = $openEntries.Peek()
            $matchQty = [Math]::Min($remQty, $top.Qty)
            $pts = if ($top.MarketPos -eq 0) { $price - $top.Price } else { $top.Price - $price }
            $grossPnl = $pts * $matchQty * $top.PointValue
            $commRoundTurn = 1.90 * $matchQty
            $netPnl = $grossPnl - $commRoundTurn

            $trades.Add([PSCustomObject]@{
                tradeNumber = $trades.Count + 1
                orderId = $ordId
                symbol = $top.Symbol
                entryAction = if ($top.MarketPos -eq 0) { "BUY" } else { "SELL" }
                quantity = $matchQty
                entryPrice = $top.Price
                exitPrice = $price
                profitPoints = $pts
                profitCurrency = $netPnl
                commission = $commRoundTurn
                entryTime = $top.Time.ToString("yyyy-MM-ddTHH:mm:sszzz")
                exitTime = $time.ToString("yyyy-MM-ddTHH:mm:sszzz")
                isOpen = $false
            })

            $remQty -= $matchQty
            $top.Qty -= $matchQty
            if ($top.Qty -le 0) {
                $openEntries.Dequeue() | Out-Null
            }
        }
    }
}
$reader.Close()
$conn.Close()

Write-Host "Total reconstructed trades: $($trades.Count)"
Write-Host "JSON sample:"
$trades | Select-Object -First 3 | ConvertTo-Json
