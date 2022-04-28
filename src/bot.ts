import {
  ExchangeInfo,
  FuturesAccountInfoResult,
  OrderSide,
  OrderType,
} from 'binance-api-node';
import { log, error } from './utils/log';
import { binanceClient } from './init';
import { Counter } from './tools/counter';
import { loadCandlesFromAPI } from './utils/loadCandleData';
import Genome from './core/genome';
import { calculateIndicators } from './training/indicators';
import { getPricePrecision, getQuantityPrecision } from './utils/currencyInfo';
import { calculateActivationPrice } from './utils/trailingStop';
import { isOnTradingSession } from './utils/tradingSession';

// ====================================================================== //

/**
 * Production bot
 */
export class Bot {
  private strategyConfig: StrategyConfig;

  // Counter to fix the max duration of each trade
  private counter: Counter;

  // Infos
  private exchangeInfo: ExchangeInfo;
  private accountInfo: FuturesAccountInfoResult;

  // Neat
  private brain: Genome;
  private decisions: number[];
  private visions: number[];

  constructor(strategyConfig: StrategyConfig, brain: Genome) {
    this.strategyConfig = strategyConfig;
    this.brain = brain;
    if (strategyConfig.maxTradeDuration) {
      this.counter = new Counter(strategyConfig.maxTradeDuration);
    }
  }

  /**
   * Prepare the account
   */
  public async prepare() {
    let { asset, base, leverage } = this.strategyConfig;
    const pair = asset + base;

    // Set the margin type and initial leverage for the futures
    binanceClient
      .futuresLeverage({
        symbol: pair,
        leverage: leverage || 1,
      })
      .then(() => log(`Leverage for ${pair} is set to ${leverage || 1}`))
      .catch(error);

    binanceClient
      .futuresMarginType({
        symbol: pair,
        marginType: 'ISOLATED',
      })
      .catch(error);
  }

