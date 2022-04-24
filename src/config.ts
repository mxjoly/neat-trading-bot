import { CandleChartInterval } from 'binance-api-node';
import { getPositionSizeByRisk } from './riskManagement';
import { basicStrategy } from './exitStrategy';

/**
 * Default config for neat algorithm
 */
const config: StrategyConfig = {
  asset: 'BTC',
  base: 'USDT',
  interval: CandleChartInterval.FIFTEEN_MINUTES,
  risk: 1,
  leverage: 20,
  exitStrategy: (price, candles, pricePrecision, side) =>
    basicStrategy(price, pricePrecision, side, {
      profitTarget: 0.01,
      lossTolerance: 0.005,
    }),
  riskManagement: getPositionSizeByRisk,
};
export default config;
