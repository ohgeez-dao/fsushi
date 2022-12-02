import { ethers } from "hardhat";
import { constants } from "ethers";
import { expect } from "chai";
import { StakedLPTokenFactory, StakedLPToken, StakedLPToken__factory } from "../typechain-types";
import setupSushiswap, { SUSHI_PER_BLOCK } from "./utils/setupSushiswap";
import mineBlocks from "./utils/mineBlocks";
import setupTokens from "./utils/setupTokens";

const ONE = ethers.constants.WeiPerEther;

const setupTest = async () => {
    const tokens = await setupTokens();
    const sushi = await setupSushiswap(tokens);
    const [deployer, alice, bob, carol] = await ethers.getSigners();

    const Factory = await ethers.getContractFactory("StakedLPTokenFactory");
    const factory = (await Factory.deploy(sushi.chef.address)) as StakedLPTokenFactory;

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
        factory,
        createStakedLPToken,
    };
};

describe("StakedLPToken", function () {
    it("should stake in 1 pool for 1 account", async function () {
        const { alice, tokens, sushi, createStakedLPToken } = await setupTest();

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

        await mineBlocks(32);
        expect(await slpToken.claimableRewardsOf(alice.address)).to.be.equal(ONE.mul(SUSHI_PER_BLOCK).mul(32));

        await slpToken.connect(alice).unstake(ONE, alice.address);
        expect(await lpToken.balanceOf(alice.address)).to.be.equal(ONE);
        expect(await slpToken.balanceOf(alice.address)).to.be.equal(0);
        expect(await tokens.sushi.balanceOf(alice.address)).to.be.equal(ONE.mul(SUSHI_PER_BLOCK).mul(33));
    });

    it("should stake in 1 pool for multiple accounts", async function () {
        const { alice, bob, carol, tokens, sushi, createStakedLPToken } = await setupTest();

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

        await mineBlocks(29);
        await slpToken.connect(alice).unstake(ONE, alice.address);
        expect(await tokens.sushi.balanceOf(alice.address)).to.be.equal(ONE.mul(SUSHI_PER_BLOCK).mul(16));

        await mineBlocks(32);
        await slpToken.connect(bob).unstake(ONE, bob.address);
        expect(await tokens.sushi.balanceOf(bob.address)).to.be.equal(ONE.mul(SUSHI_PER_BLOCK).mul(48));

        await mineBlocks(31);
        await slpToken.connect(carol).stake(ONE, carol.address);
        await mineBlocks(31);
        await slpToken.connect(carol).unstake(ONE, carol.address);
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
        await pools[0].slpToken.connect(alice).unstake(ONE, alice.address);
        expect(await tokens.sushi.balanceOf(alice.address)).to.be.equal(ONE.mul(SUSHI_PER_BLOCK).mul(16));

        await mineBlocks(33);
        await pools[1].slpToken.connect(alice).unstake(ONE, alice.address);
        expect(await tokens.sushi.balanceOf(alice.address)).to.be.equal(ONE.mul(SUSHI_PER_BLOCK).mul(32));

        await mineBlocks(33);
        await pools[2].slpToken.connect(alice).unstake(ONE, alice.address);
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
        expect(await tokens.sushi.balanceOf(slpToken.address)).to.be.equal(0);
        expect(await tokens.sushi.balanceOf(alice.address)).to.be.equal(0);
        expect(await slpToken.claimableRewardsOf(alice.address)).to.be.equal(ONE.mul(SUSHI_PER_BLOCK).mul(32));

        await slpToken.connect(alice).claimRewards(alice.address);
        expect(await lpToken.balanceOf(alice.address)).to.be.equal(0);
        expect(await slpToken.balanceOf(alice.address)).to.be.equal(ONE);
        expect(await tokens.sushi.balanceOf(slpToken.address)).to.be.equal(0);
        expect(await tokens.sushi.balanceOf(alice.address)).to.be.equal(ONE.mul(SUSHI_PER_BLOCK).mul(33));
    });
});
