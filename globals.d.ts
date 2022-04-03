interface StrategyConfig {
  asset: string;
  base: string;
  interval: CandleChartInterval;
  leverage?: number;
  risk: number; // % of total balance to risk in a trade
  tradingSession?: TradingSession; // The robot trades only during these session
  maxTradeDuration?: number; // Max duration of a trade in the unit of the loopInterval
  trendFilter?: TrendFilter; // Trend filter - If the trend is up, only take long, else take only short
  riskManagement: RiskManagement;
}

interface CandleData {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  openTime: Date;
  closeTime: Date;
}

type TrendFilter = (candles: CandleData[]) => Trend;

type Trend = 1 | -1 | 0; // 1: up trend, -1: down trend, 0: neutral

interface RiskManagementOptions {
  asset: string;
  base: string;
  balance: number;
  risk: number;
  enterPrice: number;
  stopLossPrice?: number;
  exchangeInfo: ExchangeInfo;
}
type RiskManagement = (options: RiskManagementOptions) => number; // Return the size of the position

// type QueryOrderResult from the library binance-api-node
type TradeManagement = (orderInfos: QueryOrderResult[]) => void;

type TradingSession = { start: string; end: string }; // HH:mm
