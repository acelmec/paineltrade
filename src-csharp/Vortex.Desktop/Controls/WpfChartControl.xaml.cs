using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Shapes;
using Vortex.Core.Indicators;
using Vortex.Core.Models;

namespace Vortex.Desktop.Controls;

public partial class WpfChartControl : UserControl
{
    private readonly List<Candle> _candles = new();
    private double[] _sma20 = Array.Empty<double>();
    private double[] _ema50 = Array.Empty<double>();

    private static readonly Brush BullBrush = new SolidColorBrush(Color.FromRgb(16, 185, 129));
    private static readonly Brush BearBrush = new SolidColorBrush(Color.FromRgb(239, 68, 68));
    private static readonly Brush SmaBrush = new SolidColorBrush(Color.FromRgb(6, 182, 212));
    private static readonly Brush EmaBrush = new SolidColorBrush(Color.FromRgb(168, 85, 247));
    private static readonly Brush GridBrush = new SolidColorBrush(Color.FromArgb(50, 148, 163, 184));
    private static readonly Brush TextBrush = new SolidColorBrush(Color.FromRgb(148, 163, 184));

    public WpfChartControl()
    {
        InitializeComponent();
    }

    public void SetCandles(IEnumerable<Candle> candles)
    {
        _candles.Clear();
        _candles.AddRange(candles);

        if (_candles.Count > 0)
        {
            _sma20 = IndicatorEngine.CalculateSMA(_candles, 20);
            _ema50 = IndicatorEngine.CalculateEMA(_candles, 50);
        }

        Render();
    }

    private void ChartCanvas_SizeChanged(object sender, SizeChangedEventArgs e)
    {
        Render();
    }

    public void Render()
    {
        ChartCanvas.Children.Clear();
        if (_candles.Count < 2) return;

        double width = ChartCanvas.ActualWidth > 0 ? ChartCanvas.ActualWidth : 800;
        double height = ChartCanvas.ActualHeight > 0 ? ChartCanvas.ActualHeight : 450;

        double rightPadding = 65;
        double chartWidth = width - rightPadding;
        double chartHeight = height - 20;

        int visibleCount = Math.Min(70, _candles.Count);
        int startIndex = _candles.Count - visibleCount;

        double minPrice = double.MaxValue;
        double maxPrice = double.MinValue;

        for (int i = startIndex; i < _candles.Count; i++)
        {
            if (_candles[i].Low < minPrice) minPrice = _candles[i].Low;
            if (_candles[i].High > maxPrice) maxPrice = _candles[i].High;
        }

        if (Math.Abs(maxPrice - minPrice) < 0.01) maxPrice += 1.0;
        double priceRange = maxPrice - minPrice;

        // 1. Linhas de Grade e Eixo de Preços
        int gridLines = 5;
        for (int g = 0; g <= gridLines; g++)
        {
            double y = (chartHeight / gridLines) * g;
            var line = new Line
            {
                X1 = 0,
                Y1 = y,
                X2 = chartWidth,
                Y2 = y,
                Stroke = GridBrush,
                StrokeThickness = 1
            };
            ChartCanvas.Children.Add(line);

            double price = maxPrice - (g * (priceRange / gridLines));
            var tb = new TextBlock
            {
                Text = price.ToString("F2"),
                Foreground = TextBrush,
                FontSize = 10
            };
            Canvas.SetLeft(tb, chartWidth + 6);
            Canvas.SetTop(tb, y - 7);
            ChartCanvas.Children.Add(tb);
        }

        // 2. Renderização de Velas
        double candleWidth = chartWidth / visibleCount;
        double bodyWidth = Math.Max(2, candleWidth * 0.7);

        for (int i = 0; i < visibleCount; i++)
        {
            int cIdx = startIndex + i;
            var c = _candles[cIdx];
            double xCenter = (i * candleWidth) + (candleWidth / 2.0);

            double yHigh = chartHeight - ((c.High - minPrice) / priceRange * (chartHeight - 30)) - 15;
            double yLow = chartHeight - ((c.Low - minPrice) / priceRange * (chartHeight - 30)) - 15;
            double yOpen = chartHeight - ((c.Open - minPrice) / priceRange * (chartHeight - 30)) - 15;
            double yClose = chartHeight - ((c.Close - minPrice) / priceRange * (chartHeight - 30)) - 15;

            bool isBull = c.Close >= c.Open;
            var brush = isBull ? BullBrush : BearBrush;

            // Pavio
            var wick = new Line
            {
                X1 = xCenter,
                Y1 = yHigh,
                X2 = xCenter,
                Y2 = yLow,
                Stroke = brush,
                StrokeThickness = 1.2
            };
            ChartCanvas.Children.Add(wick);

            // Corpo
            double bodyTop = Math.Min(yOpen, yClose);
            double bodyHeight = Math.Max(1.5, Math.Abs(yOpen - yClose));

            var body = new Rectangle
            {
                Width = bodyWidth,
                Height = bodyHeight,
                Fill = brush,
                Stroke = brush,
                StrokeThickness = 1
            };
            Canvas.SetLeft(body, xCenter - (bodyWidth / 2.0));
            Canvas.SetTop(body, bodyTop);
            ChartCanvas.Children.Add(body);
        }

        // 3. Indicadores: SMA 20 (Ciano) e EMA 50 (Roxo)
        if (_sma20.Length == _candles.Count)
        {
            var smaPoly = new Polyline
            {
                Stroke = SmaBrush,
                StrokeThickness = 2.0
            };
            for (int i = 0; i < visibleCount; i++)
            {
                int cIdx = startIndex + i;
                double xCenter = (i * candleWidth) + (candleWidth / 2.0);
                double y = chartHeight - ((_sma20[cIdx] - minPrice) / priceRange * (chartHeight - 30)) - 15;
                smaPoly.Points.Add(new Point(xCenter, y));
            }
            ChartCanvas.Children.Add(smaPoly);
        }

        if (_ema50.Length == _candles.Count)
        {
            var emaPoly = new Polyline
            {
                Stroke = EmaBrush,
                StrokeThickness = 1.8
            };
            for (int i = 0; i < visibleCount; i++)
            {
                int cIdx = startIndex + i;
                double xCenter = (i * candleWidth) + (candleWidth / 2.0);
                double y = chartHeight - ((_ema50[cIdx] - minPrice) / priceRange * (chartHeight - 30)) - 15;
                emaPoly.Points.Add(new Point(xCenter, y));
            }
            ChartCanvas.Children.Add(emaPoly);
        }
    }
}
