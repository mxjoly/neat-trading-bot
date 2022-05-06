import { OrderSide, ExchangeInfo } from 'binance-api-node';
import { ATR } from 'technicalindicators';
import { decimalFloor, decimalCeil } from '../utils/math';

export const basicStrategy = (
  price: number,
  candles: CandleData[],
  pricePrecision: number,
  side: OrderSide,
  options: { profitTarget?: number; lossTolerance?: number }
) => {
  let takeProfit =
    side === OrderSide.BUY
      ? decimalFloor(price * (1 + options.profitTarget), pricePrecision)
      : decimalCeil(price * (1 - options.profitTarget), pricePrecision);

  let stopLoss =
    side === OrderSide.BUY
      ? decimalCeil(price * (1 - options.lossTolerance), pricePrecision)
      : decimalFloor(price * (1 + options.lossTolerance), pricePrecision);

  return { takeProfit, stopLoss };
};

export const atrStrategy = (
  price: number,
  candles: CandleData[],
  pricePrecision: number,
  side: OrderSide,
  options: {
    takeProfitAtrRatio?: number;
    stopLossAtrRatio?: number;
    atrPeriod?: number;
    atrMultiplier?: number;
  }
) => {
  const atr = ATR.calculate({
    period: options.atrPeriod,
    close: candles.map((c) => c.close).slice(-options.atrPeriod * 2),
    low: candles.map((c) => c.low).slice(-options.atrPeriod * 2),
    high: candles.map((c) => c.high).slice(-options.atrPeriod * 2),
  });

  let takeProfit =
    side === OrderSide.BUY
      ? decimalFloor(
          price +
            options.takeProfitAtrRatio *
              atr[atr.length - 1] *
              options.atrMultiplier,
          pricePrecision
        )
      : decimalCeil(
          price -
            options.takeProfitAtrRatio *
              atr[atr.length - 1] *
              options.atrMultiplier,
          pricePrecision
        );

  let stopLoss =
    side === OrderSide.BUY
      ? decimalFloor(
          price -
            options.stopLossAtrRatio *
              atr[atr.length - 1] *
              options.atrMultiplier,
          pricePrecision
        )
      : decimalCeil(
          price +
            options.stopLossAtrRatio *
              atr[atr.length - 1] *
              options.atrMultiplier,
          pricePrecision
        );

  return { takeProfit, stopLoss };
};

export const tickStrategy = (
  price: number,
  candles: CandleData[],
  pricePrecision: number,
  side: OrderSide,
  exchangeInfo: ExchangeInfo,
  options: { profitTarget?: number; lossTolerance?: number }
) => {
  let tickSize = exchangeInfo.symbols
    .filter((f) => f.symbol === candles[0].symbol)[0]
    // @ts-ignore
    .filters.filter((f) => f.filterType === 'PRICE_FILTER')[0].tickSize;

  let n = process.env.NODE_ENV === 'production' ? 100 : 10;

  let tpTicks =
    (price * (1 + options.profitTarget) - price) / Number(tickSize) / n;
  let slTicks =
    (price * (1 + options.lossTolerance) - price) / Number(tickSize) / n;

  let takeProfit =
    side === OrderSide.BUY
      ? decimalFloor(price + tpTicks, pricePrecision)
      : decimalCeil(price - tpTicks, pricePrecision);

  let stopLoss =
    side === OrderSide.BUY
      ? decimalCeil(price - slTicks, pricePrecision)
      : decimalFloor(price + slTicks, pricePrecision);

  return { takeProfit, stopLoss };
};
