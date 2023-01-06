import { ethers, network } from "hardhat";
import { assert, expect } from "chai";
import {
    FeeVault,
    FSushi,
    FSushiBar,
    FSushiBill,
    FSushiKitchen,
    SousChef,
    UniswapV2Pair__factory,
} from "../typechain-types";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { DAY, toTimestamp, toWeekNumber, WEEK } from "./utils/date-utils";
import addressEquals from "./utils/addressEquals";
import setupSushiswap from "./utils/setupSushiswap";
import setupTokens from "./utils/setupTokens";
import setupFlashStake from "./utils/setupFlashStake";
import setupPeripherals from "./utils/setupPeripherals";
import { constants } from "ethers";
import now from "./utils/now";

const ONE = ethers.constants.WeiPerEther;
const YEAR = 365 * 24 * 3600;

const setupTest = async deployTimestamp => {
    const tokens = await setupTokens();
    const sushi = await setupSushiswap(tokens);
    const flash = await setupFlashStake();

    const Vault = await ethers.getContractFactory("FeeVault");
    const feeVault = (await Vault.deploy()) as FeeVault;

    await time.setNextBlockTimestamp(deployTimestamp);

    const { sbVault, factory, createFlashStrategySushiSwap } = await setupPeripherals(tokens, sushi, flash, feeVault);
    const [deployer, alice, bob, carol] = await ethers.getSigners();

    const FS = await ethers.getContractFactory("FSushi");
    const fSushi = (await FS.deploy()) as FSushi;
    await fSushi.setMinter(deployer.address, true);

    const FSB = await ethers.getContractFactory("FSushiBar");
    const fSushiBar = (await FSB.deploy(fSushi.address)) as FSushiBar;

    const FSK = await ethers.getContractFactory("FSushiKitchen");
    const fSushiKitchen = (await FSK.deploy(factory.address)) as FSushiKitchen;

    const SC = await ethers.getContractFactory("SousChef");
    const chef = (await SC.deploy(
        fSushi.address,
        fSushiBar.address,
        fSushiKitchen.address,
        factory.address
    )) as SousChef;
    await fSushi.setMinter(chef.address, true);

    const createBill = async (token0, token1, allocPoint, weight) => {
        const { pid, lpToken, strategy, flpToken, fToken } = await createFlashStrategySushiSwap(
            token0,
            token1,
            allocPoint
        );
        const { wait } = await chef.createBill(pid);
        const receipt = await wait();
        // eslint-disable-next-line no-unsafe-optional-chaining
        const { bill: address } = receipt.events?.find(e => e.event == "CreateBill")?.args;
        const FSB = await ethers.getContractFactory("FSushiBill");
        const bill = FSB.attach(address) as FSushiBill;

        await fSushiKitchen.addPool(pid, weight);

        return { pid, lpToken, strategy, flpToken, fToken, bill };
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

    const mintFLP = async (account, flpToken, amountToken) => {
        const lpToken = UniswapV2Pair__factory.connect(await flpToken.lpToken(), ethers.provider);

        if ((await lpToken.totalSupply()).isZero()) {
            amountToken = amountToken.add(1000);
        }
        await tokens.sushi.transfer(account.address, amountToken);
        await tokens.weth.connect(account).deposit({ value: amountToken });
        await sushi.addLiquidity(account, tokens.sushi, tokens.weth, amountToken, amountToken);

        const amountLP = await lpToken.balanceOf(account.address);
        await lpToken.connect(account).approve(flpToken.address, constants.MaxUint256);
        const params = await getStakeParameters(lpToken, amountLP, account);
        await flpToken.connect(account).deposit(...params);
        return params[3];
    };

    return {
        tokens,
        sushi,
        flash,
        deployer,
        alice,
        bob,
        carol,
        sbVault,
        factory,
        fSushi,
        fSushiBar,
        fSushiKitchen,
        chef,
        createFlashStrategySushiSwap,
        createBill,
        mintFLP,
    };
};

describe("FSushiBill", function () {
    beforeEach(async () => {
        await network.provider.request({
            method: "hardhat_reset",
            params: [],
        });
    });

    it("should deposit and claimRewards for 1 account", async function () {
        const deployTime = Math.floor(Date.UTC(2024, 0, 1) / 1000);
        const { tokens, flash, alice, fSushi, chef, createBill, mintFLP } = await setupTest(deployTime);

        const week0 = toWeekNumber(deployTime);
        expect(await chef.startWeek()).to.be.equal(week0);
        expect(await chef.lastCheckpoint()).to.be.equal(week0 + 1);

        const { strategy, flpToken, fToken, bill } = await createBill(tokens.sushi, tokens.weth, 100, ONE);
        const amountFLP = await mintFLP(alice, flpToken, ONE);

        await flpToken.connect(alice).approve(flash.protocol.address, constants.MaxUint256);
        await flash.protocol.connect(alice).stake(strategy.address, amountFLP, YEAR, alice.address, false);

        const amount = await fToken.balanceOf(alice.address);

        await fToken.connect(alice).approve(bill.address, constants.MaxUint256);
        await bill.connect(alice).deposit(amount, alice.address);

        const claimRewards = async () => {
            const { wait } = await bill.connect(alice).claimRewards(alice.address);
            const { events } = await wait();
            return events.find(e => e.event == "ClaimRewards");
        };

        expect(await bill.userLastCheckpoint(alice.address)).to.be.equal(await time.latest());
        expect(await claimRewards()).to.be.undefined;

        await time.increase(WEEK);

        let event = await claimRewards();
        let rewards = await chef.weeklyRewards(week0);
        expect(event && event.args.amount).to.be.equal(rewards);
        expect(await fSushi.balanceOf(alice.address)).to.be.equal(rewards);

        await time.increase(DAY);
        expect(await claimRewards()).to.be.undefined;

        await time.increase(DAY * 6);
        event = await claimRewards();
        const weekly = await chef.weeklyRewards(week0 + 1);
        rewards = rewards.add(weekly);
        expect(event && event.args.amount).to.be.equal(weekly);
        expect(await fSushi.balanceOf(alice.address)).to.be.equal(rewards);
    });

    it("should deposit and claimRewards for multiple accounts", async function () {
        const deployTime = Math.floor(Date.UTC(2024, 0, 1) / 1000);
        const { tokens, flash, alice, bob, carol, chef, createBill, mintFLP } = await setupTest(deployTime);

        const week0 = toWeekNumber(deployTime);
        expect(await chef.startWeek()).to.be.equal(week0);
        expect(await chef.lastCheckpoint()).to.be.equal(week0 + 1);

        const { strategy, flpToken, fToken, bill } = await createBill(tokens.sushi, tokens.weth, 100, ONE);
        for (const account of [alice, bob, carol]) {
            await flpToken.connect(account).approve(flash.protocol.address, constants.MaxUint256);
            await fToken.connect(account).approve(bill.address, constants.MaxUint256);

            const amountFLP = await mintFLP(account, flpToken, ONE);
            await flash.protocol.connect(account).stake(strategy.address, amountFLP, YEAR, account.address, false);
        }

        const timestampAlice = await time.latest();
        await bill.connect(alice).deposit(await fToken.balanceOf(alice.address), alice.address);
        const timestampBob = await time.latest();
        await bill.connect(bob).deposit(await fToken.balanceOf(bob.address), bob.address);
        const timestampCarol = await time.latest();
        await bill.connect(carol).deposit(await fToken.balanceOf(carol.address), carol.address);

        const balanceAlice = await bill.balanceOf(alice.address);
        const balanceBob = await bill.balanceOf(bob.address);
        const balanceCarol = await bill.balanceOf(carol.address);

        const claimRewards = async account => {
            const { wait } = await bill.connect(account).claimRewards(account.address);
            const { events } = await wait();
            const event = events.find(e => e.event == "ClaimRewards");
            return event && event.args.amount;
        };

        expect(await claimRewards(alice)).to.be.undefined;
        expect(await claimRewards(bob)).to.be.undefined;
        expect(await claimRewards(carol)).to.be.undefined;

        await time.increase(WEEK);
        await bill.checkpoint();
        const claimedAlice = await claimRewards(alice);
        const claimedBob = await claimRewards(bob);
        const claimedCarol = await claimRewards(carol);

        const weekEnd = toTimestamp(week0 + 1) - 1;
        const pointsAlice = await bill.userPoints(alice.address, week0);
        const pointsBob = await bill.userPoints(bob.address, week0);
        const pointsCarol = await bill.userPoints(carol.address, week0);
        const pointsTotal = pointsAlice.add(pointsBob).add(pointsCarol);
        expect(pointsAlice).to.be.equal(balanceAlice.mul(weekEnd - timestampAlice));
        expect(pointsBob).to.be.equal(balanceBob.mul(weekEnd - timestampBob));
        expect(pointsCarol).to.be.equal(balanceCarol.mul(weekEnd - timestampCarol));
        expect(await bill.points(week0)).to.be.equal(pointsTotal);

        const weekly = await chef.weeklyRewards(week0);
        expect(claimedAlice).to.be.equal(weekly.mul(pointsAlice).div(pointsTotal));
        expect(claimedBob).to.be.equal(weekly.mul(pointsBob).div(pointsTotal));
        expect(claimedCarol).to.be.equal(weekly.mul(pointsCarol).div(pointsTotal));
    });
});
