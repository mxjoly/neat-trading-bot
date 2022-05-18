# Neat Trading Bot

Crypto trading bot using genetic algorithm (NEAT).

**WARNING : It's an experimental project and I don't advice you to test it with real money. Some of the features doesn't work yet and it needs to be testing.**

## Usage

### Generate the data
```
npm run data
```

### Run the training
```
npm run build:test
npm run train
```

### Run a backtest
```
npm run build:test
npm run test
```

### Run the bot in production mode

```
npm run build:prod
npm start 
```

## Generation of the historical data for the training

1. Download the data for your currencies at https://www.cryptodatadownload.com/data/binance/ with the timeframe `1m` and move the files to the folder named `data`at the root of the project. Delete for each file the first line and tap the command `npm run data` to generate your historical data on multiple time frames (1m, 5m, 15m, 30m, 1h, 2h, 4h, 6h, 12h, 1d).
2. When the data are ready, update the json file `config.json` as you want to configure the genetic algorithm parameters.
3. Tap the commands `npm build:test` and `npm run train` to run the training. 
4. During the training, the genome of the best player is saved in the folder `temp`. Tap `npm run train:reset` if you want to reset the genome of the best player at the next training.

## Use your own indicator values for the neural network

To use your own indicators, update the file `src/training/indicators.ts` as you want. Then, take care to specify the right number of inputs in the file `src/training/loadConfig.ts`.
