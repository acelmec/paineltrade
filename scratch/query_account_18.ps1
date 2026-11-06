Add-Type -Path "C:\Program Files\NinjaTrader 8\bin\System.Data.SQLite.dll"
$con = New-Object System.Data.SQLite.SQLiteConnection("Data Source=C:\Users\Pichau\Documents\NinjaTrader 8\db\NinjaTrader.sqlite;Version=3;Read Only=True;")
$con.Open()

Write-Host "=== EXECUCOES DA CONTA FFFUNDED478338 (Id=18) NO SQLITE ==="
$cmd = $con.CreateCommand()
$cmd.CommandText = "SELECT Id, ExecutionId, OrderId, Name, IsEntry, IsExit, MarketPosition, Price, Quantity, Time, Commission, Fee FROM Executions WHERE Account = 18 ORDER BY Time ASC;"
$reader = $cmd.ExecuteReader()
$count = 0
while ($reader.Read()) {
    $count++
    $ticks = $reader.GetInt64(9)
    $dt = New-Object DateTime($ticks, [DateTimeKind]::Utc)
    $dtLocal = $dt.ToLocalTime()
    $dtStr = $dtLocal.ToString("dd/MM/yyyy HH:mm:ss")
    $id = $reader.GetInt32(0)
    $execId = $reader.GetString(1)
    $orderId = if ($reader.IsDBNull(2)) { "" } else { $reader.GetString(2) }
    $name = if ($reader.IsDBNull(3)) { "" } else { $reader.GetString(3) }
    $isEntry = $reader.GetInt32(4)
    $isExit = $reader.GetInt32(5)
    $marketPos = $reader.GetInt32(6)
    $price = $reader.GetDouble(7)
    $qty = $reader.GetInt32(8)
    $comm = $reader.GetDouble(10)

    Write-Host "#$count | Id: $id | Data: $dtStr | Order: $orderId | IsEntry: $isEntry | IsExit: $isExit | Pos: $marketPos | Qtd: $qty | Preco: $price | Comm: $comm"
}
$reader.Close()
Write-Host "`nTOTAL DE EXECUCOES ENCONTRADAS PARA FFFUNDED478338: $count"

$con.Close()
