import colors from 'ansi-colors';
import { ExchangeInfo, OrderSide } from 'binance-api-node';
import chalk from 'chalk';
import cliProgress from 'cli-progress';
import dayjs from 'dayjs';
import safeRequire from 'safe-require';
import { binanceClient } from '../init';
import Genome from '../core/genome';
import { calculateIndicators } from '../training/indicators';
import generateHTMLReport from './generateReport';
import {
  debugLastCandle,
  debugOpenOrders,
  debugWallet,
  log,
  printDateBanner,
} from './debug';
import { decimalCeil, decimalFloor } from '../utils/math';
import { Counter } from '../tools/counter';
import { durationBetweenDates } from '../utils/timeFrame';
import { loadCandlesFromCSV } from '../utils/loadCandleData';
import { getPricePrecision, getQuantityPrecision } from '../utils/currencyInfo';
import { calculateActivationPrice } from '../utils/trailingStop';
import { isOnTradingSession } from '../utils/tradingSession';

// ====================================================================== //

const BotConfig = safeRequire(`${process.cwd()}/config.json`);

if (!BotConfig) {
  console.error(
    'Something is wrong. No json config file has been found at the root of the project.'
  );
  process.exit(1);
}

// ====================================================================== //

const bar = new cliProgress.SingleBar(
  {
    format:
      'Progress: |' + colors.blue('{bar}') + '| {percentage}% | date: {date}',
  },
  cliProgress.Presets.shades_classic
);

// ====================================================================== //

// Debug mode with console.log
export const DEBUG = process.argv[2]
  ? process.argv[2].split('=')[1] === 'true'
    ? true
    : false
  : false;

// The bot starts to trade when it has X available candles
const CANDLE_MIN_LENGTH = 210;

// Exchange fee info
const TAKER_FEES = BotConfig['taker_fees_futures']; // %
const MAKER_FEES = BotConfig['maker_fees_futures']; // %

// ====================================================================== //

export class BackTestBot {
  // Configuration
  private strategyConfig: StrategyConfig;

  // Data
  private historicCandleData: CandleData[] = [];
  private indicators: number[][];

  // Counter to fix the max duration of each trade
  private counter: Counter;

  // Initial parameters
  private startDate: Date;
  private endDate: Date;
  private initialCapital: number;

  // Account mocks
  private wallet: Wallet;
  private openOrders: OpenOrder[];

  // Neat
  private brain: Genome;
  private visions: number[];
  private decisions: number[];

  // For the calculation of some properties of the strategy report
  public strategyReport: StrategyReport = {};
  private maxBalance: number;
  private maxAbsoluteDrawdown = 1;
  private maxRelativeDrawdown = 1;
  private maxProfit = 0;
  private maxLoss = 0;
  private maxConsecutiveWinsCount = 0;
  private maxConsecutiveLossesCount = 0;
  private maxConsecutiveProfitCount = 0;
  private maxConsecutiveLossCount = 0;

  // To generate the html report
  private chartLabels: string[] = [];
  private chartData: number[] = [];

  constructor(
    strategyConfig: StrategyConfig,
    startDate: Date,
    endDate: Date,
    initialCapital: number,
    brain: Genome
  ) {
    this.strategyConfig = strategyConfig;
    this.startDate = startDate;
    this.endDate = endDate;
    this.initialCapital = initialCapital;
    this.maxBalance = initialCapital;
    this.brain = brain;

    if (this.strategyConfig.maxTradeDuration) {
      this.counter = new Counter(this.strategyConfig.maxTradeDuration);
    }
  }

