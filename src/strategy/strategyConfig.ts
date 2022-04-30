import { CandleChartInterval } from 'binance-api-node';
import { getPositionSizeByRisk } from './riskManagement';
import { basicStrategy } from './exitStrategy';

const config: StrategyConfig = {
  asset: 'BTC',
  base: 'USDT',
  interval: CandleChartInterval.FIVE_MINUTES,
  risk: 0.01,
  leverage: 20,
  exitStrategy: (price, candles, pricePrecision, side) =>
    basicStrategy(price, candles, pricePrecision, side, {
      lossTolerance: 0.05,
      profitTarget: 0.05,
    }),
  riskManagement: getPositionSizeByRisk,
};
export default config;
