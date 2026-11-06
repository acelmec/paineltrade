Add-Type -Path "C:\Program Files\NinjaTrader 8\bin\System.Data.SQLite.dll"
$con = New-Object System.Data.SQLite.SQLiteConnection("Data Source=C:\Users\Pichau\Documents\NinjaTrader 8\db\NinjaTrader.sqlite;Version=3;Read Only=True;")
$con.Open()

$cmd = $con.CreateCommand()
$cmd.CommandText = @"
SELECT e.ExecutionId, e.OrderId, e.Name, e.IsEntry, e.IsExit, e.MarketPosition, e.Price, e.Quantity, e.Time, e.Commission, m.Name, m.PointValue
FROM Executions e
LEFT JOIN Instruments i ON e.Instrument = i.Id
LEFT JOIN MasterInstruments m ON i.MasterInstrument = m.Id
WHERE e.Account = 18
ORDER BY e.Time ASC;
"@
$reader = $cmd.ExecuteReader()
$count = 0
while ($reader.Read()) {
    $count++
    if ($count -le 5 -or $count -ge 148) {
        $instName = if ($reader.IsDBNull(10)) { "N/A" } else { $reader.GetString(10) }
        $ptVal = if ($reader.IsDBNull(11)) { 1.0 } else { $reader.GetDouble(11) }
        Write-Host "#$count | ExecId: $($reader.GetString(0)) | Instrument: $instName | PtVal: $ptVal | Price: $($reader.GetDouble(6)) | Qty: $($reader.GetInt32(7)) | MarketPos: $($reader.GetInt32(5))"
    }
}
$reader.Close()
$con.Close()

Write-Host "Total de execucoes retornadas pelo JOIN perfeito: $count"
