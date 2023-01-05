# fSUSHI

fSUSHI is a protocol built on top of [FlashStake](http://flashstake.io/) and [SushiSwap](https://sushi.com) that enables stakers to get instant, upfront yield without waiting for it to accrue.

## Deployments

### Mainnet

| Contract                      | Address                                                                                                               |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| FSushi                        | [0xA24390c62186A8D265344e914F0Fd962B81b5F13](https://etherscan.io/address/0xA24390c62186A8D265344e914F0Fd962B81b5F13) |
| FSushiAirdrops                | [0x4909B5a6Fbd15884fed4F5D1Af829AF5e9bc8e28](https://etherscan.io/address/0x4909B5a6Fbd15884fed4F5D1Af829AF5e9bc8e28) |
| FSushiAirdropsVotingEscrow    | [0x7C375121690Bd65295B33c526F39dA1BAEDcFC97](https://etherscan.io/address/0x7C375121690Bd65295B33c526F39dA1BAEDcFC97) |
| SushiBarVault                 | [0x3e55AC0E6724BBe8aB40a60771B5D60fC8e93404](https://etherscan.io/address/0x3e55AC0E6724BBe8aB40a60771B5D60fC8e93404) |
| FarmingLPTokenFactory         | [0xEE083E0F0f5dE2ff34662F1ef6f76d897d5047EF](https://etherscan.io/address/0xEE083E0F0f5dE2ff34662F1ef6f76d897d5047EF) |
| FlashStrategySushiSwapFactory | [0x77b8E6e577fd3e90553dbF205D3854a649414741](https://etherscan.io/address/0x77b8E6e577fd3e90553dbF205D3854a649414741) |
| FSushiBar                     | [0x8f77a1f6D36c6F3005B33E4071733C7057463Ca5](https://etherscan.io/address/0x8f77a1f6D36c6F3005B33E4071733C7057463Ca5) |
| FSushiKitchen                 | [0xe4CC24Fa7bbcCD83cF10a20760B1b842Cb750421](https://etherscan.io/address/0xe4CC24Fa7bbcCD83cF10a20760B1b842Cb750421) |
| SousChef                      | [0x5d8F31F88DBd4B05c3e5Fb60743aF281259E64b8](https://etherscan.io/address/0x5d8F31F88DBd4B05c3e5Fb60743aF281259E64b8) |

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
                                                                         ╔══════╧════════════╗ fLP Token   ┌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┐             ┌───────────────────┐
                                                                         ║                   ╟────────────►┤                   │ fLP Token   │                   │
                                                                         ║       User        ║             │   FlashProtocol   ├────────────►│   FlashStrategy   │
                                                                         ║                   ║◄────────────┤                   │             │     SushiSwap     │
                                                                         ╚══════════════╤════╝   fToken    └╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┘             └───────────────────┘
                                                                               ▲        │
                                                                      fLP Token│        │ SLP Token
                                                                               │        ▼
 ┌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┐ invest SUSHI  ┌───────────────────┐  SUSHI yield  ┌─────┴─────────────┐
 │  AAVE SUSHI pool  │◄──────────────┤                   │◄──────────────┤                   │
 │        or         │               │   SushiBarVault   │               │  FarmingLPToken   │
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

### FarmingLPToken

You can deposit SushiSwap LP tokens and get the equivalent amount of `fLP` tokens. The difference from the original LP tokens is that the _SUSHI_ yield is automatically accrued to your `fLP` balance. Also, pending _SUSHI_ yield is being optimized by the dynamic strategies to get higher profits.

### FlashStrategySushiSwap

A FlashStake strategy to enable `FarmingLPToken`s to be used as principal and stakers get instant, upfront _SUSHI_ yield.
You can also stake without instant yield and in this case you get `fToken`s that are minted from FlashStake protocol.

### SousChef

By depositing your `fToken` you're eligible for receiving newly minted `fSUSHI` rewards. In the first week, 300,000 `fSUSHI`s will be distributed and in 2nd week, only 1/10 of the circulating supply of the first week will be minted. (10x boost in the first week)
And during the 2nd week, only 99% of the first week's circulating supply will be minted. During the 3rd week, only 99% of the second week's circulating supply will be minted. This goes on and on.
Thus, you can reduce inflation rate of your `fSUSHI` by locking up your assets to `FSushiBar`.

### FSushi - _fSUSHI_

A plain ERC20 token that only `SousChef` can mint.

### FSushiBar - _xfSUSHI_

1% fee is posed as fee for upfront yield and 0.25% for plain staking. These fees will be distributed for `xfSUSHI` holders who locked up their `fSUSHI`. General mechanism isn't much different from `SushiBar` of SushiSwap protocol.

## License

Distributed under the BUSL-1.1 License. See `LICENSE` for more information.

## Author

- [LevX](https://twitter.com/LEVXeth/)
