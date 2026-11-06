Add-Type -Path "C:\Program Files\NinjaTrader 8\bin\System.Data.SQLite.dll"
$con = New-Object System.Data.SQLite.SQLiteConnection("Data Source=C:\Users\Pichau\Documents\NinjaTrader 8\db\NinjaTrader.sqlite;Version=3;Read Only=True;")
$con.Open()

$cmd = $con.CreateCommand()
$cmd.CommandText = "SELECT Id FROM Accounts WHERE Name = 'FFFUNDED478338';"
$accId = [int]$cmd.ExecuteScalar()

$cmd.CommandText = "SELECT Id, ExecutionId, OrderId, Name, IsEntry, IsExit, MarketPosition, Price, Quantity, Time, Commission FROM Executions WHERE Account = $accId ORDER BY Time ASC;"
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

            # Se a entrada foi Pos: 0 (Long), lucro = (Saida - Entrada)
            # Se a entrada foi Pos: 1 (Short), lucro = (Entrada - Saida)
            $pts = if ($top.MarketPos -eq 0) { $ex.Price - $top.Price } else { $top.Price - $ex.Price }
            $grossPnl = $pts * $matchQty * $pointValue
            
            # Taxas da corretora para MNQ por contrato redondo (round-turn):
            # No print do NinjaTrader:
            # Corretagem = $1.56, Taxa C = $0.76, Taxa B = $1.40, Taxa NFA = $0.08 => Total = $3.80 para 2 contratos ($1.90 / contrato redondo)
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

Write-Host "Total de trades reconstruidos com sucesso: $($trades.Count)"
$trades | Format-Table Num, Data, HoraEntrada, HoraSaida, Posicao, Qtd, PrecoEntr, PrecoSaid, Gross, Comiss, Net
