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

  // ============== INIT ================= //

  // Weighted Moving Average (WMA)
  const wma = VWAP.calculate({
    close,
    high,
    low,
    volume,
  });

  // Hull Moving Average
  const hma = HMA.calculate({ values: close, period: 14 });

  // Awesome Indicator
  const ao = AwesomeOscillator.calculate({
    fastPeriod: 5,
    slowPeriod: 25,
    high,
    low,
  })
    .map((v) => (v > 0 ? 1 : v < 0 ? -1 : 0))
    .map((v) => normalize(v, -1, 1, 0, 1));

  // Commodity Channel Index
  const cci = CCI.calculate({
    period: 20,
    close,
    high,
    low,
  });

  // Rate of Change
  const roc = ROC.calculate({
    period: 50,
    values: close,
  });

  // Aroon
  const aroon = Aroon.calculate({
    length: 21,
    high,
    low,
  });

  // Ichimoku
  const ichimoku = IchimokuCloud.calculate({
    conversionPeriod: 9,
    basePeriod: 26,
    spanPeriod: 52,
    displacement: 26,
    high,
    low,
  });

  // MACD
  const macd = MACD.calculate({
    values: close,
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: true,
    SimpleMASignal: true,
  });

  // Parabolic Stop and Reverse
  const psar = PSAR.calculate({
    high,
    low,
    max: 0.2,
    step: 0.02,
  });

  // Stochastic RSI
  const stochRsi = StochasticRSI.calculate({
    values: close,
    dPeriod: 3,
    kPeriod: 3,
    rsiPeriod: 14,
    stochasticPeriod: 14,
  });

  // Supertrend
  const supertrend = Supertrend.calculate({
    close,
    high,
    low,
    atrPeriod: 10,
    atrMultiplier: 3,
  });

  // Support resistance
  const supportResistance = SupportResistance.calculate({
    high,
    low,
    left: 8,
    right: 7,
  });

  // Relative Momentum Index
  const rmi = RMI.calculate({
    values: close,
    length: 14,
    momentum: 3,
  });

  // Oscillator volume
  const volOsc = VolumeOscillator.calculate({
    shortLength: 5,
    longLength: 10,
    volume,
  });

  // Relative Strength Index
  const rsi = RSI.calculate({
    period: 14,
    values: close,
  });

  // William R
  const wpr = WilliamsR.calculate({
    period: 14,
    close,
    high,
    low,
  });

  // Money Flow Index
  const mfi = MFI.calculate({
    period: 14,
    volume,
    close,
    high,
    low,
  });

  // Average Directional Index
  const adx = ADX.calculate({
    period: 14,
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
  const trendHma = hma
    .map((v, i, l) =>
      close[close.length - (l.length - i)] > v
        ? 1
        : close[close.length - (l.length - i)] < v
        ? -1
        : 0
    )
    .map((v) => normalize(v, -1, 1, 0, 1));

  // Rate of Change
  const trendRoc = roc
    .map((v) => (v > 0 ? 1 : v < 0 ? -1 : 0))
    .map((v) => normalize(v, -1, 1, 0, 1));

  // Aroon
  const trendAroon = aroon
    .map((v) => (v.upper > v.lower ? 1 : v.upper < v.lower ? -1 : 0))
    .map((v) => normalize(v, -2, 2, 0, 1));

  // Kijun
  const trendKijun = ichimoku
    .map((v, i, l) =>
      close[close.length - (l.length - i)] > v.base
        ? 1
        : close[close.length - (l.length - i)] < v.base
        ? -1
        : 0
    )
    .map((v) => normalize(v, -1, 1, 0, 1));

  // Ichimokou cloud
  const trendCloud = ichimoku.map((v, i, l) =>
    close[close.length - (l.length - i)] > v.spanA && v.spanA > v.spanB
      ? 1
      : close[close.length - (l.length - i)] < v.spanA && v.spanA < v.spanB
      ? -1
      : 0
  );

  // MACD
  const trendMacdSignal = macd
    .map((v) => (v.MACD > v.signal ? 1 : v.MACD < v.signal ? -1 : 0))
    .map((v) => normalize(v, -2, 2, 0, 1));

  const trendMacdHist = macd
    .map((v) => (v.histogram > 0 ? 1 : v.histogram < 0 ? -1 : 0))
    .map((v) => normalize(v, -1, 1, 0, 1));

  // Parabolic Stop and Reverse
  const trendPsar = psar
    .map((v, i, l) =>
      close[close.length - (l.length - i)] > v
        ? 1
        : close[close.length - (l.length - i)] < v
        ? -1
        : 0
    )
    .map((v) => normalize(v, -1, 1, 0, 1));

  // Stochastic RSI
  const trendStochRsi = stochRsi
    .map((v) => (v.k > v.d ? 1 : v.k < v.d ? -1 : 0))
    .map((v) => normalize(v, -1, 1, 0, 1));

  // Supertrend
  const trendSupertrend = supertrend
    .map((v) => v.trend)
    .map((v) => normalize(v, -1, 1, 0, 1));

  // Williams Percent Range
  const trendWpr = wpr
    .map((v) => (v > -50 ? 1 : v < -50 ? -1 : 0))
    .map((v) => normalize(v, -1, 1, 0, 1));

  // ==================== VALUE OF INDICATORS =================== //

  // Average Directional Index
  const valAdx = adx.map((v) => normalize(v.adx, 0, 100, 0, 1));

  // Average Directional Index
  const valRsi = rsi.map((v) => normalize(v, 0, 100, 0, 1));

  // Commodity Channel Index
  const valCci = cci
    .map((v) => (v > 100 ? 2 : v < -100 ? -2 : v > 0 ? 1 : v < 0 ? -1 : 0))
    .map((v) => normalize(v, -2, 2, 0, 1));

  // Money Flow Index
  const valMfi = mfi.map((v) => normalize(v, 0, 100, 0, 1));

  // William R
  const valWpr = wpr.map((v) => normalize(v, -100, 0, 0, 1));

  // Relative Momentum Index
  const valRmi = RMI.calculate({
    values: close,
    length: 14,
    momentum: 3,
  }).map((v) => normalize(v, 0, 100, 0, 1));

  // Oscillator volume
  const valVolOsc = VolumeOscillator.calculate({
    shortLength: 5,
    longLength: 10,
    volume,
  }).map((v) => normalize(v, 0, 100, 0, 1));

  // Aroon
  const vaAroonUpper = aroon
    .map((v) => v.upper)
    .map((v) => normalize(v, 0, 100, 0, 1));
  const vaAroonLower = aroon
    .map((v) => v.lower)
    .map((v) => normalize(v, 0, 100, 0, 1));

  // ==================== SIGNALS OF INDICATORS =================== //

  // Money Flow Index
  const signalMfi = mfi
    .map((v, i, l) => {
      if (i < 1) return 0;
      if (l[i - 1] < 20 && v > 20) return 1;
      if (l[i - 1] > 80 && v < 80) return -1;
      return 0;
    })
    .map((v) => normalize(v, -1, 1, 0, 1));

  const signalRsi = rsi
    .map((v, i, l) => {
      if (i < 1) return 0;
      if (l[i - 1] < 30 && v > 30) return 1;
      if (l[i - 1] > 70 && v < 70) return -1;
      return 0;
    })
    .map((v) => normalize(v, -1, 1, 0, 1));

  // Commodity Channel Index
  const signalCci = cci
    .map((v, i, l) => {
      if (i < 1) return 0;
      if (l[i - 1] < -100 && v > -100) return 1;
      if (l[i - 1] > 100 && v < 100) return -1;
      return 0;
    })
    .map((v) => normalize(v, -1, 1, 0, 1));

  // MACD
  const signalMacd = macd
    .map((v, i, l) => {
      if (i < 1) return 0;
      if (l[i - 1].MACD < l[i - 1].signal && v.MACD > v.signal) return 1;
      if (l[i - 1].MACD > l[i - 1].signal && v.MACD < v.signal) return -1;
      return 0;
    })
    .map((v) => normalize(v, -1, 1, 0, 1));

  // MACD Histogram
  const signalMacdHist = macd
    .map((v, i, l) => {
      if (i < 1) return 0;
      if (l[i - 1].histogram < 0 && v.histogram > 0) return 1;
      if (l[i - 1].histogram > 0 && v.histogram < 0) return -1;
      return 0;
    })
    .map((v) => normalize(v, -1, 1, 0, 1));

  // Stochastic RSI
  const signalStochRsi = stochRsi
    .map((v, i, l) => {
      if (i < 1) return 0;
      if (l[i - 1].k < l[i - 1].d && v.k > v.d) return 1;
      if (l[i - 1].k > l[i - 1].d && v.k < v.d) return -1;
      return 0;
    })
    .map((v) => normalize(v, -1, 1, 0, 1));

  // William R
  const signalWpr = wpr
    .map((v, i, l) => {
      if (i < 1) return 0;
      if (l[i - 1] < -80 && v > -80) return 1;
      if (l[i - 1] > -20 && v < -20) return -1;
      return 0;
    })
    .map((v) => normalize(v, -1, 1, 0, 1));

  // Parabolic Stop and Reverse
  const signalPsar = psar
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
  const signalAroon = aroon
    .map((v, i, l) => {
      if (i < 1) return 0;
      if (l[i - 1].upper < l[i - 1].lower && v.upper > v.lower) return 1;
      if (l[i - 1].upper > l[i - 1].lower && v.upper < v.lower) return -1;
      return 0;
    })
    .map((v) => normalize(v, -1, 1, 0, 1));

  // Supertrend
  const signalSupertrend = supertrend
    .map((v, i, l) => {
      if (i < 1) return 0;
      if (l[i - 1].trend < v.trend) return -1;
      if (l[i - 1].trend > v.trend) return 1;
      return 0;
    })
    .map((v) => normalize(v, -1, 1, 0, 1));

  // Kijun
  const signalKijun = ichimoku
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
  const signalSupportResistance = supportResistance
    .map((v, i, l) => {
      if (i < 1) return 0;
      if (
        close[close.length - (l.length - i)] > v.top &&
        close[close.length - 1 - (l.length - i)] < v.top
      )
        return 1;
      if (
        close[close.length - (l.length - i)] < v.bottom &&
        close[close.length - 1 - (l.length - i)] > v.bottom
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
    // Trend
    trendEma21,
    trendEma50,
    trendSma100,
    trendSma200,
    trendAroon,
    trendHma,
    trendMacdHist,
    trendMacdSignal,
    trendPsar,
    trendRoc,
    trendStochRsi,
    trendSupertrend,
    trendWma,
    trendKijun,
    trendCloud,
    trendWpr,
    // Values
    valAdx,
    valCci,
    valMfi,
    valRmi,
    valRsi,
    valVolOsc,
    valWpr,
    vaAroonUpper,
    vaAroonLower,
    // Signals
    signalAroon,
    signalCci,
    signalKijun,
    signalMacd,
    signalMacdHist,
    signalMfi,
    signalPsar,
    signalRsi,
    signalStochRsi,
    signalSupertrend,
    signalSupportResistance,
    signalWpr,
    // Pattern
    bullishPattern,
    bearishPattern,
    candleSide,
    // Time
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
