import { Binance, ExchangeInfo, OrderSide } from 'binance-api-node';
import { Counter } from '../tools/counter';
import Genome from './genome';
import { getPricePrecision, getQuantityPrecision } from '../utils/currencyInfo';
import { BotConfig } from '../init';
import { calculateActivationPrice } from '../utils/trailingStop';
import { isOnTradingSession } from '../utils/tradingSession';

const TAKER_FEES = BotConfig['taker_fees_futures']; // %
const MAKER_FEES = BotConfig['maker_fees_futures']; // %

export interface PlayerParams {
  genomeInputs: number;
  genomeOutputs: number;
  strategyConfig: StrategyConfig;
  binanceClient: Binance;
  exchangeInfo: ExchangeInfo;
  initialCapital: number;
  goals: TraderGoals;
  brain?: Genome;
}

/**
 * The trader
 */
class Player {
  private strategyConfig: StrategyConfig;
  private binanceClient: Binance;
  private exchangeInfo: ExchangeInfo;
  private initialCapital: number;
  private goals: TraderGoals;

  public wallet: Wallet;
  private openOrders: OpenOrder[];
  private counter: Counter; // to cut the position too long
  public stats: TraderStats; // Stats

  // NEAT Stuffs
  public fitness: number;
  private vision: number[]; // the inputs fed into the neuralNet
  private decisions: number[]; // the outputs of the NN
  private unadjustedFitness: number;
  private lifespan: number; // how long the player lived for fitness
  public bestScore = 0; // stores the score achieved used for replay
  public dead: boolean;
  public score: number; // the traders must respect these goals
  public generation: number;

  private genomeInputs: number;
  private genomeOutputs: number;
  public brain: Genome;

  constructor({
    genomeInputs,
    genomeOutputs,
    strategyConfig,
    binanceClient,
    exchangeInfo,
    initialCapital,
    goals,
    brain,
  }: PlayerParams) {
    this.strategyConfig = strategyConfig;
    this.binanceClient = binanceClient;
    this.exchangeInfo = exchangeInfo;
    this.initialCapital = initialCapital;
    this.goals = goals;

    this.stats = {
      totalTrades: 0,
      totalProfit: 0,
      totalLoss: 0,
      totalFees: 0,
      winningTrades: 0,
      lostTrades: 0,
      longTrades: 0,
      shortTrades: 0,
      longWinningTrades: 0,
      longLostTrades: 0,
      shortWinningTrades: 0,
      shortLostTrades: 0,
      maxBalance: initialCapital,
      maxRelativeDrawdown: 0,
    };

    this.wallet = {
      availableBalance: initialCapital,
      totalWalletBalance: initialCapital,
      totalUnrealizedProfit: 0,
      position: {
        pair: this.strategyConfig.asset + this.strategyConfig.base,
        leverage: this.strategyConfig.leverage | 1,
        entryPrice: 0,
        margin: 0,
        positionSide: 'LONG',
        unrealizedProfit: 0,
        size: 0,
      },
    };
    this.openOrders = [];

    // Neat stuffs
    this.fitness = 0;
    this.vision = [];
    this.decisions = [];
    this.unadjustedFitness;
    this.lifespan = 0;
    this.bestScore = 0;
    this.dead = false;
    this.score = 0;
    this.generation = 0;
    this.genomeInputs = genomeInputs;
    this.genomeOutputs = genomeOutputs;
    this.brain = brain || new Genome(genomeInputs, genomeOutputs);
    this.brain.generateFullNetwork();

    if (strategyConfig.maxTradeDuration) {
      this.counter = new Counter(strategyConfig.maxTradeDuration);
    }
  }

