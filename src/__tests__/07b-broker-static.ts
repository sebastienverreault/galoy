/**
 * @jest-environment node
 */
import { BrokerWallet } from "../BrokerWallet";

it('init-order', async () => {
  const { btcAmount, buyOrSell } = BrokerWallet.isOrderNeeded({ usdLiability: 100, usdExposure: 0, btcPrice: 10000 })
  // we should sell to have $98 short position 
  expect(buyOrSell).toBe("sell")
  expect(btcAmount).toBe(0.0098)
})

it('calculate hedging amount when under exposed', async () => {
  // ratio is a .5
  // need to be at .98
  // should buy $480/0.048 BTC
  const { btcAmount, buyOrSell } = BrokerWallet.isOrderNeeded({ usdLiability: 1000, usdExposure: 500, btcPrice: 10000 })
  expect(buyOrSell).toBe("sell")
  expect(btcAmount).toBe(0.048)
})

it('calculate hedging amount when over exposed', async () => {
  // ratio is a 2
  // need to be at HIGH_SAFEBOUND_RATIO_SHORTING (1.00)
  // should sell $1000/0.1 BTC to have exposure being back at $1000
  const { btcAmount, buyOrSell } = BrokerWallet.isOrderNeeded({ usdLiability: 1000, usdExposure: 2000, btcPrice: 10000 })
  expect(buyOrSell).toBe("buy")
  expect(btcAmount).toBe(0.1)
})

it('calculate hedging when no rebalance is needed', async () => {
  const { btcAmount, buyOrSell } = BrokerWallet.isOrderNeeded({ usdLiability: 1000, usdExposure: 1000, btcPrice: 10000 })
  expect(buyOrSell).toBeNull()
})


it('test init account', async () => { // "leverage":null,"collateral":0,"btcPrice":11378,
  const { btcAmount, depositOrWithdraw } = BrokerWallet.isRebalanceNeeded({ usdLiability: 0, btcPrice: 10000, usdCollateral: 0})
  expect(depositOrWithdraw).toBe(null)
})

it('test first deposit', async () => { // "leverage":null,"collateral":0,"btcPrice":11378,
  const { btcAmount, depositOrWithdraw } = BrokerWallet.isRebalanceNeeded({ usdLiability: 1000, btcPrice: 10000, usdCollateral: 0})
  expect(depositOrWithdraw).toBe("deposit")
  expect(btcAmount).toBeCloseTo(0.04444) // $1000 / leverage (2.25) / price
})

it('isRebalanceNeeded test under leverage', async () => {
  const { btcAmount, depositOrWithdraw } = BrokerWallet.isRebalanceNeeded({ usdLiability: 1000, btcPrice: 10000, usdCollateral: 200 })
  expect(depositOrWithdraw).toBe("deposit")
  // deposit $244 go to $444
  expect(btcAmount).toBeCloseTo(0.0244) 
})

it('isRebalanceNeeded test over leverage', async () => {
  const { btcAmount, depositOrWithdraw } = BrokerWallet.isRebalanceNeeded({ usdLiability: 1000, btcPrice: 10000, usdCollateral: 800})
  expect(depositOrWithdraw).toBe("withdraw")
  // withdraw $245 to go from $800 to $555 (1000/1.8)
  expect(btcAmount).toBeCloseTo(0.0245) 
})

it('isRebalanceNeeded test outrageously over leverage', async () => {
  const { btcAmount, depositOrWithdraw } = BrokerWallet.isRebalanceNeeded({ usdLiability: 1000, btcPrice: 10000, usdCollateral: 2800 })
  expect(depositOrWithdraw).toBe("withdraw")
  // withdral to be at $555
  expect(btcAmount).toBeCloseTo(0.2245) 
})

it('isRebalanceNeeded test no action', async () => {
  const { btcAmount, depositOrWithdraw } = BrokerWallet.isRebalanceNeeded({ usdLiability: 1000, btcPrice: 10000, usdCollateral: 500 })
  expect(depositOrWithdraw).toBeNull()
})