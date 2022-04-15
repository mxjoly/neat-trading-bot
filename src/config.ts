import { CandleChartInterval } from 'binance-api-node';
import { getPositionSizeByPercent } from './riskManagement';

/**
 * Default config for neat algorithm
 */
const config: StrategyConfig = {
  asset: 'BTC',
  base: 'USDT',
  interval: CandleChartInterval.FIFTEEN_MINUTES,
  risk: 1,
  leverage: 20,
  maxTradeDuration: 12,
  riskManagement: getPositionSizeByPercent,
};
export default config;