  /**
   * Move the player according to the outputs from the neural network
   * @param strategyConfig
   * @param candles
   * @param currentPrice
   */
  public update(
    strategyConfig: StrategyConfig,
    candles: CandleData[],
    currentPrice: number
  ) {
    this.lifespan++;

    let { totalLoss, totalProfit, totalFees } = this.stats;
    const totalNetProfit = totalProfit - (Math.abs(totalLoss) + totalFees);

    // Kill the bad traders
    if (this.wallet.totalWalletBalance <= 0) {
      this.dead = true;
      return;
    }

    // Kill the traders that doesn't trades
    if (this.lifespan > 500 && totalLoss === 0 && totalProfit === 0) {
      this.dead = true;
      return;
    }

    const { asset, base } = strategyConfig;
    this.checkPositionMargin(asset + base, currentPrice);
    this.checkOpenOrders(asset, base, candles);
    this.trade(this.strategyConfig, currentPrice, candles, this.exchangeInfo);

    // Update the max drawdown and max balance property for the strategy report
    this.updateDrawdownMaxBalance();

    // We measure the score of the trader by the profit generated
    this.score = totalNetProfit;
  }

  /**
   * Get inputs for brain
   */
  public look(indicators: number[]) {
    this.vision = indicators;
  }

  /**
   * Gets the output of the brain, then converts them to actions
   */
  public think() {
    var max = 0;
    var maxIndex = 0;

    // Get the output of the neural network
    this.decisions = this.brain.feedForward(this.vision);

    for (var i = 0; i < this.decisions.length; i++) {
      if (this.decisions[i] > max) {
        max = this.decisions[i];
        maxIndex = i;
      }
    }
  }

