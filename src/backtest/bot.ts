import colors from 'ansi-colors';
import { ExchangeInfo } from 'binance-api-node';
import chalk from 'chalk';
import cliProgress from 'cli-progress';
import dayjs from 'dayjs';
import safeRequire from 'safe-require';
import { binanceClient } from '../init';
import { decimalCeil, decimalFloor } from '../utils/math';
import { clone } from '../utils/object';
import { createDatabase, saveFuturesState } from './database';
import { debugLastCandle, debugWallet, log, printDateBanner } from './debug';
import generateHTMLReport from './generateReport';
import { Counter } from '../tools/counter';
import { getPricePrecision, getQuantityPrecision } from '../utils/currencyInfo';
import { durationBetweenDates } from '../utils/timeFrame';
import { loadCandlesFromCSV } from '../utils/loadCandleData';
import Genome from '../core/genome';
import { calculateIndicators } from '../training/indicators';

// ====================================================================== //

const BotConfig = safeRequire(`${process.cwd()}/config.json`);

if (!BotConfig) {
  console.error(
    'Something is wrong. No json config file has been found at the root of the project.'
  );
  process.exit(1);
}

const BacktestConfig = BotConfig['backtest'];

// ====================================================================== //

const bar = new cliProgress.SingleBar(
  {
    format:
      'Progress: |' + colors.blue('{bar}') + '| {percentage}% | date: {date}',
  },
  cliProgress.Presets.shades_classic
);

// ====================================================================== //

// Save the backtest history to the database
const SAVE_HISTORY = BacktestConfig['save_db'];

// Debug mode with console.log
export const DEBUG = process.argv[2]
  ? process.argv[2].split('=')[1] === 'true'
    ? true
    : false
  : false;

// Max length of the candle arrays needed for the strategy and the calculation of indicators
// Better to have the minimum to get a higher performance
const MAX_CANDLE_LENGTH = 200;

// The bot starts to trade when it has X available candles
const MIN_CANDLE_LENGTH = 150;

// Exchange fee info
const TAKER_FEES = BotConfig['taker_fees_futures']; // %
const MAKER_FEES = BotConfig['maker_fees_futures']; // %

// ====================================================================== //

/**
 * Basic class
 */
export class BasicBackTestBot {
  // Configuration
  protected strategyConfig: StrategyConfig;

  // Data
  private historicCandleData: CandleData[] = [];
  private indicators: number[][];

  // Counter to fix the max duration of each trade
  private counter: Counter;

  // Initial parameters
  private startDate: Date;
  private endDate: Date;
  protected initialCapital: number;

  // Account mocks
  protected futuresWallet: FuturesWallet;

  // Neat
  private brain: Genome;
  private visions: number[];
  private decisions: number[];

  // For the calculation of some properties of the strategy report
  public strategyReport: StrategyReport = {};
  protected maxBalance: number;
  protected maxAbsoluteDrawdown = 1;
  protected maxRelativeDrawdown = 1;
  protected maxProfit = 0;
  protected maxLoss = 0;
  protected maxConsecutiveWinsCount = 0;
  protected maxConsecutiveLossesCount = 0;
  protected maxConsecutiveProfitCount = 0;
  protected maxConsecutiveLossCount = 0;

  // To generate the html report
  private chartLabels: string[] = [];
  private chartData: number[] = [];

  constructor(
    strategyConfig: StrategyConfig,
    startDate: Date,
    endDate: Date,
    initialCapital: number
  ) {
    this.strategyConfig = strategyConfig;
    this.startDate = startDate;
    this.endDate = endDate;
    this.initialCapital = initialCapital;
    this.maxBalance = initialCapital;
  }

