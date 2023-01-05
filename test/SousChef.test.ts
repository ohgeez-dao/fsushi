import { ethers, network } from "hardhat";
import { expect } from "chai";
import { FeeVault, FSushi, FSushiBar, FSushiBill, FSushiKitchen, SousChef } from "../typechain-types";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { mineAtWeekStart, toWeekNumber } from "./utils/date-utils";
import setupSushiswap from "./utils/setupSushiswap";
import setupTokens from "./utils/setupTokens";
import setupFlashStake from "./utils/setupFlashStake";
import setupPeripherals from "./utils/setupPeripherals";
import { BigNumber, utils } from "ethers";

const REWARDS_PER_WEEK = BigNumber.from(10).pow(18).mul(30000);
const REWARDS_FOR_INITIAL_WEEKS = REWARDS_PER_WEEK.mul(10);

const onePercentDecreased = (bn, repeat = 1) => {
    let result = bn;
    for (let i = 0; i < repeat; i++) {
        result = result.mul(99).div(100);
    }
    return result;
};

const setupTest = async deployTimestamp => {
    const tokens = await setupTokens();
    const sushi = await setupSushiswap(tokens);
    const flash = await setupFlashStake();

    const Vault = await ethers.getContractFactory("FeeVault");
    const feeVault = (await Vault.deploy()) as FeeVault;

    await time.setNextBlockTimestamp(deployTimestamp);

    const { sbVault, factory, createFlashStrategySushiSwap } = await setupPeripherals(tokens, sushi, flash, feeVault);
    const [deployer, alice, bob, carol] = await ethers.getSigners();

    const Kitchen = await ethers.getContractFactory("FSushiKitchen");
    const kitchen = (await Kitchen.deploy(factory.address)) as FSushiKitchen;

    const FS = await ethers.getContractFactory("FSushi");
    const fSushi = (await FS.deploy()) as FSushi;
    await fSushi.setMinter(deployer.address, true);

    const FSB = await ethers.getContractFactory("FSushiBar");
    const fSushiBar = (await FSB.deploy(fSushi.address)) as FSushiBar;

    const SC = await ethers.getContractFactory("SousChef");
    const chef = (await SC.deploy(fSushi.address, fSushiBar.address, kitchen.address, factory.address)) as SousChef;

    return {
        tokens,
        sushi,
        deployer,
        alice,
        bob,
        carol,
        sbVault,
        factory,
        kitchen,
        fSushi,
        fSushiBar,
        chef,
        createFlashStrategySushiSwap,
    };
};