  /**
   * Main function to take a decision about the market
   */
  private trade(
    strategyConfig: StrategyConfig,
    currentPrice: number,
    candles: CandleData[],
    exchangeInfo: ExchangeInfo
  ) {
    const {
      asset,
      base,
      risk,
      tradingSessions,
      maxTradeDuration,
      trailingStopConfig,
      canOpenNewPositionToCloseLast,
      trendFilter,
      riskManagement,
      exitStrategy,
    } = strategyConfig;
    const pair = asset + base;

    // Check the trend
    const useLongPosition = trendFilter ? trendFilter(candles) === 1 : true;
    const useShortPosition = trendFilter ? trendFilter(candles) === -1 : true;

    // Balance information
    const assetBalance = this.wallet.totalWalletBalance;
    const availableBalance = this.wallet.availableBalance;

    // Position information
    const position = this.wallet.position;
    const hasLongPosition = position.size > 0;
    const hasShortPosition = position.size < 0;

    // Decision to take
    let max = Math.max(...this.decisions);
    const isBuySignal = max === this.decisions[0] && !hasShortPosition;
    const isSellSignal = max === this.decisions[1] && !hasLongPosition;
    const wait = max === this.decisions[2];

    // Conditions to take or not a position
    const canTakeLongPosition =
      (useLongPosition && position.size === 0) ||
      (canOpenNewPositionToCloseLast && useLongPosition && hasShortPosition);
    const canTakeShortPosition =
      (useShortPosition && position.size === 0) ||
      (canOpenNewPositionToCloseLast && useShortPosition && hasLongPosition);

    // Currency infos
    const pricePrecision = getPricePrecision(pair, exchangeInfo);
    const quantityPrecision = getQuantityPrecision(pair, exchangeInfo);

    // Check if we are in the trading sessions
    const isTradingSessionActive = isOnTradingSession(
      candles[candles.length - 1].openTime,
      tradingSessions
    );

    // Open orders
    const currentOpenOrders = this.openOrders;

    // Wait
    if (wait) return;

    // The current position is too long
    if (
      this.counter &&
      maxTradeDuration &&
      (hasShortPosition || hasLongPosition)
    ) {
      this.counter.decrement();
      if (this.counter.getValue() == 0) {
        this.orderMarket(
          pair,
          currentPrice,
          Math.abs(position.size),
          hasLongPosition ? 'SELL' : 'BUY'
        );
        this.counter.reset();
        return;
      }
    }

    // Prevent remaining open orders when all the take profit or a stop loss has been filled
    if (!hasLongPosition && !hasShortPosition && currentOpenOrders.length > 0) {
      this.closeOpenOrders(pair);
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
      (isTradingSessionActive || position.size !== 0) &&
      canTakeLongPosition &&
      currentOpenOrders.length === 0 &&
      isBuySignal
    ) {
      // Calculate TP and SL
      let { takeProfit, stopLoss } = exitStrategy
        ? exitStrategy(currentPrice, candles, pricePrecision, OrderSide.BUY)
        : { takeProfit: null, stopLoss: null };

      // Calculation of the quantity for the position according to the risk management
      const quantity = riskManagement({
        asset,
        base,
        balance: Number(availableBalance),
        risk,
        enterPrice: currentPrice,
        stopLossPrice: stopLoss,
        exchangeInfo,
      });

      this.orderMarket(pair, currentPrice, quantity, 'BUY');

      if (takeProfit) {
        this.orderLimit(pair, takeProfit, Math.abs(position.size), 'SHORT');
      }

      if (stopLoss) {
        this.orderLimit(pair, stopLoss, Math.abs(position.size), 'SHORT');
      }

      if (trailingStopConfig) {
        let activationPrice = calculateActivationPrice(
          trailingStopConfig,
          position.entryPrice,
          pricePrecision,
          takeProfit
        );

        this.orderTrailingStop(
          asset,
          base,
          activationPrice,
          Math.abs(position.size),
          'SHORT',
          trailingStopConfig
        );
      }
    } else if (
      (isTradingSessionActive || position.size !== 0) &&
      canTakeShortPosition &&
      currentOpenOrders.length === 0 &&
      isSellSignal
    ) {
      // Calculate TP and SL
      let { takeProfit, stopLoss } = exitStrategy
        ? exitStrategy(currentPrice, candles, pricePrecision, OrderSide.SELL)
        : { takeProfit: null, stopLoss: null };

      // Calculation of the quantity for the position according to the risk management
      const quantity = riskManagement({
        asset,
        base,
        balance: Number(availableBalance),
        risk,
        enterPrice: currentPrice,
        stopLossPrice: stopLoss,
        exchangeInfo,
      });

      this.orderMarket(pair, currentPrice, quantity, 'SELL');

      if (takeProfit) {
        this.orderLimit(pair, takeProfit, Math.abs(position.size), 'LONG');
      }

      if (stopLoss) {
        this.orderLimit(pair, stopLoss, Math.abs(position.size), 'LONG');
      }

      if (trailingStopConfig) {
        let activationPrice = calculateActivationPrice(
          trailingStopConfig,
          position.entryPrice,
          pricePrecision,
          takeProfit
        );

        this.orderTrailingStop(
          asset,
          base,
          activationPrice,
          Math.abs(position.size),
          'LONG',
          trailingStopConfig
        );
      }
    }
  }

