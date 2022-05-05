import { RSI } from 'technicalindicators';
import { getCandleSourceType } from '../../utils/loadCandleData';

interface Options {
  sourceType?: SourceType;
  period?: number;
}

const defaultOptions: Options = {
  sourceType: 'close',
  period: 14,
};

// let cache = new Cache();

export function calculate(candles: CandleData[], options?: Options) {
  let { symbol, interval, openTime } = candles[candles.length - 1];
  options = { ...defaultOptions, ...options };

  let values = getCandleSourceType(candles, options.sourceType);
  let result: number[] = RSI.calculate({ values, period: options.period });

  return result;
}