  /**
   * Prepare the mock account data, the open orders, and initialize some properties of the strategy report
   */
  public prepare() {
    if (SAVE_HISTORY) createDatabase();

    this.futuresWallet = {
      availableBalance: this.initialCapital,
      totalWalletBalance: this.initialCapital,
      totalUnrealizedProfit: 0,
      position: {
        pair: this.strategyConfig.asset + this.strategyConfig.base,
        leverage: this.strategyConfig.leverage,
        entryPrice: 0,
        margin: 0,
        positionSide: 'LONG',
        unrealizedProfit: 0,
        size: 0,
      },
    };

    // Initialize the counters
    this.counter = new Counter(this.strategyConfig.maxTradeDuration);

    this.prepareStrategyReport();
  }

  /**
   * Initialize some properties of the strategy report
   */
  private prepareStrategyReport() {
    this.strategyReport.initialCapital = this.initialCapital;
    this.strategyReport.numberSymbol = 1;
    this.strategyReport.totalNetProfit = 0;
    this.strategyReport.totalFees = 0;
    this.strategyReport.totalTrades = 0;
    this.strategyReport.totalLongTrades = 0;
    this.strategyReport.totalShortTrades = 0;
    this.strategyReport.totalProfit = 0;
    this.strategyReport.totalLoss = 0;
    this.strategyReport.longWinningTrade = 0;
    this.strategyReport.longLostTrade = 0;
    this.strategyReport.shortWinningTrade = 0;
    this.strategyReport.shortLostTrade = 0;
    this.strategyReport.maxConsecutiveProfit = 0;
    this.strategyReport.maxConsecutiveLoss = 0;
    this.strategyReport.maxConsecutiveWinsCount = 0;
    this.strategyReport.maxConsecutiveLossesCount = 0;
  }

  /**
   * Load the candles from the downloaded data and calculate the indicators values
   */
  private async prepareData(strategyConfig: StrategyConfig) {
    this.historicCandleData = await loadCandlesFromCSV(
      strategyConfig.asset + strategyConfig.base,
      strategyConfig.interval,
      this.startDate,
      this.endDate
    );
    this.indicators = calculateIndicators(this.historicCandleData);
  }

  /**
   * Main function
   */
  public async run() {
    log(
      '====================== 💵 BINANCE TRADING BOT (BACKTEST) 💵 ======================'
    );

    // Get exchange info (account information are incomplete in the testnet)
    const exchangeInfo = await binanceClient.futuresExchangeInfo();

    // Load the candle data and calculate all the indicators values once to have a fast backtest
    await this.prepareData(this.strategyConfig);

    // Duration of the backtest in the unit of the config time frame
    const duration = durationBetweenDates(
      this.startDate,
      this.endDate,
      this.strategyConfig.interval
    );

    // Set property for strategy
    this.strategyReport.totalBars = duration;

    // Initiation of CLI Progress bar
    if (!DEBUG) bar.start(duration, 0);

    // Time loop
    for (let i = 0; i < this.historicCandleData.length; i++) {
      if (i <= MIN_CANDLE_LENGTH) continue;

      let candles = this.historicCandleData.slice(i - MIN_CANDLE_LENGTH, i);
      let currentCandle = candles[candles.length - 1];
      let currentDate = currentCandle.closeTime;
      let currentPrice = currentCandle.close;
      let pair = this.strategyConfig.asset + this.strategyConfig.base;

      printDateBanner(currentDate);
      debugLastCandle(currentCandle);

      // Neat
      this.look(i);
      this.think();

      // Check the current trades/positions
      this.checkPositionMargin(pair, currentPrice); // If the position margin reach 0, close the position (liquidation)
      this.tradeWithFutures(
        this.strategyConfig,
        currentPrice,
        candles,
        exchangeInfo
      );
      this.updatePNL(currentPrice);

      // Update the max drawdown and max balance property for the strategy report
      this.updateMaxDrawdownMaxBalance();

      // Update the total unrealized pnl on the futures account
      this.updateTotalPNL();

      // Save the current state to the db
      if (SAVE_HISTORY) this.saveStateToDB(currentDate);

      // Debugging
      debugWallet(this.futuresWallet);
      log(''); // \n

      if (!DEBUG)
        bar.increment(1, {
          date: dayjs(currentDate).format('YYYY-MM-DD HH:mm'),
        });

      // Preparing chart data for the strategy report in html
      this.chartLabels.push(dayjs(currentDate).format('YYYY-MM-DD'));
      this.chartData.push(this.futuresWallet.totalWalletBalance);
    }

    if (!DEBUG) bar.stop();

    // Display the strategy report
    this.calculateStrategyStats();
    this.displayStrategyReport();
    generateHTMLReport(this.strategyReport, this.chartLabels, this.chartData);
  }

