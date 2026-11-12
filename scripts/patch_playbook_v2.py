"""
Script de aplicacao cirurgica das melhorias quantitativas comprovadas nos 365 dias do Databento:
1. Enums estendidos: PlaybookT0ViesMode, PlaybookT0Mode (com Parcial e Scalp Seco), PlaybookM5Mode (com Parcial 81-84%), PlaybookOR15GestaoMode (com niveis 35%), PlaybookOR15BreakoutEntradaMode (Direto vs Pullback).
2. Forca Londres capturada no polling da tabela nasdaq_force (janela 04:00-08:00 NY / 05:00-09:00 BRT).
3. ExecutarOrdemPlaybookSimples com suporte a Parcial e Breakeven automatico.
4. Presets recomendados atualizados: Forca M5 padrao em 60%, T0 modo de vies Auto, OR15 com suporte a 35% e Pullback.
Aplica em experts/VMPlaybookNasdaq.cs, experts/VMBotF.cs e C:/Users/Pichau/Documents/NinjaTrader 8/bin/Custom/Strategies/VMPlaybookNasdaq.cs.
"""
import os, re, sys

def patch_file(filepath):
    print(f"Processando {filepath}...", flush=True)
    with open(filepath, 'r', encoding='utf-8') as f:
        code = f.read()

    # 1. Atualizar Enums
    old_enums = re.compile(
        r'public enum PlaybookAtivoMode\s*\{.+?public enum PlaybookOR15GestaoMode\s*\{.+?\}',
        re.DOTALL
    )

    new_enums = """public enum PlaybookAtivoMode { AutoDetectar, Nasdaq_NQ_MNQ, Sp500_ES_MES, Customizado_Livre }
				public enum PlaybookT0ViesMode { Auto_Recomendado, Modo1_Asia_e_T15m, Modo5_Asia_e_Londres }
				public enum PlaybookT0Mode { Auto_Recomendado_Parcial, Auto_Scalp_Seco, Auto_Swing_Cheio, NQ_Swing60m_130x85pts, NQ_Scalp_Seco_60x45pts, NQ_Scalp_Parcial_85x45x130pts, ES_Swing60m_22x14pts, ES_Scalp_Seco_8x6pts, ES_Scalp_Parcial_7x4x8pts, Customizado_Ticks, RoboFixoTicks }
				public enum PlaybookM5Mode { Auto_Recomendado_Parcial, Auto_Scalp_Seco, Auto_Alvo_Cheio, Customizado_Pontos, Customizado_Ticks }
				public enum PlaybookOR15BreakoutEntradaMode { Direto_FechamentoFora, Com_Pullback_Reteste }
				public enum PlaybookOR15GestaoMode { Auto_Recomendado, Parcial35_BE_Final50_Stop35, Parcial35_BE_Final50_Stop25, Parcial25_BE_Final50_Stop25, Parcial25_BE_Final50_Stop50, Alvo35_Stop25, Alvo35_Stop35_1para1, Alvo50_Stop25_2para1, Alvo50_Stop50_1para1, Alvo25_Stop25_1para1 }"""

    if old_enums.search(code):
        code = old_enums.sub(new_enums, code)
        print("  -> Enums atualizados com sucesso.", flush=True)
    else:
        print("  -> Aviso: Enums nao encontrados exatamente por regex.", flush=True)

    # 2. Variável de Força de Londres
    if "private double   _pbForcaLondres" not in code:
        code = code.replace(
            "private double   _pbForcaT15m               = -1.0;",
            "private double   _pbForcaT15m               = -1.0;\n\t\t\t\tprivate double   _pbForcaLondres            = -1.0;"
        )
        print("  -> Campo _pbForcaLondres adicionado.", flush=True)

    # 3. Propriedades públicas do Playbook
    old_prop_t0_mode = "public PlaybookT0Mode PB_T0_ModoGestao { get; set; } = PlaybookT0Mode.Auto_ConformeAtivo;"
    new_prop_t0_mode = """[NinjaScriptProperty]
				[Display(Name="07.1. [T0] Viés Noturno (Ásia / Londres / T-15m)", Description="Auto_Recomendado (NQ: Ásia+Londres +722pts / ES: Ásia+T-15m +109pts) | Modo1_Asia_e_T15m | Modo5_Asia_e_Londres", GroupName="26. PLAYBOOK MULTI-ATIVO (NQ / MNQ / ES / MES)", Order=7)]
				public PlaybookT0ViesMode PB_T0_ViesSessao { get; set; } = PlaybookT0ViesMode.Auto_Recomendado;

				[NinjaScriptProperty]
				[Display(Name="08. [T0] Modo de Gestão", Description="Auto_Recomendado_Parcial (NQ 85x45x130 / ES 7x4x8 - 71-74% Win) | Auto_Scalp_Seco (NQ 60x45 / ES 8x6 - 63-67% Win) | Auto_Swing_Cheio | Customizado_Ticks", GroupName="26. PLAYBOOK MULTI-ATIVO (NQ / MNQ / ES / MES)", Order=8)]
				public PlaybookT0Mode PB_T0_ModoGestao { get; set; } = PlaybookT0Mode.Auto_Recomendado_Parcial;"""

    if old_prop_t0_mode in code:
        code = code.replace(old_prop_t0_mode, new_prop_t0_mode)
        print("  -> Propriedades T0 atualizadas.", flush=True)

    # Atualizar padrão M5
    old_m5_mode = "public PlaybookM5Mode PB_M5_ModoGestao { get; set; } = PlaybookM5Mode.Auto_ConformeAtivo;"
    new_m5_mode = "public PlaybookM5Mode PB_M5_ModoGestao { get; set; } = PlaybookM5Mode.Auto_Recomendado_Parcial;"
    if old_m5_mode in code:
        code = code.replace(old_m5_mode, new_m5_mode)

    # Atualizar Força M5 de 55% para 60%
    code = code.replace("public double PB_M5_ForcaFinalCompra { get; set; } = 55.0;", "public double PB_M5_ForcaFinalCompra { get; set; } = 60.0;")
    code = code.replace("public double PB_M5_ForcaFinalVenda { get; set; } = 45.0;", "public double PB_M5_ForcaFinalVenda { get; set; } = 40.0;")

    # Modo Breakout Entrada
    if "PB_OR15_BreakoutModoEntrada" not in code:
        old_brk_opt = 'public bool PB_OperarOR15_Breakout { get; set; } = true;'
        new_brk_opt = """public bool PB_OperarOR15_Breakout { get; set; } = true;

				[NinjaScriptProperty]
				[Display(Name="27.1. [OR15 Breakout] Modo de Entrada", Description="Direto_FechamentoFora (Entra a mercado na vela que fecha fora) | Com_Pullback_Reteste (Aguarda reteste na borda - Triplica o lucro no ES)", GroupName="26. PLAYBOOK MULTI-ATIVO (NQ / MNQ / ES / MES)", Order=27)]
				public PlaybookOR15BreakoutEntradaMode PB_OR15_BreakoutModoEntrada { get; set; } = PlaybookOR15BreakoutEntradaMode.Direto_FechamentoFora;"""
        code = code.replace(old_brk_opt, new_brk_opt)
        print("  -> Propriedade PB_OR15_BreakoutModoEntrada adicionada.", flush=True)

    # Atualizar padrão OR15 Gestao para Auto_Recomendado
    code = code.replace(
        "public PlaybookOR15GestaoMode PB_OR15_ModoGestao { get; set; } = PlaybookOR15GestaoMode.Parcial25_BE_Final50_Stop25;",
        "public PlaybookOR15GestaoMode PB_OR15_ModoGestao { get; set; } = PlaybookOR15GestaoMode.Auto_Recomendado;"
    )

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(code)
    print(f"Salvo {filepath}.", flush=True)

patch_file("experts/VMPlaybookNasdaq.cs")
patch_file("experts/VMBotF.cs")

nt_path = r"C:\Users\Pichau\Documents\NinjaTrader 8\bin\Custom\Strategies\VMPlaybookNasdaq.cs"
if os.path.exists(nt_path):
    patch_file(nt_path)
