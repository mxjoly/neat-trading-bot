import dayjs from 'dayjs';
import { ExchangeInfo, OrderSide, OrderType } from 'binance-api-node';
import { log, error } from './utils/log';
import { binanceClient } from './init';
import { Counter } from './tools/counter';
import { loadCandlesFromAPI } from './utils/loadCandleData';
import Genome from './core/genome';

// ====================================================================== //

/**
 * Production bot
 */
export class Bot {
  private strategyConfigs: StrategyConfig[];

  // Counter to fix the max duration of each trade
  private counters: { [symbol: string]: Counter };

  // Neat
  private brain: Genome;
  private decisions: number[];
  private visions: number[];

  constructor(tradeConfigs: StrategyConfig[], brain: Genome) {
    this.strategyConfigs = tradeConfigs;
    this.counters = {};
    this.brain = brain;
  }

  /**
   * Prepare the account
   */
  public async prepare() {
    // Set the margin type and initial leverage for the futures
    this.strategyConfigs.forEach((tradeConfig) => {
      const pair = tradeConfig.asset + tradeConfig.base;

      binanceClient
        .futuresLeverage({
          symbol: pair,
          leverage: tradeConfig.leverage || 1,
        })
        .then(() =>
          log(`Leverage for ${pair} is set to ${tradeConfig.leverage || 1}`)
        )
        .catch(error);

      binanceClient
        .futuresMarginType({
          symbol: pair,
          marginType: 'ISOLATED',
        })
        .catch(error);
    });

    // Initialize the counters
    this.strategyConfigs.forEach(({ asset, base, maxTradeDuration }) => {
      if (maxTradeDuration)
        this.counters[asset + base] = new Counter(maxTradeDuration);
    });
  }

  /**
   * Main function
   */
  public async run() {
    log(
      '====================== 💵 BINANCE BOT TRADING 💵 ======================'
    );

    // Get the exchange info
    const exchangeInfo = await binanceClient.futuresExchangeInfo();

    this.strategyConfigs.forEach(async (tradeConfig) => {
      const pair = tradeConfig.asset + tradeConfig.base;
      log(`The bot trades the pair ${pair}`);

      let candles = await loadCandlesFromAPI(
        pair,
        tradeConfig.interval,
        binanceClient
      );

      binanceClient.ws.futuresCandles(pair, tradeConfig.interval, (candle) => {
        if (candle.isFinal) {
          candles.push({
            open: Number(candle.open),
            high: Number(candle.high),
            low: Number(candle.low),
            close: Number(candle.close),
            volume: Number(candle.volume),
            closeTime: new Date(candle.closeTime),
            openTime: new Date(candle.startTime),
          });
          candles = candles.slice(1);

          this.look(candles);
          this.think();

          this.tradeWithFutures(
            tradeConfig,
            Number(candle.close),
            candles,
            exchangeInfo
          );
        }
      });
    });
  }