describe("SousChef", function () {
    beforeEach(async () => {
        await network.provider.request({
            method: "hardhat_reset",
            params: [],
        });
    });

    it("should create FSushiBill", async function () {
        const deployTime = Math.floor(Date.UTC(2024, 0, 1) / 1000);
        const { tokens, sushi, chef } = await setupTest(deployTime);

        const week0 = toWeekNumber(deployTime);
        expect(await chef.startWeek()).to.be.equal(week0);
        expect(await chef.lastCheckpoint()).to.be.equal(week0 + 1);

        const pid = 0;
        await sushi.factory.createPair(tokens.sushi.address, tokens.weth.address);
        const lpToken = await sushi.factory.getPair(tokens.sushi.address, tokens.weth.address);
        await sushi.chef.add(100, lpToken, false);

        await expect(chef.createBill(pid + 1)).to.be.revertedWithoutReason();

        const address = await chef.predictBillAddress(pid);
        await expect(chef.createBill(pid)).to.emit(chef, "CreateBill").withArgs(pid, address);

        expect(await chef.getBill(pid)).to.hexEqual(address);
        await expect(chef.createBill(pid)).to.revertedWithCustomError(chef, "BillCreated");

        const FSB = await ethers.getContractFactory("FSushiBill");
        const bill = FSB.attach(address) as FSushiBill;

        expect(await bill.sousChef()).to.be.equal(chef.address);
        expect(await bill.pid()).to.be.equal(pid);
    });

    it("should checkpoint weeklyRewards", async function () {
        const deployTime = Math.floor(Date.UTC(2024, 0, 1) / 1000);
        const { alice, tokens, sushi, fSushi, fSushiBar, chef } = await setupTest(deployTime);

        const week0 = toWeekNumber(deployTime);

        const pid = 0;
        await sushi.factory.createPair(tokens.sushi.address, tokens.weth.address);
        const lpToken = await sushi.factory.getPair(tokens.sushi.address, tokens.weth.address);
        await sushi.chef.add(100, lpToken, false);
        await chef.createBill(pid);

        // week 0
        expect(await chef.weeklyRewards(week0)).to.be.equal(REWARDS_FOR_INITIAL_WEEKS);
        console.log("week0\t\t" + utils.formatEther(REWARDS_FOR_INITIAL_WEEKS));

        await fSushi.mint(alice.address, REWARDS_FOR_INITIAL_WEEKS);
        expect(await fSushi.totalSupply()).to.be.equal(REWARDS_FOR_INITIAL_WEEKS);

        const locked = REWARDS_FOR_INITIAL_WEEKS.div(100);
        await fSushi.connect(alice).approve(fSushiBar.address, locked);
        await fSushiBar.connect(alice).deposit(locked, 1, alice.address);
        console.log("  locked\t" + utils.formatEther(locked));

        // week 1
        await mineAtWeekStart(week0 + 1);
        expect(await chef.weeklyRewards(week0 + 1)).to.be.equal(0);

        await chef.checkpoint();
        expect(await chef.lastCheckpoint()).to.be.equal(week0 + 2);
        expect(await chef.weeklyRewards(week0 + 1)).to.be.equal(REWARDS_FOR_INITIAL_WEEKS);
        console.log("week1\t\t" + utils.formatEther(await chef.weeklyRewards(week0 + 1)));

        await fSushi.mint(alice.address, REWARDS_FOR_INITIAL_WEEKS);
        let total = REWARDS_FOR_INITIAL_WEEKS.mul(2);
        expect(await fSushi.totalSupply()).to.be.equal(total);

        // week 2
        await mineAtWeekStart(week0 + 2);
        expect(await chef.weeklyRewards(week0 + 2)).to.be.equal(0);

        await chef.checkpoint();
        expect(await chef.lastCheckpoint()).to.be.equal(week0 + 3);
        expect(await chef.weeklyRewards(week0 + 2)).to.be.equal(REWARDS_PER_WEEK);
        console.log("week2\t\t" + utils.formatEther(await chef.weeklyRewards(week0 + 2)));

        await fSushi.mint(alice.address, REWARDS_PER_WEEK);
        total = total.add(REWARDS_PER_WEEK);
        expect(await fSushi.totalSupply()).to.be.equal(total);

        const rewards = async week => {
            await fSushi.checkpoint();
            const totalSupply = await fSushi.totalSupplyDuring(week - 1);
            await fSushiBar.checkpoint();
            const lockedAssets = await fSushiBar.totalAssetsDuring(week - 1);

            let rewards = totalSupply.isZero()
                ? BigNumber.from(0)
                : REWARDS_PER_WEEK.mul(totalSupply.sub(lockedAssets)).div(totalSupply);
            if (week - week0 > 2) {
                rewards = onePercentDecreased(rewards);
            }
            return rewards;
        };

        for (let i = 3; i < 100; i++) {
            const locked = REWARDS_FOR_INITIAL_WEEKS.div(10)
                .mul(Math.floor(Math.random() * 100))
                .div(100);
            await fSushi.connect(alice).approve(fSushiBar.address, locked);
            await fSushiBar.connect(alice).deposit(locked, 1, alice.address);
            console.log("  locked\t" + utils.formatEther(locked));

            await mineAtWeekStart(week0 + i);
            expect(await chef.weeklyRewards(week0 + i)).to.be.equal(0);

            await chef.checkpoint();
            expect(await chef.lastCheckpoint()).to.be.equal(week0 + i + 1);

            const weekly = await rewards(week0 + i);
            expect(await chef.weeklyRewards(week0 + i)).to.be.equal(weekly);
            console.log("week" + i + "\t\t" + utils.formatEther(await chef.weeklyRewards(week0 + i)));

            await fSushi.mint(alice.address, weekly);
            total = total.add(weekly);
            expect(await fSushi.totalSupply()).to.be.equal(total);
        }
    });
});