  /**
   * Check the open orders based on the current price. If the price crosses an order, this latter is activated.
   * @param asset
   * @param base
   * @param candles
   */
  private checkOpenOrders(asset: string, base: string, candles: CandleData[]) {
    const lastCandle = candles[candles.length - 1];

    if (this.openOrders.length > 0) {
      const pair = asset + base;
      const longOrders = this.openOrders.filter(
        (order) => order.positionSide === 'LONG'
      );
      const shortOrders = this.openOrders.filter(
        (order) => order.positionSide === 'SHORT'
      );
      const position = this.wallet.position;
      const wallet = this.wallet;
      const hasPosition = position.size !== 0;

      // Prevent remaining open orders when all the take profit or a stop loss has been filled
      if (position.size === 0 && this.openOrders.length > 0) {
        this.closeOpenOrders(pair);
      }

      // Check if a long order has been activated on the last candle
      longOrders
        .sort((order1, order2) => order2.price - order1.price) // sort order from nearest price to furthest price
        .every(({ id, price, quantity, type, trailingStop }) => {
          const { entryPrice, leverage, positionSide } = position;
          const fees = quantity * price * (MAKER_FEES / 100);

          if (positionSide === 'LONG') return;

          // Price crossed the buy limit order
          if (
            type === 'LIMIT' &&
            lastCandle.high > price &&
            lastCandle.low < price
          ) {
            // Update wallet
            let pnl = this.getPositionPNL(position, price);
            wallet.availableBalance += position.margin + pnl - fees;
            wallet.totalWalletBalance += pnl - fees;

            // Update position
            position.size += quantity;
            position.margin = Math.abs(position.size * price) / leverage;

            // The position has been closed
            if (position.size === 0) {
              position.entryPrice = 0;
              position.unrealizedProfit = 0;
            }

            // The position side has been changed
            if (position.size > 0) {
              position.entryPrice = price;
              position.positionSide = 'LONG';
              let newPnl = this.getPositionPNL(position, price);
              position.unrealizedProfit = newPnl;
              wallet.availableBalance -= position.margin;
              this.stats.totalTrades++;
              this.stats.longTrades++;
            }

            // Update profit and loss
            if (pnl >= 0) {
              this.stats.totalProfit += pnl;
            } else {
              this.stats.totalLoss += pnl;
            }

            if (hasPosition && entryPrice >= price) {
              this.stats.shortWinningTrades++;
              this.stats.winningTrades++;
            }
            if (hasPosition && entryPrice < price) {
              this.stats.shortLostTrades++;
              this.stats.lostTrades++;
            }
            this.stats.totalFees += fees;

            this.closeOpenOrder(id);
          }

          // Trailing stops
          if (type === 'TRAILING_STOP_MARKET') {
            let activationPrice = price;
            let { status, callbackRate } = trailingStop;

            if (status === 'PENDING' && lastCandle.low <= activationPrice) {
              status = 'ACTIVE';
            }
            if (status === 'ACTIVE') {
              let stopLossPrice = lastCandle.open * (1 + callbackRate);
              // Trailing stop loss is activated
              if (lastCandle.high >= stopLossPrice) {
                let pnl = this.getPositionPNL(position, price);

                wallet.availableBalance += position.margin + pnl - fees;
                wallet.totalWalletBalance += pnl - fees;
                position.size += quantity;
                position.margin = Math.abs(position.size * price) / leverage;

                this.stats.totalFees += fees;

                // Update profit and loss
                if (pnl >= 0) {
                  this.stats.totalProfit += pnl;
                } else {
                  this.stats.totalLoss += pnl;
                }

                if (price <= entryPrice) {
                  this.stats.shortWinningTrades++;
                  this.stats.winningTrades++;
                } else {
                  this.stats.shortLostTrades++;
                  this.stats.lostTrades++;
                }
              }
            }
          }

          // If an order close the position, do not continue to check the other orders.
          // Prevent to have multiple orders touches at the same time
          if (position.size === 0) {
            this.closeOpenOrders(pair);
            return false;
          } else {
            return true;
          }
        });

      shortOrders
        .sort((order1, order2) => order1.price - order2.price) // sort order from nearest price to furthest price
        .every(({ id, price, quantity, type, trailingStop }) => {
          const { entryPrice, leverage, positionSide } = position;
          const fees = quantity * price * (MAKER_FEES / 100);

          if (positionSide === 'SHORT') return;

          // Price crossed the sell limit order
          if (
            type === 'LIMIT' &&
            lastCandle.high > price &&
            lastCandle.low < price
          ) {
            // Update wallet
            let pnl = this.getPositionPNL(position, price);
            wallet.availableBalance += position.margin + pnl - fees;
            wallet.totalWalletBalance += pnl - fees;

            // Update position
            position.size -= quantity;
            position.margin = Math.abs(position.size * price) / leverage;

            // The position has been closed
            if (position.size === 0) {
              position.entryPrice = 0;
              position.unrealizedProfit = 0;
            }

            // The position side has been changed
            if (position.size < 0) {
              position.entryPrice = price;
              position.positionSide = 'SHORT';
              let newPnl = this.getPositionPNL(position, price);
              position.unrealizedProfit = newPnl;
              wallet.availableBalance -= position.margin;
              this.stats.totalTrades++;
              this.stats.shortTrades++;
            }

            // Update profit and loss
            if (pnl >= 0) {
              this.stats.totalProfit += pnl;
            } else {
              this.stats.totalLoss += pnl;
            }

            if (hasPosition && entryPrice <= price) {
              this.stats.longWinningTrades++;
              this.stats.winningTrades++;
            }
            if (hasPosition && entryPrice > price) {
              this.stats.longLostTrades++;
              this.stats.lostTrades++;
            }
            this.stats.totalFees += fees;

            this.closeOpenOrder(id);
          }

          // Trailing stops
          if (type === 'TRAILING_STOP_MARKET') {
            let activationPrice = price;
            let { status, callbackRate } = trailingStop;
            if (status === 'PENDING' && lastCandle.high >= activationPrice) {
              status = 'ACTIVE';
            }
            if (status === 'ACTIVE') {
              let stopLossPrice = lastCandle.open * (1 - callbackRate);
              // Trailing stop loss is activated
              if (lastCandle.low <= stopLossPrice) {
                let pnl = this.getPositionPNL(position, price);

                wallet.availableBalance += position.margin + pnl - fees;
                wallet.totalWalletBalance += pnl - fees;
                position.size += quantity;
                position.margin = Math.abs(position.size * price) / leverage;

                this.stats.totalFees += fees;

                // Update profit and loss
                if (pnl >= 0) {
                  this.stats.totalProfit += pnl;
                } else {
                  this.stats.totalLoss += pnl;
                }

                if (price >= entryPrice) {
                  this.stats.longWinningTrades++;
                  this.stats.winningTrades;
                } else {
                  this.stats.longLostTrades++;
                  this.stats.lostTrades++;
                }
              }
            }
          }

          // If an order close the position, do not continue to check the other orders.
          // Prevent to have multiple orders touches at the same time
          if (position.size === 0) {
            this.closeOpenOrders(pair);
            return false;
          } else {
            return true;
          }
        });
    }
  }

