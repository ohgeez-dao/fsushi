import { ethers, network } from "hardhat";
import { expect } from "chai";
import { FSushi, FSushiBar } from "../typechain-types";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { DAY, mineAtWeekStart, toWeekNumber, WEEK } from "./utils/date-utils";

const ONE = ethers.constants.WeiPerEther;
const MAXIMUM_WEEKS = 104;
const MAXIMUM_AMOUNT = ONE.mul(MAXIMUM_WEEKS);
const DELTA = ethers.BigNumber.from(10).pow(8);

const expectDeepApproximately = (a, b) => {
    expect(a.length).to.be.equal(b.length);
    for (let i = 0; i < a.length; i++) {
        expect(a[i]).to.be.approximately(b[i], DELTA);
    }
};

const setupTest = async deployTimestamp => {
    const [deployer, alice, bob, carol] = await ethers.getSigners();

    const FS = await ethers.getContractFactory("FSushi");
    const fSushi = (await FS.deploy()) as FSushi;
    await fSushi.setMinter(deployer.address, true);

    await fSushi.mint(alice.address, ONE.mul(1000));
    await fSushi.mint(bob.address, ONE.mul(1000));
    await fSushi.mint(carol.address, ONE.mul(1000));

    await time.setNextBlockTimestamp(deployTimestamp);

    const FSB = await ethers.getContractFactory("FSushiBar");
    const fSushiBar = (await FSB.deploy(fSushi.address)) as FSushiBar;

    return {
        deployer,
        alice,
        bob,
        carol,
        fSushi,
        fSushiBar,
    };
};

