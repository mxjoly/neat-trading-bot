import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';
import { Binance, CandleChartInterval } from 'binance-api-node';
import dayjs from 'dayjs';

/**
 * Load the candle data on a symbol, on a specific time frames, and on a date range
 * @param symbol The symbol to load the candles
 * @param interval The time frame to load
 * @param startDate
 * @param endDate
 */
export function loadCandlesFromCSV(
  symbol: string,
  interval: CandleChartInterval,
  startDate: string | number | Date,
  endDate: string | number | Date
) {
  return new Promise<CandleData[]>((resolve) => {
    let file = path.join(process.cwd(), 'data', symbol, `_${interval}.csv`);
    let candleData: CandleData[] = [];

    fs.createReadStream(file)
      .pipe(csv({ separator: ',' }))
      .on('data', (data: CandleData) => {
        if (
          dayjs(data.openTime).isAfter(startDate) &&
          dayjs(data.closeTime).isBefore(endDate)
        ) {
          candleData.push({
            symbol,
            interval,
            openTime: new Date(data.openTime),
            closeTime: new Date(data.closeTime),
            open: Number(data.open),
            close: Number(data.close),
            high: Number(data.high),
            low: Number(data.low),
            volume: Number(data.volume),
          });
        }
      })
      .on('end', () => {
        resolve(candleData.reverse());
      });
  });
}

/**
 * Load the candle data for a specific time frame (or interval) from the binance api
 * @param symbol
 * @param interval
 * @param onlyFinalCandle
 */
export function loadCandlesFromAPI(
  symbol: string,
  interval: CandleChartInterval,
  binanceClient: Binance,
  onlyFinalCandle = true
) {
  return new Promise<CandleData[]>((resolve, reject) => {
    binanceClient
      .futuresCandles({ symbol, interval })
      .then((candles) => {
        resolve(
          candles
            .slice(0, onlyFinalCandle ? -1 : candles.length)
            .map((candle) => ({
              symbol,
              interval,
              open: Number(candle.open),
              high: Number(candle.high),
              low: Number(candle.low),
              close: Number(candle.close),
              volume: Number(candle.volume),
              openTime: new Date(candle.openTime),
              closeTime: new Date(candle.closeTime),
            }))
        );
      })
      .catch(reject);
  });
}

/**
 * Get the data from candles
 * @param candles
 * @param sourceType
 */
export function getCandleSourceType(
  candles: CandleData[],
  sourceType: SourceType
) {
  switch (sourceType) {
    case 'open':
      return candles.map((c) => c.open);
    case 'high':
      return candles.map((c) => c.high);
    case 'low':
      return candles.map((c) => c.low);
    case 'close':
      return candles.map((c) => c.close);
    case 'hl2':
      return candles.map((c) => (c.high + c.low) / 2);
    case 'hlc3':
      return candles.map((c) => (c.high + c.low + c.close) / 3);
    case 'hlcc4':
      return candles.map((c) => (c.high + c.low + c.close * 2) / 3);
    case 'volume':
      return candles.map((c) => c.volume);
    default:
      return candles.map((c) => c.close);
  }
}