  /**
   * Calculations / adjustments before displaying the strategy report
   */
  private calculateStrategyStats() {
    let {
      totalLongTrades,
      totalShortTrades,
      longWinningTrade,
      shortWinningTrade,
      longLostTrade,
      shortLostTrade,
      totalTrades,
      totalProfit,
      totalLoss,
      totalFees,
    } = this.strategyReport;

    this.strategyReport.testPeriod = `${dayjs(this.startDate).format(
      'YYYY-MM-DD HH:mm:ss'
    )} to ${dayjs(this.endDate).format('YYYY-MM-DD HH:mm:ss')}`;
    this.strategyReport.finalCapital = decimalFloor(
      this.futuresWallet.totalWalletBalance,
      2
    );
    this.strategyReport.totalNetProfit = decimalFloor(
      this.futuresWallet.totalWalletBalance - this.initialCapital,
      2
    );
    this.strategyReport.totalProfit = decimalFloor(
      this.strategyReport.totalProfit,
      2
    );
    this.strategyReport.totalLoss = decimalFloor(
      this.strategyReport.totalLoss,
      2
    );
    this.strategyReport.totalFees = -decimalFloor(
      this.strategyReport.totalFees,
      2
    );
    this.strategyReport.profitFactor = decimalFloor(
      totalProfit / (Math.abs(totalLoss) + totalFees),
      2
    );
    this.strategyReport.maxAbsoluteDrawdown = -decimalFloor(
      (1 - this.maxAbsoluteDrawdown) * 100,
      2
    );
    this.strategyReport.maxRelativeDrawdown = decimalCeil(
      this.maxRelativeDrawdown * 100,
      2
    );

    this.strategyReport.longWinRate = decimalFloor(
      (longWinningTrade / totalLongTrades) * 100,
      2
    );
    this.strategyReport.shortWinRate = decimalFloor(
      (shortWinningTrade / totalShortTrades) * 100,
      2
    );
    this.strategyReport.totalWinRate = decimalFloor(
      ((longWinningTrade + shortWinningTrade) / totalTrades) * 100,
      2
    );
    this.strategyReport.maxProfit = decimalFloor(this.maxProfit, 2);
    this.strategyReport.maxLoss = -decimalFloor(this.maxLoss, 2);
    this.strategyReport.avgProfit = decimalFloor(
      totalProfit / (longWinningTrade + shortWinningTrade),
      2
    );
    this.strategyReport.avgLoss = decimalFloor(
      totalLoss / (longLostTrade + shortLostTrade),
      2
    );
    this.strategyReport.maxConsecutiveWinsCount = this.maxConsecutiveWinsCount;
    this.strategyReport.maxConsecutiveLossesCount =
      this.maxConsecutiveLossesCount;
    this.strategyReport.maxConsecutiveProfit = decimalFloor(
      this.maxConsecutiveProfitCount,
      2
    );
    this.strategyReport.maxConsecutiveLoss = -decimalFloor(
      this.maxConsecutiveLossCount,
      2
    );
  }

