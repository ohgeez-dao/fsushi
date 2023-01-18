import { ethers, network } from "hardhat";
import { expect } from "chai";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { FeeVault, FSushiKitchen } from "../typechain-types";
import setupTokens from "./utils/setupTokens";
import setupSushiswap from "./utils/setupSushiswap";
import setupFlashStake from "./utils/setupFlashStake";
import setupPeripherals from "./utils/setupPeripherals";

const ONE = ethers.constants.WeiPerEther;

const setupTest = async () => {
    const tokens = await setupTokens();
    const sushi = await setupSushiswap(tokens);
    const flash = await setupFlashStake();

    const Vault = await ethers.getContractFactory("FeeVault");
    const feeVault = (await Vault.deploy()) as FeeVault;

    const { factory, createFlashStrategySushiSwap } = await setupPeripherals(tokens, sushi, flash, feeVault);
    const [deployer, alice, bob, carol] = await ethers.getSigners();

    const FSK = await ethers.getContractFactory("FSushiKitchen");
    const fSushiKitchen = (await FSK.deploy(factory.address)) as FSushiKitchen;

    return {
        tokens,
        sushi,
        flash,
        deployer,
        alice,
        bob,
        carol,
        fSushiKitchen,
        createFlashStrategySushiSwap,
    };
};

describe("FSushiKitchen", function () {
    beforeEach(async () => {
        await network.provider.request({
            method: "hardhat_reset",
            params: [],
        });
    });

    it("should addPool", async function () {
        const { tokens, fSushiKitchen, createFlashStrategySushiSwap } = await setupTest();

        const { pid } = await createFlashStrategySushiSwap(tokens.sushi, tokens.weth, 100);

        await fSushiKitchen.addPool(pid);
        await fSushiKitchen.updateWeight(pid, ONE.mul(3));
        expect(await fSushiKitchen.totalWeightPoints()).to.be.equal(ONE.mul(3));
        expect(await fSushiKitchen.weightPoints(pid)).to.be.equal(ONE.mul(3));
        expect(await fSushiKitchen.relativeWeight(pid)).to.be.equal(ONE);

        expect(await fSushiKitchen.totalWeightPointsLength()).to.be.equal(2);
        expect(await fSushiKitchen.weightPointsLength(pid)).to.be.equal(2);

        const now = await time.latest();
        expect(await fSushiKitchen.totalWeightPointsAt(now)).to.be.equal(ONE.mul(3));
        expect(await fSushiKitchen.weightPointsAt(pid, now)).to.be.equal(ONE.mul(3));
        expect(await fSushiKitchen.relativeWeightAt(pid, now)).to.be.equal(ONE);
    });

    it("should addPool multiple", async function () {
        const { tokens, fSushiKitchen, createFlashStrategySushiSwap } = await setupTest();

        const { pid: pid0 } = await createFlashStrategySushiSwap(tokens.sushi, tokens.weth, 100);
        const { pid: pid1 } = await createFlashStrategySushiSwap(tokens.usdc, tokens.weth, 100);

        await fSushiKitchen.addPool(pid0);
        await fSushiKitchen.updateWeight(pid0, ONE.mul(3));
        await fSushiKitchen.addPool(pid1);
        await fSushiKitchen.updateWeight(pid1, ONE.mul(1));

        expect(await fSushiKitchen.totalWeightPoints()).to.be.equal(ONE.mul(4));
        expect(await fSushiKitchen.weightPoints(pid0)).to.be.equal(ONE.mul(3));
        expect(await fSushiKitchen.weightPoints(pid1)).to.be.equal(ONE.mul(1));
        expect(await fSushiKitchen.relativeWeight(pid0)).to.be.equal(ONE.mul(3).div(4));
        expect(await fSushiKitchen.relativeWeight(pid1)).to.be.equal(ONE.div(4));

        expect(await fSushiKitchen.totalWeightPointsLength()).to.be.equal(4);
        expect(await fSushiKitchen.weightPointsLength(pid0)).to.be.equal(2);
        expect(await fSushiKitchen.weightPointsLength(pid1)).to.be.equal(2);

        await fSushiKitchen.updateWeight(pid1, ONE.mul(2));
        expect(await fSushiKitchen.weightPoints(pid1)).to.be.equal(ONE.mul(2));
        expect(await fSushiKitchen.relativeWeight(pid0)).to.be.equal(ONE.mul(3).div(5));
        expect(await fSushiKitchen.relativeWeight(pid1)).to.be.equal(ONE.mul(2).div(5));
    });
});