  /**
   * take a long or a short with a market order
   * @param pair
   * @param price
   * @param quantity
   * @param side
   */
  private orderMarket(
    pair: string,
    price: number,
    quantity: number,
    side: 'BUY' | 'SELL'
  ) {
    const wallet = this.wallet;
    const position = wallet.position;
    const { entryPrice, size, leverage } = position;
    const fees = price * quantity * (TAKER_FEES / 100);
    const hasPosition = position.size !== 0;

    if (quantity < 0) {
      console.error(
        `Cannot execute the market order for ${pair}. The quantity is malformed: ${quantity}`
      );
      return;
    }

    if (side === 'BUY') {
      if (position.positionSide === 'LONG') {
        let baseCost = (price * quantity) / leverage;
        // If there is enough available base currency
        if (wallet.availableBalance >= baseCost + fees) {
          let avgEntryPrice =
            (price * quantity + entryPrice * Math.abs(size)) /
            (quantity + Math.abs(size));

          position.margin += baseCost;
          position.size += quantity;
          position.entryPrice = avgEntryPrice;

          wallet.availableBalance -= baseCost + fees;
          wallet.totalWalletBalance -= fees;

          if (!hasPosition) {
            this.stats.totalTrades++;
            this.stats.longTrades++;
          }
          this.stats.totalFees += fees;
        }
      } else if (position.positionSide === 'SHORT') {
        // Update wallet
        let pnl = this.getPositionPNL(position, price);
        wallet.availableBalance += position.margin + pnl - fees;
        wallet.totalWalletBalance += pnl - fees;
        this.stats.totalFees += fees;

        // Update position
        position.size += quantity;
        position.margin = Math.abs(position.size * price) / leverage;

        // The position has been closed
        if (position.size === 0) {
          position.entryPrice = 0;
          position.unrealizedProfit = 0;
        }

        // The order changes the position side of the current position
        if (position.size > 0) {
          position.entryPrice = price;
          position.positionSide = 'LONG';
          let newPnl = this.getPositionPNL(position, price);
          position.unrealizedProfit = newPnl;
          wallet.availableBalance -= position.margin;
          this.stats.totalTrades++;
          this.stats.longTrades++;
        }

        // Update profit and loss
        if (pnl >= 0) {
          this.stats.totalProfit += pnl;
        } else {
          this.stats.totalLoss += pnl;
        }

        if (hasPosition && entryPrice >= price) {
          this.stats.winningTrades++;
          this.stats.shortWinningTrades++;
        }
        if (hasPosition && entryPrice < price) {
          this.stats.lostTrades++;
          this.stats.shortLostTrades++;
        }
      }
    } else if (side === 'SELL') {
      let baseCost = (price * quantity) / leverage;

      if (position.positionSide === 'SHORT') {
        // If there is enough available base currency
        if (wallet.availableBalance >= baseCost + fees) {
          let avgEntryPrice =
            (price * quantity + entryPrice * Math.abs(size)) /
            (quantity + Math.abs(size));

          position.margin += baseCost;
          position.size -= quantity;
          position.entryPrice = avgEntryPrice;

          wallet.availableBalance -= baseCost + fees;
          wallet.totalWalletBalance -= fees;

          if (!hasPosition) {
            this.stats.totalTrades++;
            this.stats.shortTrades++;
          }
          this.stats.totalFees += fees;
        }
      } else if (position.positionSide === 'LONG') {
        // Update wallet
        let pnl = this.getPositionPNL(position, price);
        wallet.availableBalance += position.margin + pnl - fees;
        wallet.totalWalletBalance += pnl - fees;
        this.stats.totalFees += fees;

        // Update position
        position.size -= quantity;
        position.margin = Math.abs(position.size * price) / leverage;

        // The position has been closed
        if (position.size === 0) {
          position.entryPrice = 0;
          position.unrealizedProfit = 0;
        }

        // The order changes the position side of the current order
        if (position.size < 0) {
          position.entryPrice = price;
          position.positionSide = 'SHORT';
          let newPnl = this.getPositionPNL(position, price);
          position.unrealizedProfit = newPnl;
          wallet.availableBalance -= position.margin;
          this.stats.totalTrades++;
          this.stats.shortTrades++;
        }

        // Update profit and loss
        if (pnl >= 0) {
          this.stats.totalProfit += pnl;
        } else {
          this.stats.totalLoss += pnl;
        }

        if (hasPosition && entryPrice <= price) {
          this.stats.winningTrades++;
          this.stats.longWinningTrades++;
        }
        if (hasPosition && entryPrice > price) {
          this.stats.lostTrades++;
          this.stats.longLostTrades++;
        }
      }
    }
  }

