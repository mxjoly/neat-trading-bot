import { CandleChartInterval } from 'binance-api-node';
import { getPositionSizeByRisk } from './riskManagement';
import { atrStrategy } from './exitStrategy';

const config: StrategyConfig = {
  asset: 'BTC',
  base: 'USDT',
  interval: CandleChartInterval.FIVE_MINUTES,
  risk: 0.01,
  leverage: 20,
  exitStrategy: (price, candles, pricePrecision, side) =>
    atrStrategy(price, candles, pricePrecision, side, {
      atrPeriod: 14,
      atrMultiplier: 2.0,
      stopLossAtrRatio: 2,
      takeProfitAtrRatio: 2,
    }),
  riskManagement: getPositionSizeByRisk,
};
export default config;
