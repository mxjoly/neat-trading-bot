import { normalize } from '../utils/math';
import dayjs from 'dayjs';
import {
  ADX,
  AwesomeOscillator,
  CCI,
  EMA,
  IchimokuCloud,
  MFI,
  ROC,
  RSI,
  SMA,
  WilliamsR,
  MACD,
  PSAR,
  StochasticRSI,
  BollingerBands,
  KeltnerChannels,
  VWAP,
  AverageGain,
  AverageLoss,
  bullish,
  bearish,
} from 'technicalindicators';
import {
  RMI,
  HMA,
  VolumeOscillator,
  SupportResistance,
  Supertrend,
  Aroon,
  RangeBands,
} from '../indicators';

/**
 * Calculate the indicator values
 * @param candles
 */
export function calculateIndicators(candles: CandleData[]) {
  const open = candles.map((c) => c.open);
  const close = candles.map((c) => c.close);
  const high = candles.map((c) => c.high);
  const low = candles.map((c) => c.low);
  const volume = candles.map((c) => c.volume);

  let ratioTimeFrames = 4;

  // ============== INIT ================= //

  // Weighted Moving Average (WMA)
  const wma = VWAP.calculate({
    close,
    high,
    low,
    volume,
  });

  // Hull Moving Average
  const ltf_hma = HMA.calculate(candles, { sourceType: 'close', period: 14 });
  const htf_hma = HMA.calculate(candles, {
    sourceType: 'close',
    period: ratioTimeFrames * 14,
  });

  // Awesome Indicator
  const ltf_ao = AwesomeOscillator.calculate({
    fastPeriod: 5,
    slowPeriod: 25,
    high,
    low,
  })
    .map((v) => (v > 0 ? 1 : v < 0 ? -1 : 0))
    .map((v) => normalize(v, -1, 1, 0, 1));
  const htf_ao = AwesomeOscillator.calculate({
    fastPeriod: ratioTimeFrames * 5,
    slowPeriod: ratioTimeFrames * 25,
    high,
    low,
  })
    .map((v) => (v > 0 ? 1 : v < 0 ? -1 : 0))
    .map((v) => normalize(v, -1, 1, 0, 1));

  // Commodity Channel Index
  const ltf_cci = CCI.calculate({
    period: 20,
    close,
    high,
    low,
  });
  const htf_cci = CCI.calculate({
    period: ratioTimeFrames * 20,
    close,
    high,
    low,
  });

  // Rate of Change
  const ltf_roc = ROC.calculate({
    period: 50,
    values: close,
  });
  const htf_roc = ROC.calculate({
    period: ratioTimeFrames * 50,
    values: close,
  });

  // Aroon
  const ltf_aroon = Aroon.calculate(candles, {
    length: 21,
  });
  const htf_aroon = Aroon.calculate(candles, {
    length: ratioTimeFrames * 21,
  });

  // Ichimoku
  const ltf_ichimoku = IchimokuCloud.calculate({
    conversionPeriod: 9,
    basePeriod: 26,
    spanPeriod: 52,
    displacement: 26,
    high,
    low,
  });
  const htf_ichimoku = IchimokuCloud.calculate({
    conversionPeriod: ratioTimeFrames * 9,
    basePeriod: ratioTimeFrames * 26,
    spanPeriod: ratioTimeFrames * 52,
    displacement: ratioTimeFrames * 26,
    high,
    low,
  });

  // MACD
  const ltf_macd = MACD.calculate({
    values: close,
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: true,
    SimpleMASignal: true,
  });
  const htf_macd = MACD.calculate({
    values: close,
    fastPeriod: ratioTimeFrames * 12,
    slowPeriod: ratioTimeFrames * 26,
    signalPeriod: ratioTimeFrames * 9,
    SimpleMAOscillator: true,
    SimpleMASignal: true,
  });

  // Parabolic Stop and Reverse
  const ltf_psar = PSAR.calculate({
    high,
    low,
    max: 0.2,
    step: 0.02,
  });
  const htf_psar = PSAR.calculate({
    high,
    low,
    max: ratioTimeFrames * 0.2,
    step: ratioTimeFrames * 0.02,
  });

  // Stochastic RSI
  const ltf_stochRsi = StochasticRSI.calculate({
    values: close,
    dPeriod: 3,
    kPeriod: 3,
    rsiPeriod: 14,
    stochasticPeriod: 14,
  });
  const htf_stochRsi = StochasticRSI.calculate({
    values: close,
    dPeriod: ratioTimeFrames * 3,
    kPeriod: ratioTimeFrames * 3,
    rsiPeriod: ratioTimeFrames * 14,
    stochasticPeriod: ratioTimeFrames * 14,
  });

  // Supertrend
  const ltf_supertrend = Supertrend.calculate(candles, {
    atrPeriod: 10,
    atrMultiplier: 3,
  });
  const htf_supertrend = Supertrend.calculate(candles, {
    atrPeriod: ratioTimeFrames * 10,
    atrMultiplier: ratioTimeFrames * 3,
  });

  // Support resistance
  const ltf_supportResistance = SupportResistance.calculate(candles, {
    leftBars: 8,
    rightBars: 7,
  });
  const htf_supportResistance = SupportResistance.calculate(candles, {
    leftBars: ratioTimeFrames * 8,
    rightBars: ratioTimeFrames * 7,
  });

  // Relative Momentum Index
  const ltf_rmi = RMI.calculate(candles, {
    sourceType: 'close',
    length: 14,
    momentum: 3,
  });
  const htf_rmi = RMI.calculate(candles, {
    sourceType: 'close',
    length: ratioTimeFrames * 14,
    momentum: ratioTimeFrames * 3,
  });

  // Oscillator volume
  const ltf_volOsc = VolumeOscillator.calculate(candles, {
    shortLength: 5,
    longLength: 10,
  });
  const htf_volOsc = VolumeOscillator.calculate(candles, {
    shortLength: ratioTimeFrames * 5,
    longLength: ratioTimeFrames * 10,
  });

  // Relative Strength Index
  const ltf_rsi = RSI.calculate({
    period: 14,
    values: close,
  });
  const htf_rsi = RSI.calculate({
    period: ratioTimeFrames * 14,
    values: close,
  });

  // William R
  const ltf_wpr = WilliamsR.calculate({
    period: 14,
    close,
    high,
    low,
  });
  const htf_wpr = WilliamsR.calculate({
    period: ratioTimeFrames * 14,
    close,
    high,
    low,
  });

  // Money Flow Index
  const ltf_mfi = MFI.calculate({
    period: 14,
    volume,
    close,
    high,
    low,
  });
  const htf_mfi = MFI.calculate({
    period: ratioTimeFrames * 14,
    volume,
    close,
    high,
    low,
  });

  // Average Directional Index
  const ltf_adx = ADX.calculate({
    period: 14,
    close,
    high,
    low,
  });
  const htf_adx = ADX.calculate({
    period: ratioTimeFrames * 14,
    close,
    high,
    low,
  });

  // ============== TREND INDICATORS ================= //

  const trendEma21 = EMA.calculate({
    period: 21,
    values: close,
  })
    .map((v, i, l) =>
      close[close.length - (l.length - i)] > v
        ? 1
        : close[close.length - (l.length - i)] < v
        ? -1
        : 0
    )
    .map((v) => normalize(v, -1, 1, 0, 1));

  const trendEma50 = EMA.calculate({
    period: 50,
    values: close,
  })
    .map((v, i, l) =>
      close[close.length - (l.length - i)] > v
        ? 1
        : close[close.length - (l.length - i)] < v
        ? -1
        : 0
    )
    .map((v) => normalize(v, -1, 1, 0, 1));

  const trendSma100 = SMA.calculate({
    period: 100,
    values: close,
  })
    .map((v, i, l) =>
      close[close.length - (l.length - i)] > v
        ? 1
        : close[close.length - (l.length - i)] < v
        ? -1
        : 0
    )
    .map((v) => normalize(v, -1, 1, 0, 1));

  const trendSma200 = SMA.calculate({
    period: 100,
    values: close,
  })
    .map((v, i, l) =>
      close[close.length - (l.length - i)] > v
        ? 1
        : close[close.length - (l.length - i)] < v
        ? -1
        : 0
    )
    .map((v) => normalize(v, -1, 1, 0, 1));

  // Weighted Moving Average (WMA)
  const trendWma = wma
    .map((v, i, l) =>
      close[close.length - (l.length - i)] > v
        ? 1
        : close[close.length - (l.length - i)] < v
        ? -1
        : 0
    )
    .map((v) => normalize(v, -1, 1, 0, 1));

  // Hull Moving Average
  const ltf_trendHma = ltf_hma
    .map((v, i, l) =>
      close[close.length - (l.length - i)] > v
        ? 1
        : close[close.length - (l.length - i)] < v
        ? -1
        : 0
    )
    .map((v) => normalize(v, -1, 1, 0, 1));
  const htf_trendHma = htf_hma
    .map((v, i, l) =>
      close[close.length - (l.length - i)] > v
        ? 1
        : close[close.length - (l.length - i)] < v
        ? -1
        : 0
    )
    .map((v) => normalize(v, -1, 1, 0, 1));

  // Rate of Change
  const ltf_trendRoc = ltf_roc
    .map((v) => (v > 0 ? 1 : v < 0 ? -1 : 0))
    .map((v) => normalize(v, -1, 1, 0, 1));
  const htf_trendRoc = htf_roc
    .map((v) => (v > 0 ? 1 : v < 0 ? -1 : 0))
    .map((v) => normalize(v, -1, 1, 0, 1));

  // Aroon
  const ltf_trendAroon = ltf_aroon
    .map((v) => (v.upper > v.lower ? 1 : v.upper < v.lower ? -1 : 0))
    .map((v) => normalize(v, -2, 2, 0, 1));
  const htf_trendAroon = htf_aroon
    .map((v) => (v.upper > v.lower ? 1 : v.upper < v.lower ? -1 : 0))
    .map((v) => normalize(v, -2, 2, 0, 1));

  // Kijun
  const ltf_trendKijun = ltf_ichimoku
    .map((v, i, l) =>
      close[close.length - (l.length - i)] > v.base
        ? 1
        : close[close.length - (l.length - i)] < v.base
        ? -1
        : 0
    )
    .map((v) => normalize(v, -1, 1, 0, 1));
  const htf_trendKijun = htf_ichimoku
    .map((v, i, l) =>
      close[close.length - (l.length - i)] > v.base
        ? 1
        : close[close.length - (l.length - i)] < v.base
        ? -1
        : 0
    )
    .map((v) => normalize(v, -1, 1, 0, 1));

  // Ichimokou cloud
  const ltf_trendCloud = ltf_ichimoku.map((v, i, l) =>
    close[close.length - (l.length - i)] > v.spanA && v.spanA > v.spanB
      ? 1
      : close[close.length - (l.length - i)] < v.spanA && v.spanA < v.spanB
      ? -1
      : 0
  );
  const htf_trendCloud = htf_ichimoku.map((v, i, l) =>
    close[close.length - (l.length - i)] > v.spanA && v.spanA > v.spanB
      ? 1
      : close[close.length - (l.length - i)] < v.spanA && v.spanA < v.spanB
      ? -1
      : 0
  );

  // ADX
  const ltf_trendAdx = ltf_adx
    .map((v) => (v.pdi > v.mdi ? 1 : v.pdi < v.mdi ? -1 : 0))
    .map((v) => normalize(v, -1, 1, 0, 1));
  const htf_trendAdx = htf_adx
    .map((v) => (v.pdi > v.mdi ? 1 : v.pdi < v.mdi ? -1 : 0))
    .map((v) => normalize(v, -1, 1, 0, 1));

  // MACD
  const ltf_trendMacdSignal = ltf_macd
    .map((v) => (v.MACD > v.signal ? 1 : v.MACD < v.signal ? -1 : 0))
    .map((v) => normalize(v, -2, 2, 0, 1));
  const htf_trendMacdSignal = htf_macd
    .map((v) => (v.MACD > v.signal ? 1 : v.MACD < v.signal ? -1 : 0))
    .map((v) => normalize(v, -2, 2, 0, 1));

  const ltf_trendMacdHist = ltf_macd
    .map((v) => (v.histogram > 0 ? 1 : v.histogram < 0 ? -1 : 0))
    .map((v) => normalize(v, -1, 1, 0, 1));
  const htf_trendMacdHist = htf_macd
    .map((v) => (v.histogram > 0 ? 1 : v.histogram < 0 ? -1 : 0))
    .map((v) => normalize(v, -1, 1, 0, 1));

  // Parabolic Stop and Reverse
  const ltf_trendPsar = ltf_psar
    .map((v, i, l) =>
      close[close.length - (l.length - i)] > v
        ? 1
        : close[close.length - (l.length - i)] < v
        ? -1
        : 0
    )
    .map((v) => normalize(v, -1, 1, 0, 1));
  const htf_trendPsar = htf_psar
    .map((v, i, l) =>
      close[close.length - (l.length - i)] > v
        ? 1
        : close[close.length - (l.length - i)] < v
        ? -1
        : 0
    )
    .map((v) => normalize(v, -1, 1, 0, 1));

  // Stochastic RSI
  const ltf_trendStochRsi = ltf_stochRsi
    .map((v) => (v.k > v.d ? 1 : v.k < v.d ? -1 : 0))
    .map((v) => normalize(v, -1, 1, 0, 1));
  const htf_trendStochRsi = htf_stochRsi
    .map((v) => (v.k > v.d ? 1 : v.k < v.d ? -1 : 0))
    .map((v) => normalize(v, -1, 1, 0, 1));

  // Supertrend
  const ltf_trendSupertrend = ltf_supertrend
    .map((v) => v.trend)
    .map((v) => normalize(v, -1, 1, 0, 1));
  const htf_trendSupertrend = htf_supertrend
    .map((v) => v.trend)
    .map((v) => normalize(v, -1, 1, 0, 1));

  // Williams Percent Range
  const ltf_trendWpr = ltf_wpr
    .map((v) => (v > -50 ? 1 : v < -50 ? -1 : 0))
    .map((v) => normalize(v, -1, 1, 0, 1));
  const htf_trendWpr = htf_wpr
    .map((v) => (v > -50 ? 1 : v < -50 ? -1 : 0))
    .map((v) => normalize(v, -1, 1, 0, 1));

  // Range Filter
  const ltf_rangeFilter = RangeBands.calculate(candles, {
    sourceType: 'close',
    multiplier: 2,
    period: 8,
  })
    .map((v, i, l) =>
      close[close.length - (l.length - i)] > v.highBand && v.upward > 0
        ? 1
        : close[close.length - (l.length - i)] < v.lowBand && v.downward > 0
        ? -1
        : 0
    )
    .map((v) => normalize(v, -1, 1, 0, 1));
  const htf_rangeFilter = RangeBands.calculate(candles, {
    sourceType: 'close',
    multiplier: 2,
    period: 16,
  })
    .map((v, i, l) =>
      close[close.length - (l.length - i)] > v.highBand && v.upward > 0
        ? 1
        : close[close.length - (l.length - i)] < v.lowBand && v.downward > 0
        ? -1
        : 0
    )
    .map((v) => normalize(v, -1, 1, 0, 1));

  // ==================== VOLUME =================== //

  // Volume strength
  const volumeStrength = SMA.calculate({
    period: 21,
    values: candles.map((c) => c.volume),
  })
    .map((v) => v * 1.2)
    .map((v, i, l) =>
      candles[candles.length - (l.length - i)].volume > v ? 1 : 0
    );

  // ==================== VALUE OF INDICATORS =================== //

  // Average Directional Index
  const ltf_valAdx = ltf_adx.map((v) => normalize(v.adx, 0, 100, 0, 1));
  const htf_valAdx = htf_adx.map((v) => normalize(v.adx, 0, 100, 0, 1));

  // Average Directional Index
  const ltf_valRsi = ltf_rsi.map((v) => normalize(v, 0, 100, 0, 1));
  const htf_valRsi = htf_rsi.map((v) => normalize(v, 0, 100, 0, 1));

  // Commodity Channel Index
  const ltf_valCci = ltf_cci
    .map((v) => (v > 100 ? 2 : v < -100 ? -2 : v > 0 ? 1 : v < 0 ? -1 : 0))
    .map((v) => normalize(v, -2, 2, 0, 1));
  const htf_valCci = htf_cci
    .map((v) => (v > 100 ? 2 : v < -100 ? -2 : v > 0 ? 1 : v < 0 ? -1 : 0))
    .map((v) => normalize(v, -2, 2, 0, 1));

  // Money Flow Index
  const ltf_valMfi = ltf_mfi.map((v) => normalize(v, 0, 100, 0, 1));
  const htf_valMfi = htf_mfi.map((v) => normalize(v, 0, 100, 0, 1));

  // William R
  const ltf_valWpr = ltf_wpr.map((v) => normalize(v, -100, 0, 0, 1));
  const htf_valWpr = htf_wpr.map((v) => normalize(v, -100, 0, 0, 1));

  // Relative Momentum Index
  const ltf_valRmi = ltf_rmi.map((v) => normalize(v, 0, 100, 0, 1));
  const htf_valRmi = htf_rmi.map((v) => normalize(v, 0, 100, 0, 1));

  // Oscillator volume
  const ltf_valVolOsc = ltf_volOsc.map((v) => normalize(v, 0, 100, 0, 1));
  const htf_valVolOsc = htf_volOsc.map((v) => normalize(v, 0, 100, 0, 1));

  // Aroon
  const ltf_valAroonUpper = ltf_aroon
    .map((v) => v.upper)
    .map((v) => normalize(v, 0, 100, 0, 1));
  const htf_valAroonUpper = htf_aroon
    .map((v) => v.upper)
    .map((v) => normalize(v, 0, 100, 0, 1));

  const ltf_valAroonLower = ltf_aroon
    .map((v) => v.lower)
    .map((v) => normalize(v, 0, 100, 0, 1));
  const htf_valAroonLower = htf_aroon
    .map((v) => v.lower)
    .map((v) => normalize(v, 0, 100, 0, 1));

  // ==================== SIGNALS OF INDICATORS =================== //

  // Money Flow Index
  const ltf_signalMfi = ltf_mfi
    .map((v, i, l) => {
      if (i < 1) return 0;
      if (l[i - 1] < 20 && v > 20) return 1;
      if (l[i - 1] > 80 && v < 80) return -1;
      return 0;
    })
    .map((v) => normalize(v, -1, 1, 0, 1));
  const htf_signalMfi = htf_mfi
    .map((v, i, l) => {
      if (i < 1) return 0;
      if (l[i - 1] < 20 && v > 20) return 1;
      if (l[i - 1] > 80 && v < 80) return -1;
      return 0;
    })
    .map((v) => normalize(v, -1, 1, 0, 1));

  const ltf_signalRsi = ltf_rsi
    .map((v, i, l) => {
      if (i < 1) return 0;
      if (l[i - 1] < 30 && v > 30) return 1;
      if (l[i - 1] > 70 && v < 70) return -1;
      return 0;
    })
    .map((v) => normalize(v, -1, 1, 0, 1));
  const htf_signalRsi = htf_rsi
    .map((v, i, l) => {
      if (i < 1) return 0;
      if (l[i - 1] < 30 && v > 30) return 1;
      if (l[i - 1] > 70 && v < 70) return -1;
      return 0;
    })
    .map((v) => normalize(v, -1, 1, 0, 1));

  // Commodity Channel Index
  const ltf_signalCci = ltf_cci
    .map((v, i, l) => {
      if (i < 1) return 0;
      if (l[i - 1] < -100 && v > -100) return 1;
      if (l[i - 1] > 100 && v < 100) return -1;
      return 0;
    })
    .map((v) => normalize(v, -1, 1, 0, 1));
  const htf_signalCci = htf_cci
    .map((v, i, l) => {
      if (i < 1) return 0;
      if (l[i - 1] < -100 && v > -100) return 1;
      if (l[i - 1] > 100 && v < 100) return -1;
      return 0;
    })
    .map((v) => normalize(v, -1, 1, 0, 1));

  // MACD
  const ltf_signalMacd = ltf_macd
    .map((v, i, l) => {
      if (i < 1) return 0;
      if (l[i - 1].MACD < l[i - 1].signal && v.MACD > v.signal) return 1;
      if (l[i - 1].MACD > l[i - 1].signal && v.MACD < v.signal) return -1;
      return 0;
    })
    .map((v) => normalize(v, -1, 1, 0, 1));
  const htf_signalMacd = htf_macd
    .map((v, i, l) => {
      if (i < 1) return 0;
      if (l[i - 1].MACD < l[i - 1].signal && v.MACD > v.signal) return 1;
      if (l[i - 1].MACD > l[i - 1].signal && v.MACD < v.signal) return -1;
      return 0;
    })
    .map((v) => normalize(v, -1, 1, 0, 1));

  // MACD Histogram
  const ltf_signalMacdHist = ltf_macd
    .map((v, i, l) => {
      if (i < 1) return 0;
      if (l[i - 1].histogram < 0 && v.histogram > 0) return 1;
      if (l[i - 1].histogram > 0 && v.histogram < 0) return -1;
      return 0;
    })
    .map((v) => normalize(v, -1, 1, 0, 1));

  const htf_signalMacdHist = htf_macd
    .map((v, i, l) => {
      if (i < 1) return 0;
      if (l[i - 1].histogram < 0 && v.histogram > 0) return 1;
      if (l[i - 1].histogram > 0 && v.histogram < 0) return -1;
      return 0;
    })
    .map((v) => normalize(v, -1, 1, 0, 1));

  // Stochastic RSI
  const ltf_signalStochRsi = ltf_stochRsi
    .map((v, i, l) => {
      if (i < 1) return 0;
      if (l[i - 1].k < l[i - 1].d && v.k > v.d) return 1;
      if (l[i - 1].k > l[i - 1].d && v.k < v.d) return -1;
      return 0;
    })
    .map((v) => normalize(v, -1, 1, 0, 1));
  const htf_signalStochRsi = htf_stochRsi
    .map((v, i, l) => {
      if (i < 1) return 0;
      if (l[i - 1].k < l[i - 1].d && v.k > v.d) return 1;
      if (l[i - 1].k > l[i - 1].d && v.k < v.d) return -1;
      return 0;
    })
    .map((v) => normalize(v, -1, 1, 0, 1));

  // William R
  const ltf_signalWpr = ltf_wpr
    .map((v, i, l) => {
      if (i < 1) return 0;
      if (l[i - 1] < -80 && v > -80) return 1;
      if (l[i - 1] > -20 && v < -20) return -1;
      return 0;
    })
    .map((v) => normalize(v, -1, 1, 0, 1));
  const htf_signalWpr = htf_wpr
    .map((v, i, l) => {
      if (i < 1) return 0;
      if (l[i - 1] < -80 && v > -80) return 1;
      if (l[i - 1] > -20 && v < -20) return -1;
      return 0;
    })
    .map((v) => normalize(v, -1, 1, 0, 1));

  // Parabolic Stop and Reverse
  const ltf_signalPsar = ltf_psar
    .map((v, i, l) => {
      if (i < 1) return 0;
      if (
        close[close.length - 1 - (l.length - i)] < l[i - 1] &&
        close[close.length - (l.length - i)] > v
      )
        return 1;
      if (
        close[close.length - 1 - (l.length - i)] > l[i - 1] &&
        close[close.length - (l.length - i)] < v
      )
        return 1;
      return 0;
    })
    .map((v) => normalize(v, -1, 1, 0, 1));
  const htf_signalPsar = htf_psar
    .map((v, i, l) => {
      if (i < 1) return 0;
      if (
        close[close.length - 1 - (l.length - i)] < l[i - 1] &&
        close[close.length - (l.length - i)] > v
      )
        return 1;
      if (
        close[close.length - 1 - (l.length - i)] > l[i - 1] &&
        close[close.length - (l.length - i)] < v
      )
        return 1;
      return 0;
    })
    .map((v) => normalize(v, -1, 1, 0, 1));

  // Aroon
  const ltf_signalAroon = ltf_aroon
    .map((v, i, l) => {
      if (i < 1) return 0;
      if (l[i - 1].upper < l[i - 1].lower && v.upper > v.lower) return 1;
      if (l[i - 1].upper > l[i - 1].lower && v.upper < v.lower) return -1;
      return 0;
    })
    .map((v) => normalize(v, -1, 1, 0, 1));
  const htf_signalAroon = htf_aroon
    .map((v, i, l) => {
      if (i < 1) return 0;
      if (l[i - 1].upper < l[i - 1].lower && v.upper > v.lower) return 1;
      if (l[i - 1].upper > l[i - 1].lower && v.upper < v.lower) return -1;
      return 0;
    })
    .map((v) => normalize(v, -1, 1, 0, 1));

  // Supertrend
  const ltf_signalSupertrend = ltf_supertrend
    .map((v, i, l) => {
      if (i < 1) return 0;
      if (l[i - 1].trend < v.trend) return -1;
      if (l[i - 1].trend > v.trend) return 1;
      return 0;
    })
    .map((v) => normalize(v, -1, 1, 0, 1));
  const htf_signalSupertrend = htf_supertrend
    .map((v, i, l) => {
      if (i < 1) return 0;
      if (l[i - 1].trend < v.trend) return -1;
      if (l[i - 1].trend > v.trend) return 1;
      return 0;
    })
    .map((v) => normalize(v, -1, 1, 0, 1));

  // Kijun
  const ltf_signalKijun = ltf_ichimoku
    .map((v, i, l) => {
      if (i < 1) return 0;
      if (
        close[close.length - 1 - (l.length - i)] < l[i - 1].base &&
        close[close.length - (l.length - i)] > v.base
      )
        return 1;
      if (
        close[close.length - 1 - (l.length - i)] > l[i - 1].base &&
        close[close.length - (l.length - i)] < v.base
      )
        return -1;
      return 0;
    })
    .map((v) => normalize(v, -1, 1, 0, 1));
  const htf_signalKijun = htf_ichimoku
    .map((v, i, l) => {
      if (i < 1) return 0;
      if (
        close[close.length - 1 - (l.length - i)] < l[i - 1].base &&
        close[close.length - (l.length - i)] > v.base
      )
        return 1;
      if (
        close[close.length - 1 - (l.length - i)] > l[i - 1].base &&
        close[close.length - (l.length - i)] < v.base
      )
        return -1;
      return 0;
    })
    .map((v) => normalize(v, -1, 1, 0, 1));

  // Support resistance
  const ltf_signalSupportResistance = ltf_supportResistance
    .map((v, i, l) => {
      if (i < 1) return 0;
      if (
        close[close.length - (l.length - i)] < v.top &&
        close[close.length - 1 - (l.length - i)] > v.top
      )
        return 1;
      if (
        close[close.length - (l.length - i)] > v.bottom &&
        close[close.length - 1 - (l.length - i)] < v.bottom
      )
        return -1;
      return 0;
    })
    .map((v) => normalize(v, -1, 1, 0, 1));
  const htf_signalSupportResistance = htf_supportResistance
    .map((v, i, l) => {
      if (i < 1) return 0;
      if (
        close[close.length - (l.length - i)] < v.top &&
        close[close.length - 1 - (l.length - i)] > v.top
      )
        return 1;
      if (
        close[close.length - (l.length - i)] > v.bottom &&
        close[close.length - 1 - (l.length - i)] < v.bottom
      )
        return -1;
      return 0;
    })
    .map((v) => normalize(v, -1, 1, 0, 1));

  // ==================== PATTERN INDICATORS =================== //

  // White or Black candle ?
  const candleSide = candles.map((c) => (c.open > c.close ? 1 : -1));

  // Bullish Pattern ?
  const bullishPattern = candles.map((c, i) => {
    if (i > 3) {
      const cc = candles.slice(i - 4, i + 1);
      return bullish({
        open: cc.map((c) => c.open),
        high: cc.map((c) => c.high),
        low: cc.map((c) => c.low),
        close: cc.map((c) => c.close),
      });
    } else return false;
  });

  // Bearish Pattern ?
  const bearishPattern = candles.map((c, i) => {
    if (i > 3) {
      const cc = candles.slice(i - 4, i + 1);
      return bearish({
        open: cc.map((c) => c.open),
        high: cc.map((c) => c.high),
        low: cc.map((c) => c.low),
        close: cc.map((c) => c.close),
      });
    } else return false;
  });

  // ==================== TIME INDICATIONS =================== //

  // Day of the current candle
  const day = candles
    .map((c) => dayjs(c.closeTime).day())
    .map((v) => normalize(v, 0, 6, 0, 1));

  // Hour of the current candle
  const hour = candles
    .map((c) => dayjs(c.closeTime).hour())
    .map((v) => normalize(v, 0, 23, 0, 1));

  const isNewYorkSession = candles.map((c) =>
    dayjs(c.closeTime).hour() >= 12 && dayjs(c.closeTime).hour() <= 20 ? 1 : 0
  );

  const isLondonSession = candles.map((c) =>
    dayjs(c.closeTime).hour() >= 7 && dayjs(c.closeTime).hour() <= 15 ? 1 : 0
  );

  const isTokyoSession = candles.map((c) =>
    dayjs(c.closeTime).hour() >= 23 && dayjs(c.closeTime).hour() <= 7 ? 1 : 0
  );

  // Inputs for the neural network
  let inputs = [
    // Trend (31)
    trendEma21,
    trendEma50,
    trendSma100,
    trendSma200,
    ltf_trendAroon,
    htf_trendAroon,
    ltf_trendHma,
    htf_trendHma,
    ltf_trendMacdHist,
    htf_trendMacdHist,
    ltf_trendMacdSignal,
    htf_trendMacdSignal,
    ltf_trendPsar,
    htf_trendPsar,
    ltf_trendRoc,
    htf_trendRoc,
    ltf_trendStochRsi,
    htf_trendStochRsi,
    ltf_trendSupertrend,
    htf_trendSupertrend,
    trendWma,
    ltf_trendKijun,
    htf_trendKijun,
    ltf_trendCloud,
    htf_trendCloud,
    ltf_trendWpr,
    htf_trendWpr,
    ltf_trendAdx,
    htf_trendAdx,
    ltf_rangeFilter,
    htf_rangeFilter,
    // Volume (1)
    volumeStrength,
    // Values (18)
    ltf_valAdx,
    htf_valAdx,
    ltf_valCci,
    htf_valCci,
    ltf_valMfi,
    htf_valMfi,
    ltf_valRmi,
    htf_valRmi,
    ltf_valRsi,
    htf_valRsi,
    ltf_valVolOsc,
    htf_valVolOsc,
    ltf_valWpr,
    htf_valWpr,
    ltf_valAroonUpper,
    htf_valAroonUpper,
    ltf_valAroonLower,
    htf_valAroonLower,
    // Signals (24)
    ltf_signalAroon,
    htf_signalAroon,
    ltf_signalCci,
    htf_signalCci,
    ltf_signalKijun,
    htf_signalKijun,
    ltf_signalMacd,
    htf_signalMacd,
    ltf_signalMacdHist,
    htf_signalMacdHist,
    ltf_signalMfi,
    htf_signalMfi,
    ltf_signalPsar,
    htf_signalPsar,
    ltf_signalRsi,
    htf_signalRsi,
    ltf_signalStochRsi,
    htf_signalStochRsi,
    ltf_signalSupertrend,
    htf_signalSupertrend,
    ltf_signalSupportResistance,
    htf_signalSupportResistance,
    ltf_signalWpr,
    htf_signalWpr,
    // Pattern (3)
    bullishPattern,
    bearishPattern,
    candleSide,
    // Time (5)
    day,
    hour,
    isNewYorkSession,
    isLondonSession,
    isTokyoSession,
  ].map((values) => {
    // Set the same length for the array of indicator values
    let diff = candles.length - values.length;
    return new Array(diff).fill(null).concat(values);
  });

  return inputs;
}