describe("FSushiBar", function () {
    beforeEach(async () => {
        await network.provider.request({
            method: "hardhat_reset",
            params: [],
        });
    });

    it("should deposit/withdraw for 1 week", async function () {
        const deployTime = Math.floor(Date.UTC(2024, 0, 1) / 1000);
        const { alice, bob, carol, fSushi, fSushiBar } = await setupTest(deployTime);

        const week0 = toWeekNumber(deployTime) + 1;
        expect(await fSushiBar.startWeek()).to.be.equal(week0);
        expect(await fSushiBar.lastCheckpoint()).to.be.equal(week0);

        await mineAtWeekStart(week0);

        expect(await fSushiBar.previewDeposit(MAXIMUM_AMOUNT, 1)).to.be.equal(ONE);

        await fSushi.connect(alice).approve(fSushiBar.address, MAXIMUM_AMOUNT);
        await fSushiBar.connect(alice).deposit(MAXIMUM_AMOUNT, 1, alice.address);
        expect(await fSushiBar.balanceOf(alice.address)).to.be.equal(ONE);
        expect(await fSushiBar.balanceOf(bob.address)).to.be.equal(0);
        expect(await fSushiBar.balanceOf(carol.address)).to.be.equal(0);

        expect(await fSushiBar.totalAssets()).to.be.equal(MAXIMUM_AMOUNT);
        expect(await fSushiBar.totalAssetsDuring(week0)).to.be.equal(MAXIMUM_AMOUNT);
        expect(await fSushiBar.userAssetsDuring(alice.address, week0)).to.be.equal(MAXIMUM_AMOUNT);
        expect(await fSushiBar.userAssetsDuring(bob.address, week0)).to.be.equal(0);
        expect(await fSushiBar.userAssetsDuring(carol.address, week0)).to.be.equal(0);

        expect(await fSushiBar.previewDeposit(MAXIMUM_AMOUNT.div(2), 1)).to.be.equal(ONE.div(2));

        await fSushi.connect(bob).approve(fSushiBar.address, MAXIMUM_AMOUNT);
        await fSushiBar.connect(bob).deposit(MAXIMUM_AMOUNT.div(2), 1, bob.address);
        expect(await fSushiBar.balanceOf(alice.address)).to.be.equal(ONE);
        expect(await fSushiBar.balanceOf(bob.address)).to.be.equal(ONE.div(2));
        expect(await fSushiBar.balanceOf(carol.address)).to.be.equal(0);

        // 1 + 1/2 = 2/3
        expect(await fSushiBar.totalAssets()).to.be.equal(MAXIMUM_AMOUNT.mul(3).div(2));
        expect(await fSushiBar.totalAssetsDuring(week0)).to.be.equal(MAXIMUM_AMOUNT.mul(3).div(2));
        expect(await fSushiBar.userAssetsDuring(alice.address, week0)).to.be.equal(MAXIMUM_AMOUNT);
        expect(await fSushiBar.userAssetsDuring(bob.address, week0)).to.be.equal(MAXIMUM_AMOUNT.div(2));
        expect(await fSushiBar.userAssetsDuring(carol.address, week0)).to.be.equal(0);

        await fSushi.connect(carol).approve(fSushiBar.address, MAXIMUM_AMOUNT);
        await fSushiBar.connect(carol).deposit(MAXIMUM_AMOUNT.div(3), 1, carol.address);
        expect(await fSushiBar.balanceOf(alice.address)).to.be.equal(ONE);
        expect(await fSushiBar.balanceOf(bob.address)).to.be.equal(ONE.div(2));
        expect(await fSushiBar.balanceOf(carol.address)).to.be.approximately(ONE.div(3), DELTA);

        // 3/2 + 1/3 = 9/6 + 2/6 = 11/6
        expect(await fSushiBar.totalAssets()).to.be.equal(MAXIMUM_AMOUNT.mul(11).div(6));
        expect(await fSushiBar.totalAssetsDuring(week0)).to.be.equal(MAXIMUM_AMOUNT.mul(11).div(6));
        expect(await fSushiBar.userAssetsDuring(alice.address, week0)).to.be.equal(MAXIMUM_AMOUNT);
        expect(await fSushiBar.userAssetsDuring(bob.address, week0)).to.be.equal(MAXIMUM_AMOUNT.div(2));
        expect(await fSushiBar.userAssetsDuring(carol.address, week0)).to.be.equal(MAXIMUM_AMOUNT.div(3));

        expectDeepApproximately(await fSushiBar.maxWithdraw(alice.address), [0, 0]);
        await expect(
            fSushiBar.connect(alice).withdraw(await time.latest(), alice.address)
        ).to.be.revertedWithCustomError(fSushiBar, "NotExpired");

        const week1 = week0 + 1;
        await time.increase(WEEK + DAY);

        expectDeepApproximately(await fSushiBar.maxWithdraw(alice.address), [ONE, MAXIMUM_AMOUNT]);
        expectDeepApproximately(await fSushiBar.maxWithdraw(bob.address), [ONE.div(2), MAXIMUM_AMOUNT.div(2)]);
        expectDeepApproximately(await fSushiBar.maxWithdraw(carol.address), [ONE.div(3), MAXIMUM_AMOUNT.div(3)]);

        await fSushiBar.connect(alice).withdraw(await time.latest(), alice.address);
        expect(await fSushiBar.balanceOf(alice.address)).to.be.equal(0);
        expect(await fSushiBar.balanceOf(bob.address)).to.be.equal(ONE.div(2));
        expect(await fSushiBar.balanceOf(carol.address)).to.be.approximately(ONE.div(3), DELTA);

        // 11/6 - 1 = 5/6
        expect(await fSushiBar.totalAssets()).to.be.approximately(MAXIMUM_AMOUNT.mul(5).div(6), DELTA);
        expect(await fSushiBar.totalAssetsDuring(week1)).to.be.approximately(MAXIMUM_AMOUNT.mul(5).div(6), DELTA);
        expect(await fSushiBar.userAssets(alice.address)).to.be.approximately(0, DELTA);
        expect(await fSushiBar.userAssetsDuring(alice.address, week1)).to.be.approximately(0, DELTA);
        expect(await fSushiBar.userAssetsDuring(bob.address, week1)).to.be.equal(0);
        expect(await fSushiBar.userAssetsDuring(carol.address, week1)).to.be.equal(0);

        await fSushiBar.userCheckpoint(bob.address);
        expect(await fSushiBar.userAssetsDuring(bob.address, week1)).to.be.equal(MAXIMUM_AMOUNT.div(2));

        await fSushiBar.userCheckpoint(carol.address);
        expect(await fSushiBar.userAssetsDuring(carol.address, week1)).to.be.approximately(
            MAXIMUM_AMOUNT.div(3),
            DELTA
        );

        // 5/6 - 1/2 = 1/3
        await fSushiBar.connect(bob).withdraw(await time.latest(), bob.address);
        expect(await fSushiBar.totalAssets()).to.be.approximately(MAXIMUM_AMOUNT.div(3), DELTA);
        expect(await fSushiBar.totalAssetsDuring(week1)).to.be.approximately(MAXIMUM_AMOUNT.div(3), DELTA);
        expect(await fSushiBar.userAssetsDuring(alice.address, week1)).to.be.approximately(0, DELTA);
        expect(await fSushiBar.userAssets(bob.address)).to.be.approximately(0, DELTA);
        expect(await fSushiBar.userAssetsDuring(bob.address, week1)).to.be.approximately(0, DELTA);

        // await fSushi.connect(alice).approve(fSushiBar.address, ONE);
        // await fSushiBar.connect(alice).deposit(ONE, alice.address);
        // expect(await fSushiBar.totalAssetsDuring(week1)).to.be.equal(ONE);
        // expect(await fSushiBar.userAssetsDuring(alice.address, week1)).to.be.equal(ONE);
        // expect(await fSushiBar.userAssetsDuring(bob.address, week1)).to.be.equal(0);
        // expect(await fSushiBar.userAssetsDuring(carol.address, week1)).to.be.equal(0);
        //
        // await time.increase(WEEK * 10);
        // for (let i = 0; i < 10; i++) {
        //     expect(await fSushiBar.totalAssetsDuring(week1 + i + 1)).to.be.equal(0);
        //     expect(await fSushiBar.userAssetsDuring(alice.address, week1 + i + 1)).to.be.equal(0);
        //     expect(await fSushiBar.userAssetsDuring(bob.address, week1 + i + 1)).to.be.equal(0);
        //     expect(await fSushiBar.userAssetsDuring(carol.address, week1 + i + 1)).to.be.equal(0);
        // }
        //
        // await fSushiBar.checkpoint();
        // for (let i = 0; i < 10; i++) {
        //     expect(await fSushiBar.totalAssetsDuring(week1 + i + 1)).to.be.equal(ONE);
        //     expect(await fSushiBar.userAssetsDuring(alice.address, week1 + i + 1)).to.be.equal(0);
        //     expect(await fSushiBar.userAssetsDuring(bob.address, week1 + i + 1)).to.be.equal(0);
        //     expect(await fSushiBar.userAssetsDuring(carol.address, week1 + i + 1)).to.be.equal(0);
        // }
        //
        // await fSushiBar.userCheckpoint(alice.address);
        // for (let i = 0; i < 10; i++) {
        //     expect(await fSushiBar.totalAssetsDuring(week1 + i + 1)).to.be.equal(ONE);
        //     expect(await fSushiBar.userAssetsDuring(alice.address, week1 + i + 1)).to.be.equal(ONE);
    });
});