  /**
   * Place a limit order
   * @param pair
   * @param price
   * @param quantity
   * @param positionSide
   */
  private orderLimit(
    pair: string,
    price: number,
    quantity: number,
    positionSide: 'LONG' | 'SHORT'
  ) {
    const position = this.wallet.position;

    if (quantity < 0) {
      console.error(
        `Cannot placed the limit order for ${pair}. The quantity is malformed: ${quantity}`
      );
      return;
    }

    let baseCost =
      Math.abs(price * quantity) / position.leverage - position.margin;
    let canOrder =
      position.size !== 0
        ? positionSide === position.positionSide
          ? this.wallet.availableBalance >= baseCost // Average the current position
          : true // Take profit or Stop Loss
        : this.wallet.availableBalance >= baseCost; // New position

    if (canOrder) {
      let order: OpenOrder = {
        id: Math.random().toString(16).slice(2),
        pair,
        type: 'LIMIT',
        positionSide,
        price,
        quantity,
      };
      this.openOrders.push(order);
    } else {
      // console.error(
      //   `Limit order for the pair ${pair} cannot be placed. quantity=${quantity} price=${price}`
      // );
    }
  }

  /**
   * Place a trailing stop order
   * @param asset
   * @param base
   * @param price
   * @param quantity
   * @param positionSide
   * @param trailingStopConfig
   */
  private orderTrailingStop(
    asset: string,
    base: string,
    price: number,
    quantity: number,
    positionSide: 'LONG' | 'SHORT',
    trailingStopConfig: TrailingStopConfig
  ) {
    const position = this.wallet.position;
    const pair = asset + base;

    if (quantity < 0) {
      console.error(
        `Cannot execute the trailing stop order for ${pair}. The quantity is malformed: ${quantity}`
      );
      return;
    }

    let canOrder = quantity <= Math.abs(position.size);
    if (canOrder) {
      let order: OpenOrder = {
        id: Math.random().toString(16).slice(2),
        pair,
        type: 'TRAILING_STOP_MARKET',
        positionSide,
        price, // activation price
        quantity,
        trailingStop: {
          status: 'PENDING',
          callbackRate: trailingStopConfig.callbackRate,
          activation: {
            changePercentage: trailingStopConfig.activation.changePercentage,
            percentageToTP: trailingStopConfig.activation.changePercentage,
          },
        },
      };
      this.openOrders.push(order);
    } else {
      console.error(
        `Trailing stop order for the pair ${pair} cannot be placed`
      );
    }
  }

