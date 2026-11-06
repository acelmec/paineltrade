Add-Type -Path "C:\Program Files\NinjaTrader 8\bin\System.Data.SQLite.dll"
$con = New-Object System.Data.SQLite.SQLiteConnection("Data Source=C:\Users\Pichau\Documents\NinjaTrader 8\db\NinjaTrader.sqlite;Version=3;Read Only=True;")
$con.Open()

Write-Host "=== COLUNAS DE ACCOUNTS ==="
$cmd = $con.CreateCommand()
$cmd.CommandText = "PRAGMA table_info(Accounts);"
$reader = $cmd.ExecuteReader()
while ($reader.Read()) {
    Write-Host ($reader.GetString(1) + " (" + $reader.GetString(2) + ")")
}
$reader.Close()

Write-Host "`n=== DADOS DE ACCOUNTS ==="
$cmd.CommandText = "SELECT * FROM Accounts;"
$reader = $cmd.ExecuteReader()
$colCount = $reader.FieldCount
while ($reader.Read()) {
    $row = ""
    for ($i = 0; $i -lt $colCount; $i++) {
        $row += $reader.GetName($i) + "=" + $reader.GetValue($i) + " | "
    }
    Write-Host $row
}
$reader.Close()

Write-Host "`n=== DADOS DE INSTRUMENTS ==="
$cmd.CommandText = "SELECT Id, Name, MasterInstrument FROM Instruments LIMIT 10;"
$reader = $cmd.ExecuteReader()
while ($reader.Read()) {
    Write-Host ("Id=" + $reader.GetValue(0) + " | Name=" + $reader.GetValue(1) + " | Master=" + $reader.GetValue(2))
}
$reader.Close()

Write-Host "`n=== SAMPLE EXECUTIONS ==="
$cmd.CommandText = "SELECT Id, Account, Instrument, ExecutionId, IsEntry, IsExit, MarketPosition, Price, Quantity, Time, Commission, Fee FROM Executions ORDER BY Time DESC LIMIT 5;"
$reader = $cmd.ExecuteReader()
$colCount = $reader.FieldCount
while ($reader.Read()) {
    $row = ""
    for ($i = 0; $i -lt $colCount; $i++) {
        $row += $reader.GetName($i) + "=" + $reader.GetValue($i) + " | "
    }
    Write-Host $row
}
$reader.Close()

$con.Close()
