import { CandleChartInterval } from 'binance-api-node';
import { getPositionSizeByRisk } from './riskManagement';
import { atrStrategy } from './exitStrategy';

const config: StrategyConfig = {
  asset: 'BTC',
  base: 'USDT',
  interval: CandleChartInterval.FIFTEEN_MINUTES,
  risk: 0.01,
  leverage: 20,
  exitStrategy: (price, candles, pricePrecision, side) =>
    atrStrategy(price, candles, pricePrecision, side, {
      atrMultiplier: 2,
      atrPeriod: 10,
      stopLossAtrRatio: 1,
      takeProfitAtrRatio: 2,
    }),
  riskManagement: getPositionSizeByRisk,
};
export default config;
