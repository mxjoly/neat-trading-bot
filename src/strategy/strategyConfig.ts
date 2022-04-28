import { CandleChartInterval } from 'binance-api-node';
import { getPositionSizeByRisk } from './riskManagement';
import { basicStrategy } from './exitStrategy';

const config: StrategyConfig = {
  asset: 'BTC',
  base: 'USDT',
  interval: CandleChartInterval.FIVE_MINUTES,
  risk: 0.01,
  leverage: 20,
  tradingSession: [
    {
      day: 1,
      start: { hour: '07', minute: '00' },
      end: { hour: '22', minutes: '00' },
    },
    {
      day: 2,
      start: { hour: '07', minute: '00' },
      end: { hour: '22', minutes: '00' },
    },
    {
      day: 3,
      start: { hour: '07', minute: '00' },
      end: { hour: '22', minutes: '00' },
    },
    {
      day: 4,
      start: { hour: '07', minute: '00' },
      end: { hour: '22', minutes: '00' },
    },
    {
      day: 5,
      start: { hour: '07', minute: '00' },
      end: { hour: '22', minutes: '00' },
    },
  ],
  exitStrategy: (price, candles, pricePrecision, side) =>
    basicStrategy(price, candles, pricePrecision, side, {
      profitTarget: 0.02,
      lossTolerance: 0.02,
    }),
  riskManagement: getPositionSizeByRisk,
};
export default config;
