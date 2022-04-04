import { Binance, ExchangeInfo } from 'binance-api-node';
import dayjs from 'dayjs';
import { Counter } from '../tools/counter';
import Genome from './genome';
import { getPricePrecision, getQuantityPrecision } from '../utils/currencyInfo';
import { BotConfig } from '../init';

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

  public wallet: FuturesWallet;
  private counter: Counter; // to cut the position too long
  public stats: TraderStats; // Stats

  // NEAT Stuffs
  public fitness: number;
  private vision: number[]; // the inputs fed into the neuralNet
  private decision: number[]; // the outputs of the NN
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

    // Neat stuffs
    this.fitness = 0;
    this.vision = [];
    this.decision = [];
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
   * Get inputs for brain
   */
  public look(indicators: number[]) {
    let vision: number[] = [];

    // Holding a trade ?
    const holdingTrade = this.wallet.position.size !== 0 ? 1 : 0;
    vision.push(holdingTrade);

    // Add indicator values
    vision = vision.concat(indicators);

    this.vision = vision;
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

    let {
      totalLoss,
      totalProfit,
      totalFees,
      winningTrades,
      totalTrades,
      maxRelativeDrawdown,
    } = this.stats;

    const profitRatio = totalProfit / (Math.abs(totalLoss) + totalFees);
    const totalNetProfit = totalProfit - (Math.abs(totalLoss) + totalFees);
    const winRate = winningTrades / totalTrades;
    const roi =
      (this.wallet.totalWalletBalance - this.initialCapital) /
      this.initialCapital;

    // Kill the bad traders
    if (this.wallet.totalWalletBalance <= 0) {
      this.dead = true;
      return;
    }

    // Kill the traders that doesn't trades
    if (this.lifespan > 100 && totalLoss === 0 && totalProfit === 0) {
      this.dead = true;
      return;
    }

    // Kill the traders that take too much risk
    if (
      this.goals.maxRelativeDrawdown &&
      maxRelativeDrawdown < this.goals.maxRelativeDrawdown
    ) {
      this.dead = true;
      return;
    }

    // Kill the traders that have a bad winRate
    if (this.goals.winRate && !isNaN(winRate) && winRate < this.goals.winRate) {
      this.dead = true;
      return;
    }

    // Kill the traders with a bad risk reward
    if (
      this.goals.profitRatio &&
      !isNaN(profitRatio) &&
      profitRatio < this.goals.profitRatio
    ) {
      this.dead = true;
      return;
    }

    const { asset, base } = strategyConfig;
    this.checkPositionMargin(asset + base, currentPrice);
    this.trade(this.strategyConfig, currentPrice, candles, this.exchangeInfo);

    // Update the max drawdown and max balance property for the strategy report
    this.updateDrawdownMaxBalance();

    // We measure the score of the trader by the profit generated
    this.score = totalNetProfit;
  }

  /**
   * Gets the output of the brain, then converts them to actions
   */
  public think() {
    var max = 0;
    var maxIndex = 0;

    // Get the output of the neural network
    this.decision = this.brain.feedForward(this.vision);

    for (var i = 0; i < this.decision.length; i++) {
      if (this.decision[i] > max) {
        max = this.decision[i];
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
      tradingSession,
      riskManagement,
      trendFilter,
      maxTradeDuration,
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
    let max = Math.max(...this.decision);
    const isBuySignal =
      max === this.decision[0] && this.decision[0] > 0.6 && !hasShortPosition;
    const isSellSignal =
      max === this.decision[1] && this.decision[1] > 0.6 && !hasLongPosition;
    const closePosition =
      max === this.decision[2] &&
      this.decision[2] > 0.6 &&
      (hasShortPosition || hasLongPosition);

    // Conditions to take or not a position
    const canTakeLongPosition = useLongPosition && position.size === 0;
    const canTakeShortPosition = useShortPosition && position.size === 0;
    const canClosePosition =
      Math.abs(currentPrice - position.entryPrice) >=
      position.entryPrice * 0.01;

    // Currency infos
    const pricePrecision = getPricePrecision(pair, exchangeInfo);
    const quantityPrecision = getQuantityPrecision(pair, exchangeInfo);

    // Check if we are in the trading sessions
    const isTradingSessionActive = this.isTradingSessionActive(
      candles[candles.length - 1].openTime,
      tradingSession
    );

    // The current position is too long
    if (
      maxTradeDuration &&
      (hasShortPosition || hasLongPosition) &&
      this.counter
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

    // Reset the counter if a previous trade close a the position
    if (
      maxTradeDuration &&
      !hasLongPosition &&
      !hasShortPosition &&
      this.counter.getValue() < maxTradeDuration
    ) {
      this.counter.reset();
    }

    // Close the current position
    if (
      closePosition &&
      (hasLongPosition || hasShortPosition) &&
      canClosePosition
    ) {
      this.orderMarket(
        pair,
        currentPrice,
        Math.abs(position.size),
        hasLongPosition ? 'SELL' : 'BUY'
      );
      return;
    }

    // Calculation of the quantity for the position according to the risk management
    let quantity = riskManagement({
      asset,
      base,
      balance: Number(availableBalance),
      risk,
      enterPrice: currentPrice,
      exchangeInfo,
    });

    if (
      (isTradingSessionActive || position.size !== 0) &&
      canTakeLongPosition &&
      isBuySignal
    ) {
      this.orderMarket(pair, currentPrice, quantity, 'BUY');
    } else if (
      (isTradingSessionActive || position.size !== 0) &&
      canTakeShortPosition &&
      isSellSignal
    ) {
      this.orderMarket(pair, currentPrice, quantity, 'SELL');
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
   * The trader trade only on the trading session authorized
   * @param currentDate
   * @param tradingSession
   */
  private isTradingSessionActive(
    currentDate: Date,
    tradingSession?: TradingSession
  ) {
    if (tradingSession) {
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
    // Fitness Formulas
    this.fitness = this.wallet.totalWalletBalance;
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
