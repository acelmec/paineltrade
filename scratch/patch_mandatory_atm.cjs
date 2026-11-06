const fs = require('fs');
const path = require('path');

// 1. Atualizar CopyTradingDashboard.tsx
const dashboardPath = path.resolve('src/components/CopyTradingDashboard.tsx');
let dashContent = fs.readFileSync(dashboardPath, 'utf8');

// A. No payload de salvamento, garantir copy_atm_strategy: true
dashContent = dashContent.replace(
  'copy_atm_strategy: formCopyAtmStrategy,',
  'copy_atm_strategy: true,'
);

// B. No modal, substituir o checkbox de copyAtmStrategy pelo banner institucional obrigatório
const targetAtmCheckbox = `                <div className="flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    id="copyAtmStrategy"
                    checked={formCopyAtmStrategy}
                    onChange={(e) => setFormCopyAtmStrategy(e.target.checked)}
                    className="w-4 h-4 mt-0.5 rounded text-blue-600 bg-slate-900 border-slate-700"
                  />
                  <div>
                    <label htmlFor="copyAtmStrategy" className="text-white font-bold cursor-pointer block">
                      Copiar Estratégia ATM (Stop Loss e Take Profit da Master)
                    </label>
                    <span className="text-[10px] text-slate-400 block leading-tight">
                      Submete e ajusta automaticamente os níveis de SL e TP nas Slaves replicando a proteção da Master.
                    </span>
                  </div>
                </div>`;

const replacementAtmBanner = `                <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-lg p-2.5 flex items-center gap-2.5">
                  <span className="text-emerald-400 text-lg">🛡️</span>
                  <div className="text-[11px] leading-tight">
                    <span className="text-emerald-300 font-bold block">Proteção ATM Obrigatória (SL & TP Mandatórios)</span>
                    <span className="text-slate-300">
                      Toda posição requer Stop Loss e Take Profit. A estratégia ATM é replicada compulsoriamente nas Slaves para máxima proteção institucional do capital.
                    </span>
                  </div>
                </div>`;

dashContent = dashContent.replace(targetAtmCheckbox, replacementAtmBanner);

// C. Na listagem de Slaves na tabela
const targetTableAtm = `{slaveRule.copy_atm_strategy !== false && (
                                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-semibold" title="Copia Estratégia ATM (SL e TP da Master)">
                                      🎯 ATM
                                    </span>
                                  )}`;

const replacementTableAtm = `<span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold flex items-center gap-1" title="Proteção ATM Obrigatória: Stop Loss e Take Profit replicados compulsoriamente">
                                      <span>🛡️</span> ATM Obrigatório
                                    </span>`;

dashContent = dashContent.replace(targetTableAtm, replacementTableAtm);

fs.writeFileSync(dashboardPath, dashContent, 'utf8');
console.log('CopyTradingDashboard.tsx atualizado com sucesso (ATM Obrigatório)!');

// 2. Atualizar AxionGatewayAddOn.cs
const csharpPath = path.resolve('experts/AxionGatewayAddOn.cs');
let csContent = fs.readFileSync(csharpPath, 'utf8');

// A. No Guardião 5s: exigir AMBOS Stop Loss E Take Profit
const targetGuardianSlCheck = `                                bool hasSl = exitOrders.Any(o => (o.OrderType == OrderType.StopMarket || o.OrderType == OrderType.StopLimit) || o.StopPrice > 0 || (!string.IsNullOrEmpty(o.Name) && (o.Name.IndexOf("Stop", StringComparison.OrdinalIgnoreCase) >= 0 || o.Name.IndexOf("SL", StringComparison.OrdinalIgnoreCase) >= 0)));

                                if (!hasSl)
                                {
                                    // 🛡️ Se o trade ou bracket acabou de ser enviado nos últimos 5 segundos, aguarda a corretora confirmar no book
                                    if (_lastReconcileAdjustmentTime.TryGetValue(stateKey, out DateTime lastEntry) && (now - lastEntry).TotalSeconds < 5.0)
                                    {
                                        continue;
                                    }
                                    if (_lastBracketSubmissionTime.TryGetValue(stateKey, out DateTime lastSub) && (now - lastSub).TotalSeconds < 5.0)
                                    {
                                        continue;
                                    }

                                    DateTime unprotSince = _unprotectedPositionSince.GetOrAdd(stateKey, _ => now);
                                    if ((now - unprotSince).TotalSeconds >= 5.0)
                                    {
                                        _unprotectedPositionSince.TryRemove(stateKey, out _);
                                        CancelarOrdensPendentes(acc, inst);
                                        OrderAction closeAct = isLong ? OrderAction.Sell : OrderAction.Buy;
                                        int closeQ = Math.Abs(pos.Quantity);
                                        if (SafeSubmitCloseOrder(acc, pos.Instrument ?? inst, closeAct, closeQ, "Close"))
                                        {
                                            string reasonMsg = $"Posição ({pos.MarketPosition} {closeQ}x em {inst.FullName}) aberta sozinha/sem Stop Loss encerrada após 5s na conta {acc.Name}.";
                                            Log($"🛡️ [GUARDIÃO 5s - POSIÇÃO DESPROTEGIDA]: {reasonMsg}");
                                            EnqueueRejectionEvent(acc.Name, acc.Name, inst.FullName, isLong ? "BUY" : "SELL", closeQ, pos.AveragePrice, reasonMsg);
                                        }
                                    }
                                }
                                else
                                {
                                    _unprotectedPositionSince.TryRemove(stateKey, out _);
                                }`;

