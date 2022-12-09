import { ethers } from "hardhat";
import { constants } from "ethers";
import { expect } from "chai";
import { StakedLPTokenFactory, StakedLPToken, StakedLPToken__factory, SushiBarStrategy } from "../typechain-types";
import setupSushiswap, { SUSHI_PER_BLOCK } from "./utils/setupSushiswap";
import mineBlocks from "./utils/mineBlocks";
import setupTokens from "./utils/setupTokens";

const ONE = ethers.constants.WeiPerEther;

const setupTest = async () => {
    const tokens = await setupTokens();
    const sushi = await setupSushiswap(tokens);
    const [deployer, alice, bob, carol] = await ethers.getSigners();

    const Strategy = await ethers.getContractFactory("SushiBarStrategy");
    const strategy = (await Strategy.deploy(tokens.sushi.address, sushi.bar.address)) as SushiBarStrategy;

    const Factory = await ethers.getContractFactory("StakedLPTokenFactory");
    const factory = (await Factory.deploy(sushi.chef.address, strategy.address)) as StakedLPTokenFactory;

    const createStakedLPToken = async pid => {
        await factory.createStakedLPToken(pid);
        return StakedLPToken__factory.connect(
            await factory.predictStakedLPTokenAddress(pid),
            ethers.provider
        ) as StakedLPToken;
    };

    return {
        deployer,
        alice,
        bob,
        carol,
        tokens,
        sushi,
        strategy,
        factory,
        createStakedLPToken,
    };
};

