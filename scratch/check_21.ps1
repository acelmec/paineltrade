Add-Type -Path "C:\Program Files\NinjaTrader 8\bin\System.Data.SQLite.dll"
$con = New-Object System.Data.SQLite.SQLiteConnection("Data Source=C:\Users\Pichau\Documents\NinjaTrader 8\db\NinjaTrader.sqlite;Version=3;Read Only=True;")
$con.Open()
$cmd = $con.CreateCommand()
$cmd.CommandText = "SELECT Id, ExecutionId, OrderId, Name, IsEntry, IsExit, MarketPosition, Price, Quantity, Time, Commission FROM Executions WHERE Account = 18 ORDER BY Time ASC;"
$r = $cmd.ExecuteReader()
while ($r.Read()) {
    $ticks = $r.GetInt64(9)
    $dt = (New-Object DateTime($ticks, [DateTimeKind]::Utc)).ToLocalTime()
    if ($dt.Date -eq [DateTime]::Parse('2026-09-21').Date) {
        $ord = if ($r.IsDBNull(2)) { '' } else { $r.GetString(2) }
        $name = if ($r.IsDBNull(3)) { '' } else { $r.GetString(3) }
        Write-Host ($dt.ToString('HH:mm:ss') + ' | Name: ' + $name.PadRight(15) + ' | Ord: ' + $ord.PadRight(15) + ' | IsEntry: ' + $r.GetInt32(4) + ' | IsExit: ' + $r.GetInt32(5) + ' | Pos: ' + $r.GetInt32(6) + ' | Price: ' + $r.GetDouble(7) + ' | Qty: ' + $r.GetInt32(8) + ' | Comm: ' + $r.GetDouble(10))
    }
}
$r.Close()
$con.Close()