  /**
   * Check if the margin is enough to maintain the position. If not, the position is liquidated
   * @param pair
   * @param currentPrice
   */
  private checkPositionMargin(pair: string, currentPrice: number) {
    const position = this.wallet.position;
    const { margin, unrealizedProfit, size, positionSide } = position;

    if (size !== 0 && margin + unrealizedProfit <= 0) {
      this.orderMarket(
        pair,
        currentPrice,
        Math.abs(size),
        positionSide === 'LONG' ? 'SELL' : 'BUY'
      );
    }
  }

  /**
   * Close an open order by its id
   * @param orderId The id of the order to close
   */
  private closeOpenOrder(orderId: string) {
    this.openOrders = this.openOrders.filter((order) => order.id !== orderId);
  }

  /**
   * Close all the open orders for a given pair
   * @param pair
   */
  private closeOpenOrders(pair: string) {
    this.openOrders = this.openOrders.filter((order) => order.pair !== pair);
  }

  /**
   * Get the unrealized profit ofa position
   * @param position
   * @param currentPrice
   */
  private getPositionPNL(position: Position, currentPrice: number) {
    const entryPrice = position.entryPrice;
    const delta = (currentPrice - entryPrice) / entryPrice;

    if (position.size !== 0 && position.margin > 0 && position.entryPrice > 0) {
      if (position.positionSide === 'LONG') {
        return delta * position.margin * position.leverage;
      } else {
        return -delta * position.margin * position.leverage;
      }
    } else {
      return 0;
    }
  }

  /**
   * Update the max drawdown and max balance with the current state of the wallet
   */
  private updateDrawdownMaxBalance() {
    // Max balance update
    if (this.wallet.totalWalletBalance > this.stats.maxBalance) {
      this.stats.maxBalance = this.wallet.totalWalletBalance;
    }
    // Max relative drawdown update
    let relativeDrawdown =
      (this.wallet.totalWalletBalance - this.stats.maxBalance) /
      this.stats.maxBalance;
    if (relativeDrawdown < this.stats.maxRelativeDrawdown) {
      this.stats.maxRelativeDrawdown = relativeDrawdown;
    }
  }