describe("StakedLPToken", function () {
    it("should stake in 1 pool for 1 account", async function () {
        const { alice, tokens, sushi, strategy, createStakedLPToken } = await setupTest();

        // add SUSHI-WETH pool
        const { pid, lpToken } = await sushi.addPool(tokens.sushi, tokens.weth, 100);
        const slpToken = await createStakedLPToken(pid);

        await tokens.sushi.transfer(alice.address, ONE.add(1000));
        await tokens.weth.connect(alice).deposit({ value: ONE.add(1000) });
        await sushi.addLiquidity(alice, tokens.sushi, tokens.weth, ONE.add(1000), ONE.add(1000));
        expect(await lpToken.balanceOf(alice.address)).to.be.equal(ONE);
        expect(await slpToken.balanceOf(alice.address)).to.be.equal(0);

        await lpToken.connect(alice).approve(slpToken.address, constants.MaxUint256);
        await slpToken.connect(alice).stake(ONE, alice.address);
        expect(await lpToken.balanceOf(alice.address)).to.be.equal(0);
        expect(await slpToken.balanceOf(alice.address)).to.be.equal(ONE);
        expect(await strategy.balanceOf(slpToken.address)).to.be.equal(0);

        await mineBlocks(32);
        expect(await slpToken.claimableSushiOf(alice.address)).to.be.equal(ONE.mul(SUSHI_PER_BLOCK).mul(32));
        expect(await strategy.balanceOf(slpToken.address)).to.be.equal(0);

        await slpToken.connect(alice).unstake(ONE, constants.MaxUint256, alice.address);
        expect(await lpToken.balanceOf(alice.address)).to.be.equal(ONE);
        expect(await slpToken.balanceOf(alice.address)).to.be.equal(0);
        expect(await tokens.sushi.balanceOf(alice.address)).to.be.equal(ONE.mul(SUSHI_PER_BLOCK).mul(33));
        expect(await strategy.balanceOf(slpToken.address)).to.be.equal(0);
    });

    it("should stake in 1 pool for multiple accounts", async function () {
        const { alice, bob, carol, tokens, sushi, strategy, createStakedLPToken } = await setupTest();

        // add SUSHI-WETH pool
        const { pid, lpToken } = await sushi.addPool(tokens.sushi, tokens.weth, 100);
        const slpToken = await createStakedLPToken(pid);

        await tokens.sushi.transfer(alice.address, ONE.add(1000));
        await tokens.weth.connect(alice).deposit({ value: ONE.add(1000) });
        await sushi.addLiquidity(alice, tokens.sushi, tokens.weth, ONE.add(1000), ONE.add(1000));

        await tokens.sushi.transfer(bob.address, ONE);
        await tokens.weth.connect(bob).deposit({ value: ONE });
        await sushi.addLiquidity(bob, tokens.sushi, tokens.weth, ONE, ONE);

        await tokens.sushi.transfer(carol.address, ONE);
        await tokens.weth.connect(carol).deposit({ value: ONE });
        await sushi.addLiquidity(carol, tokens.sushi, tokens.weth, ONE, ONE);

        await lpToken.connect(alice).approve(slpToken.address, constants.MaxUint256);
        await lpToken.connect(bob).approve(slpToken.address, constants.MaxUint256);
        await lpToken.connect(carol).approve(slpToken.address, constants.MaxUint256);

        await slpToken.connect(alice).stake(ONE, alice.address);
        await slpToken.connect(bob).stake(ONE, bob.address);
        expect(await slpToken.claimableSushiOf(alice.address)).to.be.equal(ONE.mul(SUSHI_PER_BLOCK));
        expect(await strategy.balanceOf(slpToken.address)).to.be.equal(ONE.mul(SUSHI_PER_BLOCK));

        await mineBlocks(29);
        await slpToken.connect(alice).unstake(ONE, constants.MaxUint256, alice.address);
        expect(await tokens.sushi.balanceOf(alice.address)).to.be.equal(ONE.mul(SUSHI_PER_BLOCK).mul(16));
        expect(await slpToken.claimableSushiOf(bob.address)).to.be.equal(ONE.mul(SUSHI_PER_BLOCK).mul(15));
        expect(await strategy.balanceOf(slpToken.address)).to.be.equal(ONE.mul(SUSHI_PER_BLOCK).mul(15));

        await mineBlocks(32);
        await slpToken.connect(bob).unstake(ONE, constants.MaxUint256, bob.address);
        expect(await tokens.sushi.balanceOf(bob.address)).to.be.equal(ONE.mul(SUSHI_PER_BLOCK).mul(48));

        await mineBlocks(31);
        await slpToken.connect(carol).stake(ONE, carol.address);
        await mineBlocks(31);
        await slpToken.connect(carol).unstake(ONE, constants.MaxUint256, carol.address);
        expect(await tokens.sushi.balanceOf(carol.address)).to.be.equal(ONE.mul(SUSHI_PER_BLOCK).mul(32));
    });

    it("should stake in multiple pools for 1 account", async function () {
        const { alice, tokens, sushi, createStakedLPToken } = await setupTest();

        const pools = [];
        for (const pool of [
            [tokens.sushi, tokens.weth, 100],
            [tokens.usdc, tokens.weth, 50],
            [tokens.usdc, tokens.wbtc, 50],
        ]) {
            const { pid, lpToken } = await sushi.addPool(pool[0], pool[1], pool[2]);
            pools.push({
                lpToken,
                slpToken: await createStakedLPToken(pid),
            });
        }

        await tokens.sushi.transfer(alice.address, ONE.add(1000));
        await tokens.weth.connect(alice).deposit({ value: ONE.add(1000).mul(2) });
        await tokens.usdc.mint(alice.address, ONE.add(1000).mul(2));
        await tokens.wbtc.mint(alice.address, ONE.add(1000));
        await sushi.addLiquidity(alice, tokens.sushi, tokens.weth, ONE.add(1000), ONE.add(1000));
        await sushi.addLiquidity(alice, tokens.usdc, tokens.weth, ONE.add(1000), ONE.add(1000));
        await sushi.addLiquidity(alice, tokens.usdc, tokens.wbtc, ONE.add(1000), ONE.add(1000));

        for (const pool of pools) {
            await pool.lpToken.connect(alice).approve(pool.slpToken.address, constants.MaxUint256);
            await pool.slpToken.connect(alice).stake(ONE, alice.address);
        }

        await mineBlocks(27);
        expect(await pools[0].slpToken.claimableSushiOf(alice.address)).to.be.equal(
            ONE.mul(SUSHI_PER_BLOCK).mul(155).div(10)
        );

        await pools[0].slpToken.connect(alice).unstake(ONE, constants.MaxUint256, alice.address);
        expect(await tokens.sushi.balanceOf(alice.address)).to.be.equal(ONE.mul(SUSHI_PER_BLOCK).mul(16));

        await mineBlocks(33);
        expect(await pools[1].slpToken.claimableSushiOf(alice.address)).to.be.equal(
            ONE.mul(SUSHI_PER_BLOCK).mul(1575).div(100)
        );

        await pools[1].slpToken.connect(alice).unstake(ONE, constants.MaxUint256, alice.address);
        expect(await tokens.sushi.balanceOf(alice.address)).to.be.equal(ONE.mul(SUSHI_PER_BLOCK).mul(32));

        await mineBlocks(33);
        expect(await pools[2].slpToken.claimableSushiOf(alice.address)).to.be.equal(
            ONE.mul(SUSHI_PER_BLOCK).mul(2375).div(100)
        );

        await pools[2].slpToken.connect(alice).unstake(ONE, constants.MaxUint256, alice.address);
        expect(await tokens.sushi.balanceOf(alice.address)).to.be.equal(ONE.mul(SUSHI_PER_BLOCK).mul(56));
    });

    it("should claim rewards", async function () {
        const { alice, tokens, sushi, createStakedLPToken } = await setupTest();

        // add SUSHI-WETH pool
        const { pid, lpToken } = await sushi.addPool(tokens.sushi, tokens.weth, 100);
        const slpToken = await createStakedLPToken(pid);

        await tokens.sushi.transfer(alice.address, ONE.add(1000));
        await tokens.weth.connect(alice).deposit({ value: ONE.add(1000) });
        await sushi.addLiquidity(alice, tokens.sushi, tokens.weth, ONE.add(1000), ONE.add(1000));

        await lpToken.connect(alice).approve(slpToken.address, constants.MaxUint256);
        await slpToken.connect(alice).stake(ONE, alice.address);

        await mineBlocks(32);
        expect(await tokens.sushi.balanceOf(alice.address)).to.be.equal(0);
        expect(await slpToken.claimableSushiOf(alice.address)).to.be.equal(ONE.mul(3200));

        await slpToken.connect(alice)["claimSushi(address)"](alice.address);
        expect(await tokens.sushi.balanceOf(alice.address)).to.be.equal(ONE.mul(3300));
    });

    it("should claim rewards as SushiBar's balance increases for 1 account", async function () {
        const { alice, tokens, sushi, createStakedLPToken } = await setupTest();

        // 1 xSUSHI minted
        await tokens.sushi.approve(sushi.bar.address, constants.MaxUint256);
        await sushi.bar.enter(ONE);
        expect(await sushi.bar.totalSupply()).to.be.equal(ONE);
        expect(await tokens.sushi.balanceOf(sushi.bar.address)).to.be.equal(ONE);

        // add SUSHI-WETH pool
        const { pid, lpToken } = await sushi.addPool(tokens.sushi, tokens.weth, 100);
        const slpToken = await createStakedLPToken(pid);

        await tokens.sushi.transfer(alice.address, ONE.add(1000));
        await tokens.weth.connect(alice).deposit({ value: ONE.add(1000) });
        await sushi.addLiquidity(alice, tokens.sushi, tokens.weth, ONE.add(1000), ONE.add(1000));

        await lpToken.connect(alice).approve(slpToken.address, constants.MaxUint256);
        await slpToken.connect(alice).stake(ONE, alice.address);

        // send 1 SUSHI to SushiBar
        await tokens.sushi.transfer(sushi.bar.address, ONE);
        expect(await sushi.bar.totalSupply()).to.be.equal(ONE);
        expect(await tokens.sushi.balanceOf(sushi.bar.address)).to.be.equal(ONE.mul(2));

        // 3200 SUSHI will be staked into SushiBar (1 xSUSHI minted)
        await mineBlocks(31);

        expect(await slpToken.claimableTotalSushi()).to.be.equal(ONE.mul(3200));
        expect(await slpToken.claimableSushiOf(alice.address)).to.be.equal(ONE.mul(3200));

        await slpToken.connect(alice)["claimSushi(address)"](alice.address);
        expect(await tokens.sushi.balanceOf(alice.address)).to.be.equal(ONE.mul(3300));
    });

    it("should claim rewards as SushiBar's balance increases for multiple accounts", async function () {
        const { alice, bob, tokens, sushi, createStakedLPToken } = await setupTest();

        // 100 xSUSHI minted
        await tokens.sushi.approve(sushi.bar.address, constants.MaxUint256);
        await sushi.bar.enter(ONE.mul(100));
        expect(await sushi.bar.totalSupply()).to.be.equal(ONE.mul(100));
        expect(await tokens.sushi.balanceOf(sushi.bar.address)).to.be.equal(ONE.mul(100));

        // add SUSHI-WETH pool
        const { pid, lpToken } = await sushi.addPool(tokens.sushi, tokens.weth, 100);
        const slpToken = await createStakedLPToken(pid);

        await tokens.sushi.transfer(alice.address, ONE.add(1000));
        await tokens.weth.connect(alice).deposit({ value: ONE.add(1000) });
        await sushi.addLiquidity(alice, tokens.sushi, tokens.weth, ONE.add(1000), ONE.add(1000));

        await tokens.sushi.transfer(bob.address, ONE);
        await tokens.weth.connect(bob).deposit({ value: ONE });
        await sushi.addLiquidity(bob, tokens.sushi, tokens.weth, ONE, ONE);

        await lpToken.connect(alice).approve(slpToken.address, constants.MaxUint256);
        await lpToken.connect(bob).approve(slpToken.address, constants.MaxUint256);

        await slpToken.connect(alice).stake(ONE, alice.address);

        // 100 SUSHI staked into SushiBar
        await mineBlocks(1);
        await slpToken.connect(bob).stake(ONE, bob.address);

        // send 200 SUSHI to SushiBar
        await tokens.sushi.transfer(sushi.bar.address, ONE.mul(200));
        expect(await sushi.bar.totalSupply()).to.be.equal(ONE.mul(300));
        expect(await tokens.sushi.balanceOf(sushi.bar.address)).to.be.equal(ONE.mul(500));

        // 500 SUSHI will be staked into SushiBar
        await mineBlocks(5);

        expect(await slpToken.claimableSushiOf(alice.address)).to.be.equal(ONE.mul(1900).div(3));
        expect(await slpToken.claimableSushiOf(bob.address)).to.be.equal(ONE.mul(300));

        await slpToken.connect(alice)["claimSushi(address)"](alice.address);
        expect(await tokens.sushi.balanceOf(alice.address)).to.be.equal(ONE.mul(2050).div(3));

        await mineBlocks(3);
        await slpToken.connect(bob)["claimSushi(address)"](bob.address);
        expect(await tokens.sushi.balanceOf(bob.address)).to.be.equal(ONE.mul(550).sub(1));
        expect(await sushi.bar.totalSupply()).to.be.equal(ONE.mul(220));
    });
});
