# fSUSHI

fSUSHI is a protocol built on top of [FlashStake](http://flashstake.io/) and [SushiSwap](https://sushi.com) that enables stakers to get instant, upfront yield without waiting for it to accrue.

## How it works

```
                                                                         ┌───────────────────┐
                                                                         │                   │
                                                                         │      SousChef     │
                                                                         │                   │
                                                                         └───────────────┬───┘
                                                                                ▲        │
                                                                         fToken │        │ fSUSHI
                                                                                │        ▼
                                                                         ╔══════╧════════════╗ aLP Token   ┌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┐             ┌───────────────────┐
                                                                         ║                   ╟─────────────┤                   │ aLP Token   │                   │
                                                                         ║       User        ║             │   FlashProtocol   ├────────────►│   FlashStrategy   │
                                                                         ║                   ║◄────────────┤                   │             │     SushiSwap     │
                                                                         ╚══════════════╤════╝   fToken    └╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┘             └───────────────────┘
                                                                               ▲        │
                                                                      aLP Token│        │ SLP Token
                                                                               │        ▼
┌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┐ invest SUSHI  ┌───────────────────┐  SUSHI yield  ┌─────┴─────────────┐
│  AAVE SUSHI pool  │◄──────────────┤                   │◄──────────────┤                   │
│        or         │               │   SushiBarVault   │               │  AccruedLPToken   │
│    xSUSHI etc.    ├──────────────►│                   ├──────────────►│                   │
└╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┘ accrued SUSHI └───────────────────┘ accrued SUSHI └──────────────┬────┘
                                                                               ▲        │
                                                                   SUSHI yield │        │ SLP Token
                                                                               │        ▼
                                                                         ┌╌╌╌╌╌┴╌╌╌╌╌╌╌╌╌╌╌╌╌┐
                                                                         │                   │
                                                                         │    MasterChef     │
                                                                         │                   │
                                                                         └╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┘
```

## Contracts

### AccruedLPToken

You can deposit SushiSwap LP tokens and get the equivalent amount of `aLP` tokens. The difference from the original LP tokens is that the _SUSHI_ yield is automatically accrued to your `aLP` balance. Also, pending _SUSHI_ yield is being optimized by the dynamic strategies to get higher profits.

### FlashStrategySushiSwap

A FlashStake strategy to enable `AccruedLPToken`s to be used as principal and stakers get instant, upfront _SUSHI_ yield.
You can also stake without instant yield and in this case you get `fToken`s that are minted from FlashStake protocol.

### SousChef

By depositing your `fToken` you're eligible for receiving newly minted `fSUSHI` rewards. In the first week, 300,000 `fSUSHI`s will be distributed and in next week, only 1/10 of the circulating supply of the first week will be minted. And from the next week, only the amount of circulating supply of the last week will be minted.
Thus, you can reduce inflation rate of your `fSUSHI` by locking up your assets to `FSushiLocker`.

### FSushi - _fSUSHI_

A plain ERC20 token that only `SousChef` can mint.

### FSushiLocker - _xfSUSHI_

1% fee is posed as fee for upfront yield and 0.25% for plain staking. These fees will be distributed for `xfSUSHI` holders who locked up their `fSUSHI`. General mechanism isn't much different from `SushiBar` of SushiSwap protocol.

## TODO

- [ ] Enable migration of LP tokens in AccruedLPToken
- [ ] Add FSushiMaker
- [ ] Add FSushiRoll
- [ ] Implement pool weights in SousChef
- [ ] Implement fSUSHI multiplier for xfSUSHI stakers in SousChef

## License

Distributed under the WTFPL License. See `LICENSE` for more information.

## Author

- [LevX](https://twitter.com/LEVXeth/)
