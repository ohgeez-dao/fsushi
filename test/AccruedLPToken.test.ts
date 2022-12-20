import { ethers } from "hardhat";
import { BigNumber, constants } from "ethers";
import { assert, expect } from "chai";
import {
    AccruedLPToken,
    AccruedLPToken__factory,
    AccruedLPTokenFactory,
    IAccruedLPToken__factory,
    SushiBarVault,
    UniswapV2Pair__factory,
} from "../typechain-types";
import setupSushiswap, { SUSHI_PER_BLOCK } from "./utils/setupSushiswap";
import mineBlocks from "./utils/mineBlocks";
import setupTokens from "./utils/setupTokens";
import addressEquals from "./utils/addressEquals";
import now from "./utils/now";

const ONE = ethers.constants.WeiPerEther;
const MINIMUM_LIQUIDITY = 1000;
const DELTA = ethers.BigNumber.from(10).pow(8);

const sqrt = value => {
    const one = ethers.BigNumber.from(1);
    const two = ethers.BigNumber.from(2);
    const x = ethers.BigNumber.from(value);
    let z = x.add(one).div(two);
    let y = x;
    while (z.sub(y).isNegative()) {
        y = z;
        z = x.div(z).add(z).div(two);
    }
    return y;
};

const min = (a: BigNumber, b: BigNumber) => (a.gt(b) ? b : a);

const setupTest = async () => {
    const tokens = await setupTokens();
    const sushi = await setupSushiswap(tokens);
    const [deployer, alice, bob, carol] = await ethers.getSigners();

    const Vault = await ethers.getContractFactory("SushiBarVault");
    const vault = (await Vault.deploy(tokens.sushi.address, sushi.bar.address)) as SushiBarVault;

    const Factory = await ethers.getContractFactory("AccruedLPTokenFactory");
    const factory = (await Factory.deploy(
        sushi.router.address,
        sushi.chef.address,
        vault.address
    )) as AccruedLPTokenFactory;

    const createAccruedLPToken = async pid => {
        await factory.createAccruedLPToken(pid);
        return AccruedLPToken__factory.connect(
            await factory.predictAccruedLPTokenAddress(pid),
            ethers.provider
        ) as AccruedLPToken;
    };

    const findPathToSushi = async tokenAddressIn => {
        if (addressEquals(tokenAddressIn, tokens.sushi.address)) {
            return [tokens.sushi.address];
        }
        const pair = await sushi.factory.getPair(tokenAddressIn, tokens.sushi.address);
        if (addressEquals(pair, constants.AddressZero)) {
            const length = (await sushi.factory.allPairsLength()).toNumber();
            for (let i = 0; i < length; i++) {
                const lpToken = UniswapV2Pair__factory.connect(await sushi.factory.allPairs(i), ethers.provider);
                const token0 = await lpToken.token0();
                const token1 = await lpToken.token1();
                if (addressEquals(tokenAddressIn, token0) || addressEquals(tokenAddressIn, token1)) {
                    const bridge = addressEquals(tokenAddressIn, token0) ? token1 : token0;
                    if ((await sushi.factory.getPair(bridge, tokens.sushi.address)) != constants.AddressZero) {
                        return [tokenAddressIn, bridge, tokens.sushi.address];
                    }
                }
            }
            assert(false, "cannot find path to sushi");
        } else {
            return [tokenAddressIn, tokens.sushi.address];
        }
    };

    const findPathFromSushi = async tokenAddressOut => {
        if (addressEquals(tokenAddressOut, tokens.sushi.address)) {
            return [tokens.sushi.address];
        }
        const pair = await sushi.factory.getPair(tokens.sushi.address, tokenAddressOut);
        expect(pair).not.equals(constants.AddressZero);

        return [tokens.sushi.address, tokenAddressOut];
    };

    const quote = async (amountIn, path) => {
        if (path.length < 2) return amountIn;
        const amountOuts = await sushi.router.getAmountsOut(amountIn, path);
        return amountOuts[amountOuts.length - 1];
    };

    const getStakeParameters = async (lpToken, amountLP, beneficiary) => {
        const [token0, token1] = [await lpToken.token0(), await lpToken.token1()];
        const totalSupply = await lpToken.totalSupply();
        const [reserve0, reserve1] = await lpToken.getReserves();
        const amount0 = reserve0.mul(amountLP).div(totalSupply);
        const amount1 = reserve1.mul(amountLP).div(totalSupply);

        const path0 = await findPathToSushi(token0);
        const path1 = await findPathToSushi(token1);
        const amount = (await quote(amount0, path0)).add(await quote(amount1, path1));

        return [amountLP, path0, path1, amount, beneficiary.address, (await now()) + 60] as const;
    };

    const getStakeWithSushiParameters = async (amountIn, tokenA, tokenB, beneficiary) => {
        const pair = await sushi.factory.getPair(tokenA.address, tokenB.address);
        expect(pair).not.equals(constants.AddressZero);
        const lpToken = await UniswapV2Pair__factory.connect(pair, ethers.provider);
        const [token0, token1] = addressEquals(await lpToken.token0(), tokenA.address)
            ? [tokenA, tokenB]
            : [tokenB, tokenA];

        const path0 = await findPathFromSushi(token0.address);
        const path1 = await findPathFromSushi(token1.address);
        const amount0 = await quote(amountIn.div(2), path0);
        const amount1 = await quote(amountIn.div(2), path1);

        const totalSupply = await lpToken.totalSupply();
        let amountLP;
        if (totalSupply.isZero()) {
            amountLP = sqrt(amount0.mul(amount1)).sub(MINIMUM_LIQUIDITY);
        } else {
            const [reserve0, reserve1] = await lpToken.getReserves();
            amountLP = min(amount0.mul(totalSupply).div(reserve0), amount1.mul(totalSupply).div(reserve1));
        }

        return [amountIn, path0, path1, amountLP, beneficiary.address, (await now()) + 60] as const;
    };

    const stakeWithSushi = async (account, alpToken, amountIn, tokenA, tokenB) => {
        const params = await getStakeWithSushiParameters(amountIn, tokenA, tokenB, account);
        const tx = await alpToken.connect(account).stakeWithSushi(...params);
        const { logs } = await tx.wait();
        const ifc = IAccruedLPToken__factory.createInterface();
        const topic = ifc.getEventTopic("Stake");
        const log = logs.find(log => log.topics.includes(topic));
        if (log) return ifc.parseLog(log).args;
    };

    return {
        deployer,
        alice,
        bob,
        carol,
        tokens,
        sushi,
        vault,
        factory,
        createAccruedLPToken,
        getStakeParameters,
        stakeWithSushi,
    };
};

