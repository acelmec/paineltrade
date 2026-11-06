$sqliteDllPath = "C:\Program Files\NinjaTrader 8\bin\System.Data.SQLite.dll"
$sqliteAsm = [System.Reflection.Assembly]::LoadFrom($sqliteDllPath)
$connType = $sqliteAsm.GetType("System.Data.SQLite.SQLiteConnection")
$dbPath = "C:\Users\Pichau\Documents\NinjaTrader 8\db\NinjaTrader.sqlite"

$conn = [Activator]::CreateInstance($connType, "Data Source=$dbPath;Version=3;Read Only=True;")
$connType.GetMethod("Open", [Type[]]@()).Invoke($conn, $null)

$cmd = $connType.GetMethod("CreateCommand", [Type[]]@()).Invoke($conn, $null)
$cmdType = $cmd.GetType()
$cmdType.GetProperty("CommandText").SetValue($cmd, "SELECT Id FROM Accounts WHERE Name = 'FFFUNDED478338' LIMIT 1;")
$sc = $cmdType.GetMethod("ExecuteScalar", [Type[]]@()).Invoke($cmd, $null)
$dbAccId = [Convert]::ToInt32($sc)
Write-Host "AccId found: $dbAccId"

$sql = @"
SELECT e.ExecutionId, e.OrderId, e.Name, e.IsEntry, e.IsExit, e.MarketPosition, e.Price, e.Quantity, e.Time, e.Commission, m.Name, m.PointValue
FROM Executions e
LEFT JOIN Instruments i ON e.Instrument = i.Id
LEFT JOIN MasterInstruments m ON i.MasterInstrument = m.Id
WHERE e.Account = $dbAccId
ORDER BY e.Time ASC;
"@
$cmdType.GetProperty("CommandText").SetValue($cmd, $sql)
$reader = $cmdType.GetMethod("ExecuteReader", [Type[]]@()).Invoke($cmd, $null)
$rType = $reader.GetType()
$readMethod = $rType.GetMethod("Read", [Type[]]@())
$isDbNullMethod = $rType.GetMethod("IsDBNull", [Type[]]@([int]))
$getStringMethod = $rType.GetMethod("GetString", [Type[]]@([int]))
$getInt32Method = $rType.GetMethod("GetInt32", [Type[]]@([int]))
$getInt64Method = $rType.GetMethod("GetInt64", [Type[]]@([int]))
$getDoubleMethod = $rType.GetMethod("GetDouble", [Type[]]@([int]))

$count = 0
while ($readMethod.Invoke($reader, $null)) {
    $count++
    $exId = if ($isDbNullMethod.Invoke($reader, @(0))) { "" } else { $getStringMethod.Invoke($reader, @(0)) }
    $sym = if ($isDbNullMethod.Invoke($reader, @(10))) { "MNQ" } else { $getStringMethod.Invoke($reader, @(10)) }
    $pr = if ($isDbNullMethod.Invoke($reader, @(6))) { 0.0 } else { $getDoubleMethod.Invoke($reader, @(6)) }
    if ($count -eq 1 -or $count -eq 151) {
        Write-Host "#$count | $exId | $sym | $pr"
    }
}
$reader.Dispose()
$cmd.Dispose()
$conn.Dispose()

Write-Host "Success! Total read: $count"