  /**
   * Main function
   */
  public async run() {
    log(
      '====================== 💵 BINANCE BOT TRADING 💵 ======================'
    );

    // Get the exchange info
    this.exchangeInfo = await binanceClient.futuresExchangeInfo();

    let { asset, base, interval } = this.strategyConfig;

    const pair = asset + base;
    log(`The bot trades the pair ${pair}`);

    let candles = await loadCandlesFromAPI(pair, interval, binanceClient);

    binanceClient.ws.futuresCandles(pair, interval, async (candle) => {
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

        this.accountInfo = await binanceClient.futuresAccountInfo();

        this.look(candles);
        this.think();

        this.tradeWithFutures(
          this.strategyConfig,
          Number(candle.close),
          candles
        );
      }
    });
  }

  /**
   * Main futures function (long/short, open/close orders)
   * @param strategyConfig
   * @param currentPrice
   * @param candles
   */
  private async tradeWithFutures(
    strategyConfig: StrategyConfig,
    currentPrice: number,
    candles: CandleData[]
  ) {
    const {
      asset,
      base,
      risk,
      tradingSessions,
      maxTradeDuration,
      trailingStopConfig,
      trendFilter,
      riskManagement,
      exitStrategy,
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
    const { positions } = this.accountInfo;
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

    // Conditions to take or not a position
    const canTakeLongPosition = useLongPosition && positionSize === 0;
    const canTakeShortPosition = useShortPosition && positionSize === 0;

    // Currency infos
    const pricePrecision = getPricePrecision(pair, this.exchangeInfo);
    const quantityPrecision = getQuantityPrecision(pair, this.exchangeInfo);

    // Check if we are in the trading sessions
    const isTradingSessionActive = isOnTradingSession(
      candles[candles.length - 1].closeTime,
      tradingSessions
    );

    // Open orders
    const currentOpenOrders = await binanceClient.futuresOpenOrders({
      symbol: pair,
    });

    // The current position is too long
    if (
      this.counter &&
      maxTradeDuration &&
      (hasShortPosition || hasLongPosition)
    ) {
      this.counter.decrement();
      if (this.counter.getValue() == 0) {
        binanceClient
          .futuresOrder({
            symbol: pair,
            type: OrderType.MARKET,
            quantity: String(positionSize),
            side: hasLongPosition ? OrderSide.SELL : OrderSide.BUY,
          })
          .then(() => {
            this.counter.reset();
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
      this.counter &&
      maxTradeDuration &&
      !hasLongPosition &&
      !hasShortPosition &&
      this.counter.getValue() < maxTradeDuration
    ) {
      this.counter.reset();
    }

    if (
      (isTradingSessionActive || positionSize !== 0) &&
      canTakeLongPosition &&
      currentOpenOrders.length === 0 &&
      isBuySignal
    ) {
      // Calculate TP and SL
      let { takeProfit, stopLoss } = exitStrategy
        ? exitStrategy(currentPrice, candles, pricePrecision, OrderSide.BUY)
        : { takeProfit: null, stopLoss: null };

      // Calculate the quantity for the position according to the risk management of the strategy
      let quantity = riskManagement({
        asset,
        base,
        balance: Number(availableBalance),
        risk,
        enterPrice: currentPrice,
        stopLossPrice: stopLoss,
        exchangeInfo: this.exchangeInfo,
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

      if (takeProfit) {
        binanceClient
          .futuresOrder({
            side: OrderSide.SELL,
            type: OrderType.LIMIT,
            symbol: pair,
            quantity: String(quantity),
            price: takeProfit,
          })
          .catch(error);
      }

      if (stopLoss) {
        binanceClient
          .futuresOrder({
            side: OrderSide.SELL,
            type: OrderType.STOP,
            symbol: pair,
            quantity: String(quantity),
            price: stopLoss,
            stopPrice: stopLoss,
          })
          .catch(error);
      }

      if (trailingStopConfig) {
        let activationPrice = calculateActivationPrice(
          trailingStopConfig,
          currentPrice,
          pricePrecision,
          takeProfit
        );

        binanceClient.futuresOrder({
          side: OrderSide.SELL,
          type: OrderType.TRAILING_STOP_MARKET,
          symbol: pair,
          quantity: String(quantity),
          callbackRate: trailingStopConfig.callbackRate * 100,
          activationPrice,
        });
      }
    } else if (
      (isTradingSessionActive || positionSize !== 0) &&
      canTakeShortPosition &&
      currentOpenOrders.length === 0 &&
      isSellSignal
    ) {
      // Calculate TP and SL
      let { takeProfit, stopLoss } = exitStrategy
        ? exitStrategy(currentPrice, candles, pricePrecision, OrderSide.SELL)
        : { takeProfit: null, stopLoss: null };

      // Calculate the quantity for the position according to the risk management of the strategy
      let quantity = riskManagement({
        asset,
        base,
        balance: Number(availableBalance),
        risk,
        enterPrice: currentPrice,
        stopLossPrice: stopLoss,
        exchangeInfo: this.exchangeInfo,
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

      if (takeProfit) {
        binanceClient
          .futuresOrder({
            side: OrderSide.BUY,
            type: OrderType.LIMIT,
            symbol: pair,
            quantity: String(quantity),
            price: takeProfit,
          })
          .catch(error);
      }

      if (stopLoss) {
        binanceClient
          .futuresOrder({
            side: OrderSide.BUY,
            type: OrderType.STOP,
            symbol: pair,
            quantity: String(quantity),
            price: stopLoss,
            stopPrice: stopLoss,
          })
          .catch(error);
      }

      if (trailingStopConfig) {
        let activationPrice = calculateActivationPrice(
          trailingStopConfig,
          currentPrice,
          pricePrecision,
          takeProfit
        );

        binanceClient.futuresOrder({
          side: OrderSide.BUY,
          type: OrderType.TRAILING_STOP_MARKET,
          symbol: pair,
          quantity: String(quantity),
          callbackRate: trailingStopConfig.callbackRate * 100,
          activationPrice,
        });
      }
    }
  }

  /**
   * Get the inputs for the brain
   * @param candles
   */
  private look(candles: CandleData[]) {
    let indicatorVisions = calculateIndicators(candles).map(
      (indicator) => indicator[indicator.length - 1]
    );

    this.visions = indicatorVisions;
  }

  /**
   * Get the outputs of the brain
   */
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
