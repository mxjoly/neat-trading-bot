import { normalize } from '../utils/math';
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
  TRIX,
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
import dayjs from 'dayjs';

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

  const ema10 = EMA.calculate({
    period: 10,
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

  const ema15 = EMA.calculate({
    period: 15,
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

  const ema20 = EMA.calculate({
    period: 20,
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

  const ema25 = EMA.calculate({
    period: 25,
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

  const ema30 = EMA.calculate({
    period: 30,
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

  const ema35 = EMA.calculate({
    period: 35,
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

  const ema40 = EMA.calculate({
    period: 40,
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

  const ema45 = EMA.calculate({
    period: 45,
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

  const ema50 = EMA.calculate({
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

  const sma100 = SMA.calculate({
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

  const sma200 = SMA.calculate({
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
  const vwa = VWAP.calculate({
    close,
    high,
    low,
    volume,
  })
    .map((v, i, l) =>
      close[close.length - (l.length - i)] > v
        ? 1
        : close[close.length - (l.length - i)] < v
        ? -1
        : 0
    )
    .map((v) => normalize(v, -1, 1, 0, 1));

  // Hull Moving Average
  const hma = HMA.calculate({ values: close, period: 14 })
    .map((v, i, l) =>
      close[close.length - (l.length - i)] > v
        ? 1
        : close[close.length - (l.length - i)] < v
        ? -1
        : 0
    )
    .map((v) => normalize(v, -1, 1, 0, 1));

  // Average Directional Index
  const adx = ADX.calculate({
    period: 14,
    close,
    high,
    low,
  }).map((v) => normalize(v.adx, 0, 100, 0, 1));

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
  })
    .map((v) => (v > 0 ? 1 : v < 0 ? -1 : 0))
    .map((v) => normalize(v, -1, 1, 0, 1));

  // Money Flow Index
  const mfi = MFI.calculate({
    period: 14,
    volume,
    close,
    high,
    low,
  }).map((v) => normalize(v, 0, 100, 0, 1));

  // Rate of Change
  const roc = ROC.calculate({
    period: 9,
    values: close,
  })
    .map((v) => (v > 100 ? 1 : v < 100 ? -1 : 0))
    .map((v) => normalize(v, -1, 1, 0, 1));

  // Relative Strength Index
  const rsi = RSI.calculate({
    period: 14,
    values: close,
  }).map((v) => normalize(v, 0, 100, 0, 1));

  // William R
  const williamR = WilliamsR.calculate({
    period: 14,
    close,
    high,
    low,
  }).map((v) => normalize(v, -100, 0, 0, 1));

  // Aroon
  const aroon = Aroon.calculate({
    length: 14,
    high,
    low,
  })
    .map((v) => (v.upper > v.lower ? 1 : v.upper < v.lower ? -1 : 0))
    .map((v) => normalize(v, -1, 1, 0, 1));

  // Ichimoku
  const ichimoku = IchimokuCloud.calculate({
    conversionPeriod: 9,
    basePeriod: 26,
    spanPeriod: 52,
    displacement: 26,
    high,
    low,
  });

  // Kijun
  const kijun = ichimoku
    .map((v, i, l) =>
      close[close.length - (l.length - i)] > v.base
        ? 1
        : close[close.length - (l.length - i)] < v.base
        ? -1
        : 0
    )
    .map((v) => normalize(v, -1, 1, 0, 1));

  // Ichimokou cloud
  const cloud = ichimoku.map((v, i, l) =>
    close[close.length - (l.length - i)] > v.spanA && v.spanA > v.spanB
      ? 1
      : close[close.length - (l.length - i)] < v.spanA && v.spanA < v.spanB
      ? -1
      : 0
  );

  // Oscillator volume
  const volOsc = VolumeOscillator.calculate({
    shortLength: 5,
    longLength: 10,
    volume,
  }).map((v) => normalize(v, 0, 100, 0, 1));

  // MACD
  const macd = MACD.calculate({
    values: close,
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: true,
    SimpleMASignal: true,
  })
    .map((v) => {
      let a = v.MACD > v.signal ? 1 : v.MACD < v.signal ? -1 : 0;
      let b = v.histogram > 0 ? 1 : v.histogram < 0 ? -1 : 0;
      return a + b;
    })
    .map((v) => normalize(v, -2, 2, 0, 1));

  // Parabolic Stop and Reverse
  const psar = PSAR.calculate({
    high,
    low,
    max: 0.2,
    step: 0.02,
  })
    .map((v, i, l) =>
      close[close.length - (l.length - i)] > v
        ? 1
        : close[close.length - (l.length - i)] < v
        ? -1
        : 0
    )
    .map((v) => normalize(v, -1, 1, 0, 1));

  // Stochastic RSI
  const stochRsi = StochasticRSI.calculate({
    values: close,
    dPeriod: 3,
    kPeriod: 3,
    rsiPeriod: 14,
    stochasticPeriod: 14,
  })
    .map((v) => (v.k > v.d ? 1 : v.k < v.d ? -1 : 0))
    .map((v) => normalize(v, -1, 1, 0, 1));

  // Triple Exponentially Smoothed Average
  const trix = TRIX.calculate({
    period: 18,
    values: close,
  })
    .map((v) => (v > 0 ? 1 : v < 0 ? -1 : 0))
    .map((v) => normalize(v, -1, 1, 0, 1));

  // Relative Momentum Index
  const rmi = RMI.calculate({
    values: close,
    length: 14,
    momentum: 3,
  }).map((v) => normalize(v, 0, 100, 0, 1));

  // Supertrend
  const supertrend = Supertrend.calculate({
    close,
    high,
    low,
    atrPeriod: 10,
    atrMultiplier: 3,
  })
    .map((v) => v.trend)
    .map((v) => normalize(v, -1, 1, 0, 1));

  // Support resistance
  const supportResistance = SupportResistance.calculate({
    high,
    low,
    left: 8,
    right: 7,
  })
    .map((v, i, l) =>
      close[close.length - (l.length - i)] > v.top
        ? 1
        : close[close.length - (l.length - i)] < v.bottom
        ? -1
        : 0
    )
    .map((v) => normalize(v, -1, 1, 0, 1));

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

  // White or Black candle ?
  const candleSide = candles.map((c) => (c.open > c.close ? 1 : -1));

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
    ema10,
    ema15,
    ema20,
    ema25,
    ema30,
    ema35,
    ema40,
    ema45,
    ema50,
    sma100,
    sma200,
    vwa,
    hma,
    adx,
    ao,
    cci,
    mfi,
    roc,
    rsi,
    williamR,
    aroon,
    kijun,
    cloud,
    volOsc,
    macd,
    psar,
    stochRsi,
    trix,
    rmi,
    supertrend,
    supportResistance,
    bullishPattern,
    bearishPattern,
    candleSide,
    day,
    hour,
    isNewYorkSession,
    isLondonSession,
    isTokyoSession,
  ]
    .filter((i) => i !== null)
    .map((values) => {
      // Set the same length for the array of indicator values
      let diff = candles.length - values.length;
      return new Array(diff).fill(null).concat(values);
    });

  return inputs;
}
