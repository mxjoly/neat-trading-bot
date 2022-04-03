import dayjs from 'dayjs';
import chalk from 'chalk';
import { OrderSide } from 'binance-api-node';
import { logger } from '../init';

/**
 * Main function add a log
 * @param message
 * @param date
 */
export function log(message: string, date = new Date()) {
  const logDate = dayjs(date).format('YYYY-MM-DD HH:mm:ss');
  logger.info(`${logDate} : @futures > ${message}`);
  console.log(`${chalk.blue(logDate)} : @futures > ${message}`);
}

/**
 * Main function add an error in the logs
 * @param message
 * @param date
 */
export function error(message: string, date = new Date()) {
  const logDate = dayjs(date).format('YYYY-MM-DD HH:mm:ss');
  logger.warn(`${logDate} : @futures > ${message}`);
  console.log(`${chalk.blue(logDate)} : @futures > ${message}`);
}
