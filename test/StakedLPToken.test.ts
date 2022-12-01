import { ethers } from "hardhat";
import { constants } from "ethers";
import { expect } from "chai";
import { StakedLPTokenFactory, StakedLPToken, StakedLPToken__factory } from "../typechain-types";
import setupSushiswap, { SUSHI_PER_BLOCK } from "./utils/setupSushiswap";
import mineBlocks from "./utils/mineBlocks";

const ONE = ethers.constants.WeiPerEther;

const setupTest = async () => {
    const sushi = await setupSushiswap();
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
        sushi,
        factory,
        createStakedLPToken,
    };
};

describe("StakedLPToken", function () {
    it("should stake in 1 pool for 1 account", async function () {
        const { alice, sushi, createStakedLPToken } = await setupTest();

        // add SUSHI-WETH pool
        const { pid, lpToken } = await sushi.addPool(sushi.sushi, sushi.weth, 100);
        const slpToken = await createStakedLPToken(pid);

        await sushi.sushi.transfer(alice.address, ONE.add(1000));
        await sushi.weth.connect(alice).deposit({ value: ONE.add(1000) });
        await sushi.addLiquidity(alice, sushi.sushi, sushi.weth, ONE.add(1000), ONE.add(1000));
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
        expect(await sushi.sushi.balanceOf(alice.address)).to.be.equal(ONE.mul(SUSHI_PER_BLOCK).mul(33));
    });

    it("should stake in 1 pool for multiple accounts", async function () {
        const { alice, bob, carol, sushi, createStakedLPToken } = await setupTest();

        // add SUSHI-WETH pool
        const { pid, lpToken } = await sushi.addPool(sushi.sushi, sushi.weth, 100);
        const slpToken = await createStakedLPToken(pid);

        await sushi.sushi.transfer(alice.address, ONE.add(1000));
        await sushi.weth.connect(alice).deposit({ value: ONE.add(1000) });
        await sushi.addLiquidity(alice, sushi.sushi, sushi.weth, ONE.add(1000), ONE.add(1000));

        await sushi.sushi.transfer(bob.address, ONE);
        await sushi.weth.connect(bob).deposit({ value: ONE });
        await sushi.addLiquidity(bob, sushi.sushi, sushi.weth, ONE, ONE);

        await sushi.sushi.transfer(carol.address, ONE);
        await sushi.weth.connect(carol).deposit({ value: ONE });
        await sushi.addLiquidity(carol, sushi.sushi, sushi.weth, ONE, ONE);

        await lpToken.connect(alice).approve(slpToken.address, constants.MaxUint256);
        await lpToken.connect(bob).approve(slpToken.address, constants.MaxUint256);

        await slpToken.connect(alice).stake(ONE, alice.address);
        await mineBlocks(31);
        await slpToken.connect(bob).stake(ONE, bob.address);

        await mineBlocks(30);
        await slpToken.connect(alice).unstake(ONE, alice.address);
        await slpToken.connect(bob).unstake(ONE, bob.address);

        expect(await sushi.sushi.balanceOf(alice.address)).to.be.equal(ONE.mul(SUSHI_PER_BLOCK).mul(475).div(10));
        expect(await sushi.sushi.balanceOf(bob.address)).to.be.equal(ONE.mul(SUSHI_PER_BLOCK).mul(165).div(10));
    });
});