describe("AccruedLPToken", function () {
    describe("#stake()", function () {
        it("should stake in 1 pool for 1 account", async function () {
            const { alice, tokens, sushi, createAccruedLPToken, getStakeParameters } = await setupTest();

            // add SUSHI-WETH pool
            const { pid, lpToken } = await sushi.addPool(tokens.sushi, tokens.weth, 100);
            const alpToken = await createAccruedLPToken(pid);

            await tokens.sushi.transfer(alice.address, ONE.add(1000));
            await tokens.weth.connect(alice).deposit({ value: ONE.add(1000) });
            await sushi.addLiquidity(alice, tokens.sushi, tokens.weth, ONE.add(1000), ONE.add(1000));
            expect(await lpToken.balanceOf(alice.address)).to.be.equal(ONE);
            expect(await alpToken.balanceOf(alice.address)).to.be.equal(0);

            await lpToken.connect(alice).approve(alpToken.address, constants.MaxUint256);
            const params = await getStakeParameters(lpToken, ONE, alice);
            await alpToken.connect(alice).stake(...params);
            const shares = params[3];
            expect(await lpToken.balanceOf(alice.address)).to.be.equal(0);
            expect(await lpToken.balanceOf(sushi.chef.address)).to.be.equal(ONE);
            expect(await alpToken.sharesOf(alice.address)).to.be.equal(shares);
            expect(await alpToken.balanceOf(alice.address)).to.be.equal(shares);

            await mineBlocks(32);
            expect(await alpToken.withdrawableYieldOf(alice.address)).to.be.approximately(
                SUSHI_PER_BLOCK.mul(32),
                DELTA
            );

            await alpToken.connect(alice).unstake(shares, alice.address);
            expect(await lpToken.balanceOf(alice.address)).to.be.equal(ONE);
            expect(await alpToken.balanceOf(alice.address)).to.be.equal(0);
            expect(await tokens.sushi.balanceOf(alice.address)).to.be.approximately(SUSHI_PER_BLOCK.mul(33), DELTA);
        });

        it("should stake in 1 pool for multiple accounts", async function () {
            const { alice, bob, carol, tokens, sushi, vault, createAccruedLPToken, getStakeParameters } =
                await setupTest();

            // add SUSHI-WETH pool
            const { pid, lpToken } = await sushi.addPool(tokens.sushi, tokens.weth, 100);
            const alpToken = await createAccruedLPToken(pid);

            await tokens.sushi.transfer(alice.address, ONE.add(1000));
            await tokens.weth.connect(alice).deposit({ value: ONE.add(1000) });
            await sushi.addLiquidity(alice, tokens.sushi, tokens.weth, ONE.add(1000), ONE.add(1000));

            await tokens.sushi.transfer(bob.address, ONE);
            await tokens.weth.connect(bob).deposit({ value: ONE });
            await sushi.addLiquidity(bob, tokens.sushi, tokens.weth, ONE, ONE);

            await tokens.sushi.transfer(carol.address, ONE);
            await tokens.weth.connect(carol).deposit({ value: ONE });
            await sushi.addLiquidity(carol, tokens.sushi, tokens.weth, ONE, ONE);

            await lpToken.connect(alice).approve(alpToken.address, constants.MaxUint256);
            await lpToken.connect(bob).approve(alpToken.address, constants.MaxUint256);
            await lpToken.connect(carol).approve(alpToken.address, constants.MaxUint256);

            const paramsA = await getStakeParameters(lpToken, ONE, alice);
            const sharesA = paramsA[3];
            await alpToken.connect(alice).stake(...paramsA);
            expect(await alpToken.sharesOf(alice.address)).to.be.equal(sharesA);

            const paramsB = await getStakeParameters(lpToken, ONE, bob);
            const sharesB = paramsB[3];
            await alpToken.connect(bob).stake(...paramsB);
            expect(await alpToken.sharesOf(bob.address)).to.be.equal(sharesB);
            expect(await vault.balanceOf(alpToken.address)).to.be.approximately(SUSHI_PER_BLOCK, DELTA);
            expect(await alpToken.withdrawableYieldOf(alice.address)).to.be.approximately(SUSHI_PER_BLOCK, DELTA);

            await mineBlocks(29);
            expect(await alpToken.withdrawableYieldOf(alice.address)).to.be.approximately(
                SUSHI_PER_BLOCK.add(SUSHI_PER_BLOCK.mul(29).div(2)),
                DELTA
            );

            await alpToken.connect(alice).unstake(sharesA, alice.address);
            expect(await lpToken.balanceOf(alice.address)).to.be.equal(ONE);
            expect(await tokens.sushi.balanceOf(alice.address)).to.be.approximately(SUSHI_PER_BLOCK.mul(16), DELTA);
            expect(await alpToken.withdrawableYieldOf(bob.address)).to.be.approximately(SUSHI_PER_BLOCK.mul(15), DELTA);
            expect(await vault.balanceOf(alpToken.address)).to.be.approximately(SUSHI_PER_BLOCK.mul(15), DELTA);

            await mineBlocks(32);
            expect(await alpToken.withdrawableYieldOf(bob.address)).to.be.approximately(SUSHI_PER_BLOCK.mul(47), DELTA);

            await alpToken.connect(bob).unstake(sharesB, bob.address);
            expect(await tokens.sushi.balanceOf(bob.address)).to.be.approximately(SUSHI_PER_BLOCK.mul(48), DELTA);
            expect(await alpToken.withdrawableYieldOf(bob.address)).to.be.equal(0);
            expect(await vault.balanceOf(alpToken.address)).to.be.approximately(0, DELTA);

            await mineBlocks(31);
            const paramsC = await getStakeParameters(lpToken, ONE, carol);
            const sharesC = paramsC[3];
            await alpToken.connect(carol).stake(...paramsC);
            expect(await alpToken.sharesOf(carol.address)).to.be.equal(sharesC);

            await mineBlocks(31);
            await alpToken.connect(carol).unstake(sharesC, carol.address);
            expect(await tokens.sushi.balanceOf(carol.address)).to.be.approximately(SUSHI_PER_BLOCK.mul(32), DELTA);
        });

        it("should stake in multiple pools for 1 account", async function () {
            const { alice, tokens, sushi, createAccruedLPToken, getStakeParameters } = await setupTest();

            const pools = [];
            for (const pool of [
                [tokens.sushi, tokens.weth, 100],
                [tokens.usdc, tokens.weth, 50],
                [tokens.sushi, tokens.wbtc, 50],
            ]) {
                const { pid, lpToken } = await sushi.addPool(pool[0], pool[1], pool[2]);
                pools.push({
                    lpToken,
                    alpToken: await createAccruedLPToken(pid),
                });
            }

            await tokens.sushi.transfer(alice.address, ONE.add(1000).mul(2));
            await tokens.weth.connect(alice).deposit({ value: ONE.add(1000).mul(2) });
            await tokens.usdc.mint(alice.address, ONE.add(1000));
            await tokens.wbtc.mint(alice.address, ONE.add(1000));
            await sushi.addLiquidity(alice, tokens.sushi, tokens.weth, ONE.add(1000), ONE.add(1000));
            await sushi.addLiquidity(alice, tokens.usdc, tokens.weth, ONE.add(1000), ONE.add(1000));
            await sushi.addLiquidity(alice, tokens.sushi, tokens.wbtc, ONE.add(1000), ONE.add(1000));

            const shares = [];
            for (const pool of pools) {
                await pool.lpToken.connect(alice).approve(pool.alpToken.address, constants.MaxUint256);
                const params = await getStakeParameters(pool.lpToken, ONE, alice);
                shares.push(params[3]);
                await pool.alpToken.connect(alice).stake(...params);
            }
            expect(await pools[0].alpToken.withdrawableYieldOf(alice.address)).to.be.approximately(
                SUSHI_PER_BLOCK.mul(2),
                DELTA
            );
            expect(await pools[1].alpToken.withdrawableYieldOf(alice.address)).to.be.approximately(
                SUSHI_PER_BLOCK.div(2),
                DELTA
            );
            expect(await pools[2].alpToken.withdrawableYieldOf(alice.address)).to.be.equal(0);

            await mineBlocks(27);
            expect(await pools[0].alpToken.withdrawableYieldOf(alice.address)).to.be.approximately(
                SUSHI_PER_BLOCK.mul(155).div(10),
                DELTA
            );

            await pools[0].alpToken.connect(alice).unstake(shares[0], alice.address);
            expect(await pools[0].lpToken.balanceOf(alice.address)).to.be.equal(ONE);
            expect(await tokens.sushi.balanceOf(alice.address)).to.be.approximately(SUSHI_PER_BLOCK.mul(16), DELTA);

            await mineBlocks(33);
            expect(await pools[1].alpToken.withdrawableYieldOf(alice.address)).to.be.approximately(
                SUSHI_PER_BLOCK.mul(1575).div(100),
                DELTA
            );

            await pools[1].alpToken.connect(alice).unstake(shares[1], alice.address);
            expect(await pools[1].lpToken.balanceOf(alice.address)).to.be.equal(ONE);
            expect(await tokens.sushi.balanceOf(alice.address)).to.be.approximately(SUSHI_PER_BLOCK.mul(32), DELTA);

            await mineBlocks(33);
            expect(await pools[2].alpToken.withdrawableYieldOf(alice.address)).to.be.approximately(
                SUSHI_PER_BLOCK.mul(2375).div(100),
                DELTA
            );

            await pools[2].alpToken.connect(alice).unstake(shares[2], alice.address);
            expect(await pools[2].lpToken.balanceOf(alice.address)).to.be.equal(ONE);
            expect(await tokens.sushi.balanceOf(alice.address)).to.be.approximately(SUSHI_PER_BLOCK.mul(56), DELTA);
        });
    });

    describe("#stakeWithSushi()", function () {
        it("should stake in 1 pool for 1 account", async function () {
            const { deployer, alice, tokens, sushi, vault, createAccruedLPToken, stakeWithSushi } = await setupTest();

            // add SUSHI-WETH pool
            await sushi.addPool(tokens.sushi, tokens.weth, 0);
            await sushi.addLiquidity(
                deployer,
                tokens.sushi,
                tokens.weth,
                ONE.mul(100).add(1000),
                ONE.mul(100).add(1000)
            );
            // add SUSHI-USDC pool
            await sushi.addPool(tokens.sushi, tokens.usdc, 0);
            await sushi.addLiquidity(
                deployer,
                tokens.sushi,
                tokens.usdc,
                ONE.mul(100).add(1000),
                ONE.mul(100).add(1000)
            );
            // add USDC-WETH pool
            const { pid, lpToken } = await sushi.addPool(tokens.usdc, tokens.weth, 100);
            await sushi.addLiquidity(
                deployer,
                tokens.usdc,
                tokens.weth,
                ONE.mul(100).add(1000),
                ONE.mul(100).add(1000)
            );

            const alpToken = await createAccruedLPToken(pid);
            const getAmountLP = async shares =>
                await shares.mul(await alpToken.withdrawableTotalLPs()).div(await alpToken.totalShares());

            await tokens.sushi.transfer(alice.address, ONE.add(1000));
            await tokens.sushi.connect(alice).approve(alpToken.address, constants.MaxUint256);

            await stakeWithSushi(alice, alpToken, ONE, tokens.usdc, tokens.weth);
            expect(await alpToken.sharesOf(alice.address)).to.be.equal(ONE);
            expect(await alpToken.balanceOf(alice.address)).to.be.equal(ONE);

            await mineBlocks(32);
            expect(await alpToken.withdrawableYieldOf(alice.address)).to.be.approximately(
                SUSHI_PER_BLOCK.mul(32),
                DELTA
            );
            expect(await vault.balanceOf(alpToken.address)).to.be.equal(0);

            const amountLP = await getAmountLP(ONE);
            await alpToken.connect(alice).unstake(ONE, alice.address);
            expect(await lpToken.balanceOf(alice.address)).to.be.approximately(amountLP, DELTA);
            expect(await alpToken.balanceOf(alice.address)).to.be.equal(0);
            expect(await tokens.sushi.balanceOf(alice.address)).to.be.approximately(SUSHI_PER_BLOCK.mul(33), DELTA);
            expect(await vault.balanceOf(alpToken.address)).to.be.approximately(0, DELTA);
        });

        it("should stake in 1 pool for multiple accounts", async function () {
            const { deployer, alice, bob, carol, tokens, sushi, vault, createAccruedLPToken, stakeWithSushi } =
                await setupTest();

            // add SUSHI-WETH pool
            await sushi.addPool(tokens.sushi, tokens.weth, 0);
            await sushi.addLiquidity(
                deployer,
                tokens.sushi,
                tokens.weth,
                ONE.mul(100).add(1000),
                ONE.mul(100).add(1000)
            );
            // add SUSHI-USDC pool
            await sushi.addPool(tokens.sushi, tokens.usdc, 0);
            await sushi.addLiquidity(
                deployer,
                tokens.sushi,
                tokens.usdc,
                ONE.mul(100).add(1000),
                ONE.mul(100).add(1000)
            );
            // add USDC-WETH pool
            const { pid, lpToken } = await sushi.addPool(tokens.usdc, tokens.weth, 100);
            await sushi.addLiquidity(
                deployer,
                tokens.usdc,
                tokens.weth,
                ONE.mul(100).add(1000),
                ONE.mul(100).add(1000)
            );
            const alpToken = await createAccruedLPToken(pid);
            const getAmountLP = async shares =>
                await shares.mul(await alpToken.withdrawableTotalLPs()).div(await alpToken.totalShares());

            await tokens.sushi.transfer(alice.address, ONE);
            await tokens.sushi.transfer(bob.address, ONE);
            await tokens.sushi.transfer(carol.address, ONE);

            await tokens.sushi.connect(alice).approve(alpToken.address, constants.MaxUint256);
            await tokens.sushi.connect(bob).approve(alpToken.address, constants.MaxUint256);
            await tokens.sushi.connect(carol).approve(alpToken.address, constants.MaxUint256);

            await stakeWithSushi(alice, alpToken, ONE, tokens.usdc, tokens.weth);
            expect(await alpToken.sharesOf(alice.address)).to.be.equal(ONE);

            await stakeWithSushi(bob, alpToken, ONE, tokens.usdc, tokens.weth);
            expect(await alpToken.sharesOf(bob.address)).to.be.equal(ONE);
            expect(await vault.balanceOf(alpToken.address)).to.be.approximately(SUSHI_PER_BLOCK, DELTA);
            expect(await alpToken.withdrawableYieldOf(alice.address)).to.be.approximately(SUSHI_PER_BLOCK, DELTA);

            await mineBlocks(29);
            expect(await alpToken.withdrawableYieldOf(alice.address)).to.be.approximately(
                SUSHI_PER_BLOCK.add(SUSHI_PER_BLOCK.mul(29).div(2)),
                DELTA
            );

            const amountLPA = await getAmountLP(ONE);
            await alpToken.connect(alice).unstake(ONE, alice.address);
            expect(await lpToken.balanceOf(alice.address)).to.be.approximately(amountLPA, DELTA);
            expect(await tokens.sushi.balanceOf(alice.address)).to.be.approximately(SUSHI_PER_BLOCK.mul(16), DELTA);
            expect(await alpToken.withdrawableYieldOf(bob.address)).to.be.approximately(SUSHI_PER_BLOCK.mul(15), DELTA);
            expect(await vault.balanceOf(alpToken.address)).to.be.approximately(SUSHI_PER_BLOCK.mul(15), DELTA);

            await mineBlocks(32);
            expect(await alpToken.withdrawableYieldOf(bob.address)).to.be.approximately(SUSHI_PER_BLOCK.mul(47), DELTA);

            const amountLPB = await getAmountLP(ONE);
            await alpToken.connect(bob).unstake(ONE, bob.address);
            expect(await lpToken.balanceOf(bob.address)).to.be.equal(amountLPB);
            expect(await tokens.sushi.balanceOf(bob.address)).to.be.approximately(SUSHI_PER_BLOCK.mul(48), DELTA);
            expect(await alpToken.withdrawableYieldOf(bob.address)).to.be.equal(0);
            expect(await vault.balanceOf(alpToken.address)).to.be.approximately(0, DELTA);

            await mineBlocks(31);

            await stakeWithSushi(carol, alpToken, ONE, tokens.usdc, tokens.weth);
            expect(await alpToken.sharesOf(carol.address)).to.be.equal(ONE);

            await mineBlocks(31);
            expect(await alpToken.withdrawableYieldOf(carol.address)).to.be.approximately(
                SUSHI_PER_BLOCK.mul(31),
                DELTA
            );

            const amountLPC = await getAmountLP(ONE);
            await alpToken.connect(carol).unstake(ONE, carol.address);
            expect(await lpToken.balanceOf(carol.address)).to.be.equal(amountLPC);
            expect(await tokens.sushi.balanceOf(carol.address)).to.be.approximately(SUSHI_PER_BLOCK.mul(32), DELTA);
            expect(await alpToken.withdrawableYieldOf(bob.address)).to.be.equal(0);
            expect(await vault.balanceOf(alpToken.address)).to.be.approximately(0, DELTA);
        });

        it("should stake in multiple pools for 1 account", async function () {
            const { deployer, alice, tokens, sushi, createAccruedLPToken, stakeWithSushi } = await setupTest();

            // add SUSHI-WETH pool
            await sushi.addPool(tokens.sushi, tokens.weth, 0);
            await sushi.addLiquidity(deployer, tokens.sushi, tokens.weth, ONE.add(1000), ONE.add(1000));

            const pools = [];
            for (const pool of [
                [tokens.sushi, tokens.usdc, 100],
                [tokens.usdc, tokens.weth, 50],
                [tokens.sushi, tokens.wbtc, 50],
            ]) {
                const { pid, lpToken } = await sushi.addPool(pool[0], pool[1], pool[2]);
                const token0 = UniswapV2Pair__factory.connect(await lpToken.token0(), ethers.provider);
                const token1 = UniswapV2Pair__factory.connect(await lpToken.token1(), ethers.provider);
                await sushi.addLiquidity(deployer, token0, token1, ONE.add(1000), ONE.add(1000));
                const alpToken = await createAccruedLPToken(pid);
                pools.push({
                    lpToken,
                    alpToken,
                    token0,
                    token1,
                    getAmountLP: async shares =>
                        await shares.mul(await alpToken.withdrawableTotalLPs()).div(await alpToken.totalShares()),
                });
            }

            await tokens.sushi.transfer(alice.address, ONE.mul(3));
            await tokens.weth.connect(alice).deposit({ value: ONE.mul(3) });
            await tokens.usdc.mint(alice.address, ONE.mul(3));
            await tokens.wbtc.mint(alice.address, ONE.mul(3));

            for (const pool of pools) {
                await tokens.sushi.connect(alice).approve(pool.alpToken.address, constants.MaxUint256);
                await stakeWithSushi(alice, pool.alpToken, ONE, pool.token0, pool.token1);
            }
            expect(await pools[0].alpToken.withdrawableYieldOf(alice.address)).to.be.approximately(
                SUSHI_PER_BLOCK.mul(2),
                DELTA
            );
            expect(await pools[1].alpToken.withdrawableYieldOf(alice.address)).to.be.approximately(
                SUSHI_PER_BLOCK.div(2),
                DELTA
            );
            expect(await pools[2].alpToken.withdrawableYieldOf(alice.address)).to.be.equal(0);

            await mineBlocks(27);
            expect(await pools[0].alpToken.withdrawableYieldOf(alice.address)).to.be.approximately(
                SUSHI_PER_BLOCK.mul(155).div(10),
                DELTA
            );

            const amountLP0 = await pools[0].getAmountLP(ONE);
            await pools[0].alpToken.connect(alice).unstake(ONE, alice.address);
            expect(await pools[0].lpToken.balanceOf(alice.address)).to.be.equal(amountLP0);
            expect(await tokens.sushi.balanceOf(alice.address)).to.be.approximately(SUSHI_PER_BLOCK.mul(16), DELTA);

            await mineBlocks(33);
            expect(await pools[1].alpToken.withdrawableYieldOf(alice.address)).to.be.approximately(
                SUSHI_PER_BLOCK.mul(1575).div(100),
                DELTA
            );

            const amountLP1 = await pools[1].getAmountLP(ONE);
            await pools[1].alpToken.connect(alice).unstake(ONE, alice.address);
            expect(await pools[1].lpToken.balanceOf(alice.address)).to.be.equal(amountLP1);
            expect(await tokens.sushi.balanceOf(alice.address)).to.be.approximately(SUSHI_PER_BLOCK.mul(32), DELTA);

            await mineBlocks(33);
            expect(await pools[2].alpToken.withdrawableYieldOf(alice.address)).to.be.approximately(
                SUSHI_PER_BLOCK.mul(2375).div(100),
                DELTA
            );

            const amountLP2 = await pools[2].getAmountLP(ONE);
            await pools[2].alpToken.connect(alice).unstake(ONE, alice.address);
            expect(await pools[2].lpToken.balanceOf(alice.address)).to.be.equal(amountLP2);
            expect(await tokens.sushi.balanceOf(alice.address)).to.be.approximately(SUSHI_PER_BLOCK.mul(56), DELTA);
        });
    });

    describe("#unstake()", function () {
        it("should unstake gradually", async function () {
            const { alice, tokens, sushi, createAccruedLPToken, getStakeParameters } = await setupTest();

            // add SUSHI-WETH pool
            const { pid, lpToken } = await sushi.addPool(tokens.sushi, tokens.weth, 100);
            const alpToken = await createAccruedLPToken(pid);

            await tokens.sushi.transfer(alice.address, ONE.mul(3).add(1000));
            await tokens.weth.connect(alice).deposit({ value: ONE.mul(3).add(1000) });
            await sushi.addLiquidity(alice, tokens.sushi, tokens.weth, ONE.mul(3).add(1000), ONE.mul(3).add(1000));

            await lpToken.connect(alice).approve(alpToken.address, constants.MaxUint256);
            const params = await getStakeParameters(lpToken, ONE.mul(3), alice);
            const shares = params[3];
            await alpToken.connect(alice).stake(...params);

            await mineBlocks(2);
            expect(await alpToken.withdrawableYieldOf(alice.address)).to.be.approximately(
                SUSHI_PER_BLOCK.mul(2),
                DELTA
            );

            await alpToken.connect(alice).unstake(shares.div(3), alice.address);
            expect(await lpToken.balanceOf(alice.address)).to.be.approximately(ONE.mul(1), DELTA);
            expect(await tokens.sushi.balanceOf(alice.address)).to.be.approximately(SUSHI_PER_BLOCK, DELTA);
            expect(await alpToken.withdrawableYieldOf(alice.address)).to.be.approximately(
                SUSHI_PER_BLOCK.mul(2),
                DELTA
            );
            expect(await alpToken.balanceOf(alice.address)).to.be.approximately(
                shares.mul(2).div(3).add(SUSHI_PER_BLOCK.mul(2)),
                DELTA
            );

            await mineBlocks(1);
            expect(await alpToken.withdrawableYieldOf(alice.address)).to.be.approximately(
                SUSHI_PER_BLOCK.mul(3),
                DELTA
            );

            await alpToken.connect(alice).unstake(shares.div(3), alice.address);
            expect(await lpToken.balanceOf(alice.address)).to.be.approximately(ONE.mul(2), DELTA);
            expect(await tokens.sushi.balanceOf(alice.address)).to.be.approximately(SUSHI_PER_BLOCK.mul(3), DELTA);
            expect(await alpToken.balanceOf(alice.address)).to.be.approximately(
                shares.mul(1).div(3).add(SUSHI_PER_BLOCK.mul(2)),
                DELTA
            );

            await mineBlocks(1);
            expect(await alpToken.withdrawableYieldOf(alice.address)).to.be.approximately(
                SUSHI_PER_BLOCK.mul(3),
                DELTA
            );

            await alpToken.connect(alice).unstake(shares.div(3), alice.address);
            expect(await lpToken.balanceOf(alice.address)).to.be.approximately(ONE.mul(3), DELTA);
            expect(await tokens.sushi.balanceOf(alice.address)).to.be.approximately(SUSHI_PER_BLOCK.mul(7), DELTA);
            expect(await alpToken.balanceOf(alice.address)).to.be.approximately(0, DELTA);
        });

        it("should unstake as SushiBar's balance increases for 1 account", async function () {
            const { alice, tokens, sushi, createAccruedLPToken, getStakeParameters } = await setupTest();

            // 100 xSUSHI minted (100 xSUSHI => 100 SUSHI)
            await tokens.sushi.approve(sushi.bar.address, constants.MaxUint256);
            await sushi.bar.enter(SUSHI_PER_BLOCK);
            expect(await sushi.bar.totalSupply()).to.be.equal(SUSHI_PER_BLOCK);
            expect(await tokens.sushi.balanceOf(sushi.bar.address)).to.be.equal(SUSHI_PER_BLOCK);

            // add SUSHI-WETH pool
            const { pid, lpToken } = await sushi.addPool(tokens.sushi, tokens.weth, 100);
            const alpToken = await createAccruedLPToken(pid);

            await tokens.sushi.transfer(alice.address, ONE.mul(3).add(1000));
            await tokens.weth.connect(alice).deposit({ value: ONE.mul(3).add(1000) });
            await sushi.addLiquidity(alice, tokens.sushi, tokens.weth, ONE.mul(3).add(1000), ONE.mul(3).add(1000));

            await lpToken.connect(alice).approve(alpToken.address, constants.MaxUint256);
            const params = await getStakeParameters(lpToken, ONE.mul(3), alice);
            const shares = params[3];
            await alpToken.connect(alice).stake(...params);

            // 300 SUSHI sent to SushiBar (100 xSUSHI => 400 SUSHI)
            await tokens.sushi.transfer(sushi.bar.address, SUSHI_PER_BLOCK.mul(3));
            expect(await sushi.bar.totalSupply()).to.be.equal(SUSHI_PER_BLOCK);
            expect(await tokens.sushi.balanceOf(sushi.bar.address)).to.be.equal(SUSHI_PER_BLOCK.mul(4));
            // 100 SUSHI is pending from MasterChef
            expect(await alpToken.withdrawableYieldOf(alice.address)).to.be.approximately(SUSHI_PER_BLOCK, DELTA);

            await mineBlocks(2);
            // 300 SUSHI is pending from MasterChef
            expect(await alpToken.withdrawableYieldOf(alice.address)).to.be.approximately(
                SUSHI_PER_BLOCK.mul(3),
                DELTA
            );

            // 1. deposit 400 SUSHI into SushiBar (200 xSUSHI => 800 SUSHI; 100 xSUSHI for alice)
            // 2. withdraw 50 xSUSHI (150 xSUSHI => 600 SUSHI; 50 xSUSHI for alice)
            await alpToken.connect(alice).unstake(shares.div(2), alice.address);
            expect(await sushi.bar.totalSupply()).to.be.approximately(SUSHI_PER_BLOCK.mul(3).div(2), DELTA);
            expect(await tokens.sushi.balanceOf(sushi.bar.address)).to.be.approximately(SUSHI_PER_BLOCK.mul(6), DELTA);
            expect(await tokens.sushi.balanceOf(alice.address)).to.be.approximately(SUSHI_PER_BLOCK.mul(2), DELTA);

            await mineBlocks(1);
            // 200 SUSHI is pending from MasterChef
            // 100 SUSHI is withdrawable from SushiBar
            expect(await alpToken.withdrawableYieldOf(alice.address)).to.be.approximately(
                SUSHI_PER_BLOCK.mul(3),
                DELTA
            );

            // 1. deposit 200 SUSHI into SushiBar (200 xSUSHI => 800 SUSHI; 100 xSUSHI for alice)
            // 2. withdraw 50 xSUSHI (150 xSUSHI => 600 SUSHI; 50 xSUSHI for alice)
            await alpToken.connect(alice).unstake(shares.div(4), alice.address);
            expect(await sushi.bar.totalSupply()).to.be.approximately(SUSHI_PER_BLOCK.mul(3).div(2), DELTA);
            expect(await tokens.sushi.balanceOf(sushi.bar.address)).to.be.approximately(SUSHI_PER_BLOCK.mul(6), DELTA);
            expect(await tokens.sushi.balanceOf(alice.address)).to.be.approximately(SUSHI_PER_BLOCK.mul(4), DELTA);
        });
    });
});