  /**
   * Function that displays the strategy report
   */
  private displayStrategyReport() {
    const {
      testPeriod,
      initialCapital,
      finalCapital,
      totalBars,
      totalNetProfit,
      totalProfit,
      totalLoss,
      totalFees,
      profitFactor,
      totalTrades,
      totalWinRate,
      longWinRate,
      shortWinRate,
      longWinningTrade,
      shortWinningTrade,
      totalLongTrades,
      totalShortTrades,
      maxProfit,
      maxLoss,
      avgProfit,
      avgLoss,
      maxAbsoluteDrawdown,
      maxRelativeDrawdown,
      maxConsecutiveProfit,
      maxConsecutiveLoss,
      maxConsecutiveWinsCount,
      maxConsecutiveLossesCount,
    } = this.strategyReport;

    let strategyReportString = `\n========================= STRATEGY REPORT =========================\n
    Period: ${testPeriod}
    Total bars: ${totalBars}
    ----------------------------------------------------------
    Initial capital: ${initialCapital}
    Final capital: ${finalCapital}
    Total net profit: ${totalNetProfit}
    Total profit: ${totalProfit}
    Total loss: ${totalLoss}
    Total fees: ${totalFees}
    Profit factor: ${profitFactor}
    Max absolute drawdown: ${maxAbsoluteDrawdown}%
    Max relative drawdown: ${maxRelativeDrawdown}%
    ----------------------------------------------------------
    Total trades: ${totalTrades}
    Total win rate: ${totalWinRate}%
    Long trades won: ${longWinRate}% (${longWinningTrade}/${totalLongTrades})
    Short trades won: ${shortWinRate}% (${shortWinningTrade}/${totalShortTrades})
    Max profit: ${maxProfit}
    Max loss: ${maxLoss}
    Average profit: ${avgProfit}
    Average loss: ${avgLoss}
    Max consecutive profit: ${maxConsecutiveProfit}
    Max consecutive loss: ${maxConsecutiveLoss}
    Max consecutive wins (count): ${maxConsecutiveWinsCount}
    Max consecutive losses (count): ${maxConsecutiveLossesCount}
    `;

    console.log(strategyReportString);
  }

  /**
   * Update the max drawdown and max balance with the current state of the wallet
   */
  private updateMaxDrawdownMaxBalance() {
    // Max balance update
    if (this.futuresWallet.totalWalletBalance > this.maxBalance) {
      this.maxBalance = this.futuresWallet.totalWalletBalance;
    }
    // Max absolute drawdown update
    let absoluteDrawdown =
      this.futuresWallet.totalWalletBalance / this.maxBalance;
    if (absoluteDrawdown < this.maxAbsoluteDrawdown) {
      this.maxAbsoluteDrawdown = absoluteDrawdown;
    }
    // Max relative drawdown update
    let relativeDrawdown =
      (this.futuresWallet.totalWalletBalance - this.maxBalance) /
      this.maxBalance;
    if (relativeDrawdown < this.maxRelativeDrawdown) {
      this.maxRelativeDrawdown = relativeDrawdown;
    }
  }

