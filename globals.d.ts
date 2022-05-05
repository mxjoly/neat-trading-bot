interface StrategyConfig {
  asset: string;
  base: string;
  interval: CandleChartInterval;
  leverage?: number;
  risk: number; // % of total balance to risk in a trade
  maxTradeDuration?: number; // Max duration of a trade in the unit of the loopInterval
  trailingStopConfig?: TrailingStopConfig; // Configuration of a trailing stop
  tradingSessions?: TradingSession[]; // The robot trades only during these sessions
  canOpenNewPositionToCloseLast?: boolean;
  exitStrategy?: ExitStrategy; // Placement of take profits and stop loss
  trendFilter?: TrendFilter; // Trend filter - If the trend is up, only take long, else take only short
  riskManagement: RiskManagement;
}

interface CandleData {
  symbol: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  openTime: Date;
  closeTime: Date;
  interval: CandleChartInterval;
}

// Strategy for Take Profits and Stop Loss
type ExitStrategy = (
  price?: number,
  candles?: CandlesDataMultiTimeFrames,
  pricePrecision?: number,
  side: OrderSide // type from binance api lib
) => {
  takeProfit?: number;
  stopLoss?: number;
};

type TrailingStopConfig = {
  // Activation price of trailing stop calculated by :
  // changePercentage: the price moves X% (0 to 1) in the positive
  // percentageToTP: the price reach X% (0 to 1) of the nearest take profit
  activation: { changePercentage?: number; percentageToTP: number };
  callbackRate: number; // Percentage between 0 and 1 - stop loss if the price increase/decrease of % from last candle
};

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

type TradingSession = {
  day: 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 (Sunday) to 6 (Saturday)
  start: { hour: string; minute: string };
  end: { hour: string; minutes: string };
};
