Add-Type -Path "C:\Program Files\NinjaTrader 8\bin\System.Data.SQLite.dll"
$con = New-Object System.Data.SQLite.SQLiteConnection("Data Source=C:\Users\Pichau\Documents\NinjaTrader 8\db\NinjaTrader.sqlite;Version=3;Read Only=True;")
$con.Open()

# 1. Obter Id da conta FFFUNDED478338
$cmd = $con.CreateCommand()
$cmd.CommandText = "SELECT Id FROM Accounts WHERE Name = 'FFFUNDED478338';"
$accId = [int]$cmd.ExecuteScalar()

# 2. Obter Instrumentos
$cmd.CommandText = "SELECT Id, MasterInstrument FROM Instruments;"
$reader = $cmd.ExecuteReader()
$instMap = @{}
while ($reader.Read()) {
    $instMap[$reader.GetInt64(0)] = $reader.GetString(1)
}
$reader.Close()

# 3. Ler todas as execucoes da conta
$cmd.CommandText = "SELECT Id, ExecutionId, OrderId, Name, IsEntry, IsExit, MarketPosition, Price, Quantity, Time, Commission, Fee, Instrument FROM Executions WHERE Account = $accId ORDER BY Time ASC;"
$reader = $cmd.ExecuteReader()
$execs = @()
while ($reader.Read()) {
    $ticks = $reader.GetInt64(9)
    $dt = New-Object DateTime($ticks, [DateTimeKind]::Utc)
    $dtLocal = $dt.ToLocalTime()
    
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
        Time = $dtLocal
        Comm = $reader.GetDouble(10)
        Fee = $reader.GetDouble(11)
        InstrumentId = $reader.GetInt64(12)
        Symbol = $instMap[$reader.GetInt64(12)]
    }
}
$reader.Close()
$con.Close()

Write-Host "Total execucoes carregadas: $($execs.Count)"

# FIFO Trade Matching
# Agrupar por Instrumento
$instruments = $execs | Select-Object -ExpandProperty Symbol -Unique

$allTrades = @()
$pointValue = 2.0 # MNQ = $2 por ponto ($0.50 por tick de 0.25)

foreach ($sym in $instruments) {
    $symExecs = $execs | Where-Object { $_.Symbol -eq $sym }
    $openEntries = [System.Collections.Generic.Queue[PSCustomObject]]::new()
    
    foreach ($ex in $symExecs) {
        if ($ex.IsEntry -eq 1 -or ($ex.IsExit -eq 0 -and $openEntries.Count -eq 0)) {
            $openEntries.Enqueue($ex)
        } elseif ($ex.IsExit -eq 1 -or $openEntries.Count -gt 0) {
            $remQty = $ex.Qty
            while ($remQty -gt 0 -and $openEntries.Count -gt 0) {
                $top = $openEntries.Peek()
                $matchQty = [Math]::Min($remQty, $top.Qty)
                
                # Calcular PnL
                # MarketPos da entrada: 0=Long (Buy), 1=Short (Sell)
                # No NinjaTrader MarketPosition enum: 0=Long, 1=Short
                $pts = if ($top.MarketPos -eq 0) { $ex.Price - $top.Price } else { $top.Price - $ex.Price }
                $grossPnl = $pts * $matchQty * $pointValue
                
                # Rateio de comissao se houver
                $tradeComm = (($top.Comm / $top.Qty) + ($ex.Comm / $ex.Qty)) * $matchQty
                if ($tradeComm -eq 0) {
                    # No NinjaTrader, as comissoes de futuros aparecem no relatorio
                    # Vamos verificar o valor por lote padrao
                }
                
                $allTrades += [PSCustomObject]@{
                    Symbol = $sym
                    Action = if ($top.MarketPos -eq 0) { "COMPRA" } else { "VENDA" }
                    Quantity = $matchQty
                    EntryPrice = $top.Price
                    ExitPrice = $ex.Price
                    EntryTime = $top.Time
                    ExitTime = $ex.Time
                    GrossPnl = $grossPnl
                    Points = $pts
                }
                
                $remQty -= $matchQty
                $top.Qty -= $matchQty
                if ($top.Qty -le 0) {
                    $openEntries.Dequeue() | Out-Null
                }
            }
        }
    }
}

Write-Host "Total Trades Reconstruidos: $($allTrades.Count)"
$allTrades | Select-Object -First 10 | Format-Table Action, Quantity, EntryPrice, ExitPrice, EntryTime, ExitTime, Points, GrossPnl