  /**
   * Prepare the mock account data, the open orders, and initialize some properties of the strategy report
   */
  public prepare() {
    this.wallet = {
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

    this.openOrders = [];

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
    for (let i = CANDLE_MIN_LENGTH; i < this.historicCandleData.length; i++) {
      let candles = this.historicCandleData.slice(i - CANDLE_MIN_LENGTH, i + 1);
      let currentCandle = candles[candles.length - 1];
      let currentDate = currentCandle.closeTime;
      let currentPrice = currentCandle.close;
      let pair = this.strategyConfig.asset + this.strategyConfig.base;

      printDateBanner(currentDate);
      debugLastCandle(currentCandle);

      // Neat
      this.look(i, candles);
      this.think();

      // Check the current trades/positions
      this.checkPositionMargin(pair, currentPrice); // If the position margin reach 0, close the position (liquidation)
      this.checkOpenOrders(
        this.strategyConfig.asset,
        this.strategyConfig.base,
        candles
      );
      this.trade(this.strategyConfig, currentPrice, candles, exchangeInfo);
      this.updatePNL(currentPrice);

      // Update the max drawdown and max balance property for the strategy report
      this.updateMaxDrawdownMaxBalance();

      // Update the total unrealized pnl on the futures account
      this.updateTotalPNL();

      // Debugging
      debugWallet(this.wallet);
      debugOpenOrders(this.openOrders);
      log(''); // \n

      if (!DEBUG)
        bar.increment(1, {
          date: dayjs(currentDate).format('YYYY-MM-DD HH:mm'),
        });

      // Preparing chart data for the strategy report in html
      this.chartLabels.push(dayjs(currentDate).format('YYYY-MM-DD'));
      this.chartData.push(this.wallet.totalWalletBalance);
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
      this.wallet.totalWalletBalance,
      2
    );
    this.strategyReport.totalNetProfit = decimalFloor(
      this.wallet.totalWalletBalance - this.initialCapital,
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
    if (this.wallet.totalWalletBalance > this.maxBalance) {
      this.maxBalance = this.wallet.totalWalletBalance;
    }
    // Max absolute drawdown update
    let absoluteDrawdown = this.wallet.totalWalletBalance / this.maxBalance;
    if (absoluteDrawdown < this.maxAbsoluteDrawdown) {
      this.maxAbsoluteDrawdown = absoluteDrawdown;
    }
    // Max relative drawdown update
    let relativeDrawdown =
      (this.wallet.totalWalletBalance - this.maxBalance) / this.maxBalance;
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
   * Main function for the futures mode
   * @param strategyConfig
   * @param currentPrice
   * @param candles
   * @param exchangeInfo
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
    const canTakeLongPosition = useLongPosition && position.size === 0;
    const canTakeShortPosition = useShortPosition && position.size === 0;

    // Check if we are in the trading sessions
    const isTradingSessionActive = isOnTradingSession(
      candles[candles.length - 1].closeTime,
      tradingSessions
    );

    // Open orders
    const currentOpenOrders = this.openOrders;

    // Currency infos
    const pricePrecision = getPricePrecision(pair, exchangeInfo);
    const quantityPrecision = getQuantityPrecision(pair, exchangeInfo);

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
        log(
          `The position on ${pair} is longer that the maximum authorized duration. Position has been closed.`
        );
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

    // Reset the counter if a previous trade close the position
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

      this.orderMarket(pair, currentPrice, quantity, OrderSide.BUY);

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
      const pairOrders = this.openOrders;
      const longOrders = pairOrders.filter(
        (order) => order.positionSide === 'LONG'
      );
      const shortOrders = pairOrders.filter(
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

            // Update strategy report
            this.updateProfitLossStrategyProperty(pnl);

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
              this.strategyReport.totalTrades++;
              this.strategyReport.totalLongTrades++;
            }

            if (hasPosition && entryPrice >= price)
              this.strategyReport.shortWinningTrade++;
            if (hasPosition && entryPrice < price)
              this.strategyReport.shortLostTrade++;
            this.strategyReport.totalFees += fees;

            log(
              `${
                entryPrice < price
                  ? '[SL]'
                  : entryPrice > price
                  ? '[TP]'
                  : '[BE]'
              } Long order #${id} has been activated for ${quantity}${asset} at ${price}. Fees: ${fees}`,
              chalk.magenta
            );

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

                this.updateProfitLossStrategyProperty(pnl);

                this.strategyReport.totalFees += fees;
                if (price <= entryPrice)
                  this.strategyReport.shortWinningTrade++;
                else this.strategyReport.shortLostTrade++;

                log(
                  `Trailing stop long order #${id} has been activated for ${Math.abs(
                    quantity
                  )}${asset} at ${price}. Fees: ${fees}`,
                  chalk.magenta
                );
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

            // Update strategy report
            this.updateProfitLossStrategyProperty(pnl);

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
              this.strategyReport.totalTrades++;
              this.strategyReport.totalShortTrades++;
            }

            if (hasPosition && entryPrice <= price)
              this.strategyReport.longWinningTrade++;
            if (hasPosition && entryPrice > price)
              this.strategyReport.longLostTrade++;
            this.strategyReport.totalFees += fees;

            log(
              `${
                entryPrice > price
                  ? '[SL]'
                  : entryPrice < price
                  ? '[TP]'
                  : '[BE]'
              } Sell order #${id} has been activated for ${quantity}${asset} at ${price}. Fees: ${fees}`,
              chalk.magenta
            );

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

                this.updateProfitLossStrategyProperty(pnl);

                this.strategyReport.totalFees += fees;
                if (price >= entryPrice) this.strategyReport.longWinningTrade++;
                else this.strategyReport.longLostTrade++;

                log(
                  `Trailing stop sell order #${id} has been activated for ${Math.abs(
                    quantity
                  )}${asset} at ${price}. Fees: ${fees}`,
                  chalk.magenta
                );
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
   * Close a futures open order by its id
   * @param orderId The id of the order to close
   */
  private closeOpenOrder(orderId: string) {
    this.openOrders = this.openOrders.filter((order) => order.id !== orderId);
    log(`Close the open order #${orderId}`, chalk.cyan);
  }

  /**
   * Close all the futures open orders for a given pair
   * @param pair
   */
  private closeOpenOrders(pair: string) {
    this.openOrders = this.openOrders.filter((order) => order.pair !== pair);
    log(`Close all the open orders on the pair ${pair}`, chalk.cyan);
  }

  /**
   * Check if the margin is enough to maintain the position. If not, the position is liquidated
   * @param pair
   * @param currentPrice The current price in the main loop
   */
  private checkPositionMargin(pair: string, currentPrice: number) {
    const position = this.wallet.position;
    const { margin, unrealizedProfit, size, positionSide } = position;

    if (size !== 0 && margin + unrealizedProfit <= 0) {
      log(`The position on ${pair} has reached the liquidation price.`);
      this.orderMarket(
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
    let position = this.wallet.position;
    position.unrealizedProfit = this.getPositionPNL(position, currentPrice);
  }

  /**
   * Update the total unrealized profit property of the futures wallet object
   */
  private updateTotalPNL() {
    this.wallet.totalUnrealizedProfit = this.wallet.position.unrealizedProfit;
  }

  /**
   * Futures market order execution
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
    const position = this.wallet.position;
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
   * Place a futures limit order
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
      console.error(
        `Limit order for the pair ${pair} cannot be placed. quantity=${quantity} price=${price}`
      );
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
   * Get the inputs for the neural network
   * @param index
   */
  private look(index: number, candles: CandleData[]) {
    this.visions = this.indicators.map((indicator) => indicator[index]);
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
