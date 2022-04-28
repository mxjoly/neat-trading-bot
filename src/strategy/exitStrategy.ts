import { OrderSide } from 'binance-api-node';
import { ATR } from 'technicalindicators';
import { decimalFloor } from '../utils/math';

export const basicStrategy = (
  price: number,
  candles: CandleData[],
  pricePrecision: number,
  side: OrderSide,
  options: { profitTarget?: number; lossTolerance?: number }
) => {
  let takeProfit = decimalFloor(
    side === OrderSide.BUY
      ? price * (1 + options.profitTarget)
      : price * (1 - options.profitTarget),
    pricePrecision
  );

  let stopLoss = decimalFloor(
    side === OrderSide.BUY
      ? price * (1 - options.lossTolerance)
      : price * (1 + options.lossTolerance),
    pricePrecision
  );

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

  let takeProfit = decimalFloor(
    side === OrderSide.BUY
      ? price +
          options.takeProfitAtrRatio *
            atr[atr.length - 1] *
            options.atrMultiplier
      : price -
          options.takeProfitAtrRatio *
            atr[atr.length - 1] *
            options.atrMultiplier,
    pricePrecision
  );

  let stopLoss = decimalFloor(
    side === OrderSide.BUY
      ? price -
          options.stopLossAtrRatio * atr[atr.length - 1] * options.atrMultiplier
      : price +
          options.stopLossAtrRatio *
            atr[atr.length - 1] *
            options.atrMultiplier,
    pricePrecision
  );

  return { takeProfit, stopLoss };
};