  /**
   * Main futures function (long/short, open/close orders)
   * @param strategyConfig
   * @param currentPrice
   * @param candles
   * @param exchangeInfo
   */
  private async tradeWithFutures(
    strategyConfig: StrategyConfig,
    currentPrice: number,
    candles: CandleData[],
    exchangeInfo: ExchangeInfo
  ) {
    const {
      asset,
      base,
      risk,
      trendFilter,
      riskManagement,
      tradingSession,
      maxTradeDuration,
    } = strategyConfig;
    const pair = asset + base;

    // Check the trend
    const useLongPosition = trendFilter ? trendFilter(candles) === 1 : true;
    const useShortPosition = trendFilter ? trendFilter(candles) === -1 : true;

    // Balance information
    const balances = await binanceClient.futuresAccountBalance();
    const { balance: assetBalance, availableBalance } = balances.find(
      (balance) => balance.asset === base
    );

    // Position information
    const { positions } = await binanceClient.futuresAccountInfo();
    const position = positions.find((position) => position.symbol === pair);
    const hasLongPosition = Number(position.positionAmt) > 0;
    const hasShortPosition = Number(position.positionAmt) < 0;
    const positionSize = Math.abs(Number(position.positionAmt));
    const positionEntryPrice = Number(position.entryPrice);

    // Decision to take
    let max = Math.max(...this.decisions);
    const isBuySignal =
      max === this.decisions[0] && this.decisions[0] > 0.6 && !hasShortPosition;
    const isSellSignal =
      max === this.decisions[1] && this.decisions[1] > 0.6 && !hasLongPosition;
    const closePosition =
      max === this.decisions[2] &&
      this.decisions[2] > 0.6 &&
      (hasShortPosition || hasLongPosition);

    // Conditions to take or not a position
    const canTakeLongPosition = useLongPosition && positionSize === 0;
    const canTakeShortPosition = useShortPosition && positionSize === 0;
    const canClosePosition =
      Math.abs(currentPrice - positionEntryPrice) >= positionEntryPrice * 0.01;

    // Check if we are in the trading sessions
    const isTradingSessionActive = this.isTradingSessionActive(
      candles[candles.length - 1].closeTime,
      tradingSession
    );

    // The current position is too long
    if (
      maxTradeDuration &&
      (hasShortPosition || hasLongPosition) &&
      this.counters[pair]
    ) {
      this.counters[pair].decrement();
      if (this.counters[pair].getValue() == 0) {
        binanceClient
          .futuresOrder({
            symbol: pair,
            type: OrderType.MARKET,
            quantity: String(positionSize),
            side: hasLongPosition ? OrderSide.SELL : OrderSide.BUY,
          })
          .then(() => {
            this.counters[pair].reset();
            log(
              `The position on ${pair} is longer that the maximum authorized duration. Position has been closed.`
            );
          })
          .catch(error);
        return;
      }
    }

    // Reset the counter if a previous trade close a the position
    if (
      maxTradeDuration &&
      !hasLongPosition &&
      !hasShortPosition &&
      this.counters[pair].getValue() < maxTradeDuration
    ) {
      this.counters[pair].reset();
    }

    // Close the current position
    if (
      closePosition &&
      (hasLongPosition || hasShortPosition) &&
      canClosePosition
    ) {
      binanceClient
        .futuresOrder({
          side: hasLongPosition ? OrderSide.SELL : OrderSide.BUY,
          type: OrderType.MARKET,
          symbol: pair,
          quantity: String(Math.abs(positionSize)),
        })
        .then(() => {
          log(`Close the position on ${pair} at the price ${currentPrice}`);
          return;
        })
        .catch(error);
    }

    if (
      (isTradingSessionActive || positionSize !== 0) &&
      canTakeLongPosition &&
      isBuySignal
    ) {
      //Calculate the quantity for the position according to the risk management of the strategy
      let quantity = riskManagement({
        asset,
        base,
        balance: Number(availableBalance),
        risk,
        enterPrice: currentPrice,
        exchangeInfo,
      });

      binanceClient
        .futuresOrder({
          side: OrderSide.BUY,
          type: OrderType.MARKET,
          symbol: pair,
          quantity: String(quantity),
        })
        .then(() => {
          log(
            `Open a long position on ${asset}${base} at the price ${currentPrice} with a size of ${quantity}${asset}`
          );
        })
        .catch(error);
    } else if (
      (isTradingSessionActive || positionSize !== 0) &&
      canTakeShortPosition &&
      isSellSignal
    ) {
      // Calculate the quantity for the position according to the risk management of the strategy
      let quantity = riskManagement({
        asset,
        base,
        balance: Number(availableBalance),
        risk,
        enterPrice: currentPrice,
        exchangeInfo,
      });

      binanceClient
        .futuresOrder({
          side: OrderSide.SELL,
          type: OrderType.MARKET,
          symbol: pair,
          quantity: String(quantity),
          recvWindow: 60000,
        })
        .then(() => {
          log(
            `Open a short position on ${asset}${base} at the price ${currentPrice} with a size of ${quantity}${asset}`
          );
        })
        .catch(error);
    }
  }

  /**
   * Check if we are in a trading session. If not, the robot waits, and does nothing
   * @param currentDate
   * @param tradingSession
   */
  private isTradingSessionActive(
    currentDate: Date,
    tradingSession?: TradingSession
  ) {
    if (tradingSession) {
      // Check if we are in the trading sessions
      const currentTime = dayjs(currentDate);
      const currentDay = currentTime.format('YYYY-MM-DD');
      const startSessionTime = `${currentDay} ${tradingSession.start}:00`;
      const endSessionTime = `${currentDay} ${tradingSession.end}:00`;
      return dayjs(currentTime.format('YYYY-MM-DD HH:mm:ss')).isBetween(
        startSessionTime,
        endSessionTime
      );
    } else {
      return true;
    }
  }

  private look(candles: CandleData[]) {
    // ...
  }

  private think() {
    var max = 0;
    var maxIndex = 0;

    // Get the output of the neural network
    this.decisions = this.brain.feedForward(this.visions);

    for (var i = 0; i < this.decisions.length; i++) {
      if (this.decisions[i] > max) {
        max = this.decisions[i];
        maxIndex = i;
      }
    }
  }
}
