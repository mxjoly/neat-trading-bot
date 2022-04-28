import chalk from 'chalk';
import dayjs from 'dayjs';
import { logger } from '../init';
import { decimalFloor } from '../utils/math';
import { DEBUG } from './bot';

export function log(message: any, chalkColor?: any) {
  if (DEBUG) {
    if (chalkColor) console.log(chalkColor(message));
    else console.log(chalk.white(message));
  }
  logger.info(message);
}

export function printDateBanner(date: Date) {
  log(
    `------------------------------- ${dayjs(date).format(
      'YYYY-MM-DD HH:mm:ss'
    )} -----------------------------------`,
    chalk.white
  );
}

export function debugLastCandle(lastCandle: CandleData) {
  let { close, open, high, low } = lastCandle;
  log(
    `candle: [ open: ${open} | high: ${high} | low: ${low} | close: ${close} ]`,
    chalk.yellow
  );
}

export function debugWallet(wallet: Wallet) {
  let {
    availableBalance,
    totalWalletBalance,
    totalUnrealizedProfit,
    position,
  } = wallet;
  let walletString = `wallet: { availableBalance: ${decimalFloor(
    availableBalance,
    2
  )} | totalBalance: ${decimalFloor(
    totalWalletBalance,
    2
  )} | unrealizedProfit: ${decimalFloor(totalUnrealizedProfit, 2)} }`;
  log(walletString, chalk.grey);

  let positionsString =
    'position: ' +
    `[ pair: ${position.pair} | leverage: ${
      position.leverage
    } | positionSide: ${position.positionSide} | size: ${
      position.size
    } | margin: ${decimalFloor(position.margin, 2)} | entryPrice: ${
      position.entryPrice
    } | pnl: ${decimalFloor(position.unrealizedProfit, 2)} ]`;
  log(positionsString, chalk.grey);
}

export function debugOpenOrders(openOrders: OpenOrder[]) {
  if (openOrders.length > 0) {
    let ordersString = `orders: [ ${openOrders
      .map(
        (o) =>
          `{ id: ${o.id} | pair: ${o.pair} | type: ${o.type} | side: ${o.positionSide} | qty: ${o.quantity} | price: ${o.price} }`
      )
      .join(' , ')} ]`;

    log(ordersString, chalk.grey);
  }
}
