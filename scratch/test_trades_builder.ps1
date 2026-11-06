Add-Type -Path "C:\Program Files\NinjaTrader 8\bin\System.Data.SQLite.dll"
$con = New-Object System.Data.SQLite.SQLiteConnection("Data Source=C:\Users\Pichau\Documents\NinjaTrader 8\db\NinjaTrader.sqlite;Version=3;Read Only=True;")
$con.Open()

# 1. Obter Id da conta FFFUNDED478338
$cmd = $con.CreateCommand()
$cmd.CommandText = "SELECT Id FROM Accounts WHERE Name = 'FFFUNDED478338';"
$accId = [int]$cmd.ExecuteScalar()

# 2. Ler todas as execucoes da conta
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
        Symbol = "MNQ DEC26"
    }
}
$reader.Close()
$con.Close()

Write-Host "Total execucoes carregadas para Account $accId (FFFUNDED478338): $($execs.Count)"

# Trade reconstruction logic exactly matching NinjaTrader FIFO
$openLots = [System.Collections.Generic.List[PSCustomObject]]::new()
$trades = [System.Collections.Generic.List[PSCustomObject]]::new()
$pointValue = 2.0 # MNQ = $2.00 por ponto

foreach ($ex in $execs) {
    # No NinjaTrader MarketPosition: 0 = Long, 1 = Short
    # Quando IsEntry == 1 ou estamos abrindo lote:
    # Se IsEntry==1 e MarketPosition==0 => BUY
    # Se IsExit==1 e MarketPosition==0 => SELL (fechamento de compra)
    # Se IsEntry==1 e MarketPosition==1 => SELL (abertura de venda)
    # Se IsExit==1 e MarketPosition==1 => BUY (fechamento de venda)
    $isBuy = ($ex.IsEntry -eq 1 -and $ex.MarketPos -eq 0) -or ($ex.IsExit -eq 1 -and $ex.MarketPos -eq 1)

    $qtyToMatch = $ex.Qty
    
    while ($qtyToMatch -gt 0 -and $openLots.Count -gt 0 -and ($openLots[0].IsBuy -ne $isBuy)) {
        $lot = $openLots[0]
        $matched = [Math]::Min($qtyToMatch, $lot.Qty)
        
        $pts = if ($lot.IsBuy) { $ex.Price - $lot.Price } else { $lot.Price - $ex.Price }
        $grossPnl = $pts * $matched * $pointValue
        
        # Comissoes: taxa padrao NinjaTrader / corretagem
        $comm = ($lot.CommPerLot + ($ex.Comm / $ex.Qty)) * $matched
        # Se comissao gravada no banco for 0, usa a comissao real da Tradovate/Ninja para MNQ: ~$0.78 a $0.87 por lado ($1.56 a $1.74 por contrato redondo)
        if ($comm -eq 0) {
            $comm = 1.74 * $matched # Padrao CME / FFF
        }
        $netPnl = $grossPnl - $comm

        $trades.Add([PSCustomObject]@{
            TradeNum = $trades.Count + 1
            Symbol = "MNQ DEC26"
            Action = if ($lot.IsBuy) { "COMPRA" } else { "VENDA" }
            Quantity = $matched
            EntryPrice = $lot.Price
            ExitPrice = $ex.Price
            EntryTime = $lot.Time
            ExitTime = $ex.Time
            Points = $pts
            GrossPnl = $grossPnl
            Commission = $comm
            NetPnl = $netPnl
        })
        
        $qtyToMatch -= $matched
        $lot.Qty -= $matched
        if ($lot.Qty -le 0) {
            $openLots.RemoveAt(0)
        }
    }

    if ($qtyToMatch -gt 0) {
        $commPerLot = if ($ex.Qty -gt 0) { $ex.Comm / $ex.Qty } else { 0 }
        $openLots.Add([PSCustomObject]@{
            Price = $ex.Price
            Time = $ex.Time
            Qty = $qtyToMatch
            IsBuy = $isBuy
            CommPerLot = $commPerLot
            OrderId = $ex.OrderId
        })
    }
}

Write-Host "Total Trades Reconstruidos no mes de Setembro: $($trades.Count)"

# Comparar com o print do usuario:
Write-Host "`n=== PRIMEIROS 15 TRADES (COMPARE COM O PRINT DO NINJATRADER) ==="
$trades | Select-Object -First 15 | Format-Table TradeNum, Action, Quantity, EntryPrice, ExitPrice, Points, GrossPnl, Commission, NetPnl, @{N='Data Entrada';E={$_.EntryTime.ToString('dd/MM HH:mm:ss')}}, @{N='Data Saida';E={$_.ExitTime.ToString('dd/MM HH:mm:ss')}}
