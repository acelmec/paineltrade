Add-Type -Path "C:\Program Files\NinjaTrader 8\bin\System.Data.SQLite.dll"
$con = New-Object System.Data.SQLite.SQLiteConnection("Data Source=C:\Users\Pichau\Documents\NinjaTrader 8\db\NinjaTrader.sqlite;Version=3;Read Only=True;")
$con.Open()

Write-Host "=== TABELA MASTERINSTRUMENTS ==="
$cmd = $con.CreateCommand()
$cmd.CommandText = "SELECT Id, Name, PointValue FROM MasterInstruments LIMIT 10;"
$reader = $cmd.ExecuteReader()
while ($reader.Read()) {
    Write-Host ("Id=" + $reader.GetValue(0) + " | Name=" + $reader.GetValue(1) + " | PointValue=" + $reader.GetValue(2))
}
$reader.Close()

Write-Host "`n=== TABELA INSTRUMENTS COM NOMES ==="
$cmd.CommandText = "SELECT Id, MasterInstrument, Expiry FROM Instruments WHERE Id IN (699839150768054, 699839150764571);"
$reader = $cmd.ExecuteReader()
while ($reader.Read()) {
    Write-Host ("Id=" + $reader.GetValue(0) + " | Master=" + $reader.GetValue(1) + " | Expiry=" + $reader.GetValue(2))
}
$reader.Close()

$con.Close()
