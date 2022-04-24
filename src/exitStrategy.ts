import { OrderSide } from 'binance-api-node';
import { decimalFloor } from './utils/math';

interface Options {
  profitTarget?: number;
  lossTolerance?: number;
}

const defaultOptions: Options = {};

export const basicStrategy = (
  price: number,
  pricePrecision: number,
  side: OrderSide,
  options = defaultOptions
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