  /**
   * Update the properties of the strategy report linked to the calculation of profit and loss
   * (total profit/loss, max consecutive wins/losses count, max consecutive win/ loss)
   * @param pnl the current pnl
   */
  private updateProfitLossStrategyProperty(pnl: number) {
    if (pnl > 0) {
      this.strategyReport.totalProfit += pnl;
      this.strategyReport.maxConsecutiveWinsCount++;
      this.strategyReport.maxConsecutiveProfit += Math.abs(pnl);

      if (
        this.strategyReport.maxConsecutiveLossesCount >
        this.maxConsecutiveLossesCount
      )
        this.maxConsecutiveLossesCount =
          this.strategyReport.maxConsecutiveLossesCount;

      if (this.strategyReport.maxConsecutiveLoss > this.maxConsecutiveLossCount)
        this.maxConsecutiveLossCount = this.strategyReport.maxConsecutiveLoss;

      this.strategyReport.maxConsecutiveLossesCount = 0;
      this.strategyReport.maxConsecutiveLoss = 0;

      if (Math.abs(pnl) > this.maxProfit) this.maxProfit = Math.abs(pnl);
    }

    if (pnl < 0) {
      this.strategyReport.totalLoss += pnl;
      this.strategyReport.maxConsecutiveLossesCount++;
      this.strategyReport.maxConsecutiveLoss += Math.abs(pnl);

      if (
        this.strategyReport.maxConsecutiveWinsCount >
        this.maxConsecutiveWinsCount
      )
        this.maxConsecutiveWinsCount =
          this.strategyReport.maxConsecutiveWinsCount;

      if (
        this.strategyReport.maxConsecutiveProfit >
        this.maxConsecutiveProfitCount
      )
        this.maxConsecutiveProfitCount =
          this.strategyReport.maxConsecutiveProfit;

      this.strategyReport.maxConsecutiveWinsCount = 0;
      this.strategyReport.maxConsecutiveProfit = 0;

      if (Math.abs(pnl) > this.maxLoss) this.maxLoss = Math.abs(pnl);
    }
  }

  /**
   * Save the current account state in the json database
   */
  private saveStateToDB(currentDate: Date) {
    saveFuturesState(
      dayjs(currentDate).format('YYYY-MM-DD HH:mm'),
      clone(this.futuresWallet)
    );
  }

  /**
   * Main function for the futures mode
   * @param strategyConfig
   * @param currentPrice
   * @param candles
   * @param exchangeInfo
   */
  private tradeWithFutures(
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
    const assetBalance = this.futuresWallet.totalWalletBalance;
    const availableBalance = this.futuresWallet.availableBalance;

    // Position information
    const position = this.futuresWallet.position;
    const hasLongPosition = position.size > 0;
    const hasShortPosition = position.size < 0;

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
      candles[candles.length - 1].closeTime,
      tradingSession
    );

    // The current position is too long
    if (maxTradeDuration && (hasShortPosition || hasLongPosition)) {
      this.counter.decrement();
      if (this.counter.getValue() == 0) {
        log(
          `The position on ${pair} is longer that the maximum authorized duration. Position has been closed.`
        );
        this.futuresOrderMarket(
          pair,
          currentPrice,
          Math.abs(position.size),
          hasLongPosition ? 'SELL' : 'BUY'
        );
        this.counter.reset();
        return;
      }
    }