const replacementGuardianSlCheck = `                                bool hasSl = exitOrders.Any(o => (o.OrderType == OrderType.StopMarket || o.OrderType == OrderType.StopLimit) || o.StopPrice > 0 || (!string.IsNullOrEmpty(o.Name) && (o.Name.IndexOf("Stop", StringComparison.OrdinalIgnoreCase) >= 0 || o.Name.IndexOf("SL", StringComparison.OrdinalIgnoreCase) >= 0)));
                                bool hasTp = exitOrders.Any(o => o.OrderType == OrderType.Limit || o.LimitPrice > 0 || (!string.IsNullOrEmpty(o.Name) && (o.Name.IndexOf("Target", StringComparison.OrdinalIgnoreCase) >= 0 || o.Name.IndexOf("Profit", StringComparison.OrdinalIgnoreCase) >= 0 || o.Name.IndexOf("TP", StringComparison.OrdinalIgnoreCase) >= 0)));

                                // 🛡️ REGRA INSTITUCIONAL MANDATÓRIA: Toda posição requer Stop Loss E Take Profit
                                bool isFullyProtected = hasSl && hasTp;

                                if (!isFullyProtected)
                                {
                                    // Se o trade ou bracket acabou de ser enviado nos últimos 5 segundos, aguarda a corretora confirmar no book
                                    if (_lastReconcileAdjustmentTime.TryGetValue(stateKey, out DateTime lastEntry) && (now - lastEntry).TotalSeconds < 5.0)
                                    {
                                        continue;
                                    }
                                    if (_lastBracketSubmissionTime.TryGetValue(stateKey, out DateTime lastSub) && (now - lastSub).TotalSeconds < 5.0)
                                    {
                                        continue;
                                    }

                                    DateTime unprotSince = _unprotectedPositionSince.GetOrAdd(stateKey, _ => now);
                                    if ((now - unprotSince).TotalSeconds >= 5.0)
                                    {
                                        _unprotectedPositionSince.TryRemove(stateKey, out _);
                                        CancelarOrdensPendentes(acc, inst);
                                        OrderAction closeAct = isLong ? OrderAction.Sell : OrderAction.Buy;
                                        int closeQ = Math.Abs(pos.Quantity);
                                        if (SafeSubmitCloseOrder(acc, pos.Instrument ?? inst, closeAct, closeQ, "Close"))
                                        {
                                            string missingDesc = (!hasSl && !hasTp) ? "sem Stop Loss e sem Take Profit" : (!hasSl ? "sem Stop Loss" : "sem Take Profit");
                                            string reasonMsg = $"Posição ({pos.MarketPosition} {closeQ}x em {inst.FullName}) aberta desprotegida ({missingDesc}) encerrada por segurança pelo Guardião na conta {acc.Name}.";
                                            Log($"🛡️ [GUARDIÃO 5s - PROTEÇÃO OBRIGATÓRIA]: {reasonMsg}");
                                            EnqueueRejectionEvent(acc.Name, acc.Name, inst.FullName, isLong ? "BUY" : "SELL", closeQ, pos.AveragePrice, reasonMsg);
                                        }
                                    }
                                }
                                else
                                {
                                    _unprotectedPositionSince.TryRemove(stateKey, out _);
                                }`;

csContent = csContent.replace(targetGuardianSlCheck, replacementGuardianSlCheck);

// B. No Add-On UI: exibir "ATM: OBRIGATÓRIO"
csContent = csContent.replace(
  '| ATM: {(ruleRef.CopyAtmStrategy ? "SIM" : "NÃO")}',
  '| ATM: OBRIGATÓRIO'
);

// C. No ReconcileSlaveBrackets: garantir que CopyAtmStrategy seja sempre tratada como mandatória
csContent = csContent.replace(
  `// Se a regra desabilitou a cópia de estratégia ATM / brackets, não interfere nos níveis
                    if (!rule.CopyAtmStrategy)
                    {
                        return;
                    }`,
  `// 🛡️ Cópia de estratégia ATM / brackets é 100% OBRIGATÓRIA e mandatória
                    // Reconciliação contínua de Stop Loss e Take Profit ativada para todas as Slaves`
);

fs.writeFileSync(csharpPath, csContent, 'utf8');
console.log('AxionGatewayAddOn.cs atualizado com sucesso (Guardião SL & TP obrigatórios)!');
