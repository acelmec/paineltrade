Add-Type -Path "C:\Program Files\NinjaTrader 8\bin\System.Data.SQLite.dll"
$con = New-Object System.Data.SQLite.SQLiteConnection("Data Source=C:\Users\Pichau\Documents\NinjaTrader 8\db\NinjaTrader.sqlite;Version=3;Read Only=True;")
$con.Open()

$cmd = $con.CreateCommand()
$cmd.CommandText = "SELECT Instrument, COUNT(*), MIN(Price), MAX(Price) FROM Executions WHERE Account = 18 GROUP BY Instrument;"
$r = $cmd.ExecuteReader()
while ($r.Read()) {
    Write-Host ("InstrumentId: " + $r.GetInt64(0) + " -> Count: " + $r.GetInt32(1) + " | MinPrice: " + $r.GetDouble(2) + " | MaxPrice: " + $r.GetDouble(3))
}
$r.Close()
$con.Close()