    // Reset the counter if a previous trade close the position
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
      this.futuresOrderMarket(
        pair,
        currentPrice,
        Math.abs(position.size),
        hasLongPosition ? 'SELL' : 'BUY'
      );
      log(`Close the position on ${pair}`);
      return;
    }

    // Calculation of the quantity for the position according to the risk management
    const quantity = riskManagement({
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
      this.futuresOrderMarket(pair, currentPrice, quantity, 'BUY');
    } else if (
      (isTradingSessionActive || position.size !== 0) &&
      canTakeShortPosition &&
      isSellSignal
    ) {
      this.futuresOrderMarket(pair, currentPrice, quantity, 'SELL');
    }
  }

  /**
   * Check if we are in the trading sessions and if the robot can trade
   * @param current
   * @param tradingSession
   */
  private isTradingSessionActive(
    current: Date,
    tradingSession?: TradingSession
  ) {
    if (tradingSession) {
      const currentTime = dayjs(current);
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
   * Check if the margin is enough to maintain the position. If not, the position is liquidated
   * @param pair
   * @param currentPrice The current price in the main loop
   */
  private checkPositionMargin(pair: string, currentPrice: number) {
    const position = this.futuresWallet.position;
    const { margin, unrealizedProfit, size, positionSide } = position;

    if (size !== 0 && margin + unrealizedProfit <= 0) {
      log(`The position on ${pair} has reached the liquidation price.`);
      this.futuresOrderMarket(
        pair,
        currentPrice,
        Math.abs(size),
        positionSide === 'LONG' ? 'SELL' : 'BUY'
      );

      this.updateProfitLossStrategyProperty(unrealizedProfit);

      if (position.positionSide === 'LONG') this.strategyReport.longLostTrade++;
      else this.strategyReport.shortLostTrade++;
    }
  }

  /**
   * Get the pnl of a position according to a price
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
   * Update the pnl of the position object
   * @param currentPrice
   */
  private updatePNL(currentPrice: number) {
    let position = this.futuresWallet.position;
    position.unrealizedProfit = this.getPositionPNL(position, currentPrice);
  }

  /**
   * Update the total unrealized profit property of the futures wallet object
   */
  private updateTotalPNL() {
    this.futuresWallet.totalUnrealizedProfit =
      this.futuresWallet.position.unrealizedProfit;
  }

  /**
   * Futures market order execution
   * @param pair
   * @param price
   * @param quantity
   * @param side
   */
  private futuresOrderMarket(
    pair: string,
    price: number,
    quantity: number,
    side: 'BUY' | 'SELL'
  ) {
    const wallet = this.futuresWallet;
    const position = this.futuresWallet.position;
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
            this.strategyReport.totalTrades++;
            this.strategyReport.totalLongTrades++;
          }
          this.strategyReport.totalFees += fees;

          log(
            `Take a long position on ${pair} with a size of ${quantity} at ${price}. Fees: ${fees}`,
            chalk.green
          );
        }
      } else if (position.positionSide === 'SHORT') {
        // Update wallet
        let pnl = this.getPositionPNL(position, price);
        wallet.availableBalance += position.margin + pnl - fees;
        wallet.totalWalletBalance += pnl - fees;

        this.updateProfitLossStrategyProperty(pnl);

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
          this.strategyReport.totalTrades++;
          this.strategyReport.totalLongTrades++;
        }

        if (hasPosition && entryPrice >= price)
          this.strategyReport.shortWinningTrade++;
        if (hasPosition && entryPrice < price)
          this.strategyReport.shortLostTrade++;
        this.strategyReport.totalFees += fees;

        log(
          `Take a long position on ${pair} with a size of ${quantity} at ${price}. Fees: ${fees}`,
          chalk.green
        );
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
            this.strategyReport.totalTrades++;
            this.strategyReport.totalShortTrades++;
          }
          this.strategyReport.totalFees += fees;

          log(
            `Take a short position on ${pair} with a size of ${-quantity} at ${price}. Fees: ${fees}`,
            chalk.red
          );
        }
      } else if (position.positionSide === 'LONG') {
        // Update wallet
        let pnl = this.getPositionPNL(position, price);
        wallet.availableBalance += position.margin + pnl - fees;
        wallet.totalWalletBalance += pnl - fees;

        this.updateProfitLossStrategyProperty(pnl);

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
          this.strategyReport.totalTrades++;
          this.strategyReport.totalShortTrades++;
        }

        if (hasPosition && entryPrice <= price)
          this.strategyReport.longWinningTrade++;
        if (hasPosition && entryPrice > price)
          this.strategyReport.longLostTrade++;
        this.strategyReport.totalFees += fees;

        log(
          `Take a short position on ${pair} with a size of ${-quantity} at ${price}. Fees: ${fees}`,
          chalk.red
        );
      }
    }
  }

  /**
   * Get the inputs for the neural network
   * @param index
   */
  private look(index: number) {
    let visions: number[] = [];

    // Holding a trade ?
    const position = this.futuresWallet.position;
    const holdingTrade = position.size !== 0 ? 1 : 0;
    visions.push(holdingTrade);

    // Indicators
    let indicatorVisions = this.indicators.map((indicator) => indicator[index]);

    this.visions = visions.concat(indicatorVisions);
  }

  /**
   * Gets the output of the brain, then converts them to actions
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