  /**
   * Returns a clone of this player with the same brain
   */
  public clone() {
    var clone = new Player({
      genomeInputs: this.genomeInputs,
      genomeOutputs: this.genomeOutputs,
      strategyConfig: this.strategyConfig,
      binanceClient: this.binanceClient,
      exchangeInfo: this.exchangeInfo,
      initialCapital: this.initialCapital,
      goals: this.goals,
    });
    clone.brain = this.brain.clone();
    clone.fitness = this.fitness;
    clone.brain.generateNetwork();
    clone.generation = this.generation;
    clone.bestScore = this.score;

    return clone;
  }

  /**
   * Since there is some randomness in games sometimes when we want to replay the game we need to remove that randomness
   * this function does that
   */
  public cloneForReplay() {
    var clone = new Player({
      genomeInputs: this.genomeInputs,
      genomeOutputs: this.genomeOutputs,
      strategyConfig: this.strategyConfig,
      binanceClient: this.binanceClient,
      exchangeInfo: this.exchangeInfo,
      initialCapital: this.initialCapital,
      goals: this.goals,
    });
    clone.brain = this.brain.clone();
    clone.fitness = this.fitness;
    clone.brain.generateNetwork();
    clone.generation = this.generation;
    clone.bestScore = this.score;
    clone.stats = this.stats;
    clone.wallet = this.wallet;

    return clone;
  }

  /**
   * Genetic algorithm
   */
  public calculateFitness() {
    let {
      totalLoss,
      totalProfit,
      totalFees,
      winningTrades,
      lostTrades,
      totalTrades,
      maxRelativeDrawdown,
      longWinningTrades,
      shortWinningTrades,
      longLostTrades,
      shortLostTrades,
    } = this.stats;

    const profitFactor = totalProfit / (Math.abs(totalLoss) + totalFees);
    const totalNetProfit = totalProfit - (Math.abs(totalLoss) + totalFees);
    const winRate = winningTrades / totalTrades;
    const lossRate = lostTrades / totalTrades;
    const roi =
      (this.wallet.totalWalletBalance - this.initialCapital) /
      this.initialCapital;
    const avgProfit = totalProfit / (longWinningTrades + shortWinningTrades);
    const avgLoss = totalLoss / (longLostTrades + shortLostTrades);

    // ========================== Fitness Formulas ================================== //
    this.fitness = this.wallet.totalWalletBalance / totalTrades;
    // this.fitness = totalNetProfit / totalTrades;
    // this.fitness = avgProfit * winRate - avgLoss * lossRate;
    // this.fitness = roi / (1 - maxRelativeDrawdown);
    // ============================================================================= //

    if (isNaN(this.fitness)) {
      this.fitness = 0;
      return;
    }

    if (this.goals.minimumTrades && totalTrades < this.goals.minimumTrades) {
      // this.fitness /= 2 - diff;
      this.fitness = 0;
    }

    if (this.goals.maximumTrades && totalTrades > this.goals.maximumTrades) {
      // this.fitness /= 2 - diff;
      this.fitness = 0;
    }

    if (
      this.goals.maxRelativeDrawdown &&
      maxRelativeDrawdown < this.goals.maxRelativeDrawdown
    ) {
      let diff = maxRelativeDrawdown - this.goals.maxRelativeDrawdown;
      this.fitness /= 2 - diff;
    }

    if (this.goals.profitFactor && profitFactor < this.goals.profitFactor) {
      this.fitness /= this.goals.profitFactor / profitFactor;
    }

    if (this.goals.winRate && winRate < this.goals.winRate) {
      let diff = winRate - this.goals.winRate;
      // this.fitness /= 2 - diff;
      this.fitness /= 2 - winRate;
    }
  }

  public crossover(parent: Player) {
    var child = new Player({
      genomeInputs: this.genomeInputs,
      genomeOutputs: this.genomeOutputs,
      strategyConfig: this.strategyConfig,
      binanceClient: this.binanceClient,
      exchangeInfo: this.exchangeInfo,
      initialCapital: this.initialCapital,
      goals: this.goals,
    });
    child.brain = this.brain.crossover(parent.brain);
    child.brain.generateNetwork();
    return child;
  }
}

export default Player;
