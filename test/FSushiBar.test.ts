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

    await fSushi.mint(deployer.address, ONE.mul(1000));
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

        expect(await fSushiBar.previewDeposit(MAXIMUM_AMOUNT.div(2), 1)).to.be.equal(ONE.div(2));

        await fSushi.connect(bob).approve(fSushiBar.address, MAXIMUM_AMOUNT);
        await fSushiBar.connect(bob).deposit(MAXIMUM_AMOUNT.div(2), 1, bob.address);
        expect(await fSushiBar.balanceOf(alice.address)).to.be.equal(ONE);
        expect(await fSushiBar.balanceOf(bob.address)).to.be.equal(ONE.div(2));
        expect(await fSushiBar.balanceOf(carol.address)).to.be.equal(0);

        // 1 + 1/2 = 3/2
        expect(await fSushiBar.totalAssets()).to.be.equal(MAXIMUM_AMOUNT.mul(3).div(2));
        expect(await fSushiBar.totalAssetsDuring(week0)).to.be.equal(MAXIMUM_AMOUNT.mul(3).div(2));

        await fSushi.connect(carol).approve(fSushiBar.address, MAXIMUM_AMOUNT);
        await fSushiBar.connect(carol).deposit(MAXIMUM_AMOUNT.div(3), 1, carol.address);
        expect(await fSushiBar.balanceOf(alice.address)).to.be.equal(ONE);
        expect(await fSushiBar.balanceOf(bob.address)).to.be.equal(ONE.div(2));
        expect(await fSushiBar.balanceOf(carol.address)).to.be.approximately(ONE.div(3), DELTA);

        // 3/2 + 1/3 = 11/6
        expect(await fSushiBar.totalAssets()).to.be.equal(MAXIMUM_AMOUNT.mul(11).div(6));
        expect(await fSushiBar.totalAssetsDuring(week0)).to.be.equal(MAXIMUM_AMOUNT.mul(11).div(6));

        expectDeepApproximately(await fSushiBar.previewWithdraw(alice.address), [0, 0]);
        await expect(fSushiBar.connect(alice).withdraw(alice.address)).to.be.revertedWithCustomError(
            fSushiBar,
            "WithdrawalDenied"
        );

        const week1 = week0 + 1;
        await time.increase(WEEK + DAY);

        expectDeepApproximately(await fSushiBar.previewWithdraw(alice.address), [ONE, MAXIMUM_AMOUNT]);
        expectDeepApproximately(await fSushiBar.previewWithdraw(bob.address), [ONE.div(2), MAXIMUM_AMOUNT.div(2)]);
        expectDeepApproximately(await fSushiBar.previewWithdraw(carol.address), [ONE.div(3), MAXIMUM_AMOUNT.div(3)]);

        await fSushiBar.connect(alice).withdraw(alice.address);
        expect(await fSushiBar.balanceOf(alice.address)).to.be.equal(0);
        expect(await fSushiBar.balanceOf(bob.address)).to.be.equal(ONE.div(2));
        expect(await fSushiBar.balanceOf(carol.address)).to.be.approximately(ONE.div(3), DELTA);

        // 11/6 - 1 = 5/6
        expect(await fSushiBar.totalAssets()).to.be.approximately(MAXIMUM_AMOUNT.mul(5).div(6), DELTA);
        expect(await fSushiBar.totalAssetsDuring(week1)).to.be.approximately(MAXIMUM_AMOUNT.mul(5).div(6), DELTA);

        // 5/6 - 1/2 = 1/3
        await fSushiBar.connect(bob).withdraw(bob.address);
        expect(await fSushiBar.totalAssets()).to.be.approximately(MAXIMUM_AMOUNT.div(3), DELTA);
        expect(await fSushiBar.totalAssetsDuring(week1)).to.be.approximately(MAXIMUM_AMOUNT.div(3), DELTA);

        // await fSushi.connect(alice).approve(fSushiBar.address, ONE);
        // await fSushiBar.connect(alice).deposit(ONE, alice.address);
        // expect(await fSushiBar.totalAssetsDuring(week1)).to.be.equal(ONE);
        //
        // await time.increase(WEEK * 10);
        // for (let i = 0; i < 10; i++) {
        //     expect(await fSushiBar.totalAssetsDuring(week1 + i + 1)).to.be.equal(0);
        // }
        //
        // await fSushiBar.checkpoint();
        // for (let i = 0; i < 10; i++) {
        //     expect(await fSushiBar.totalAssetsDuring(week1 + i + 1)).to.be.equal(ONE);
        // }
    });

    it("should deposit/withdraw in dynamic situation", async function () {
        const deployTime = Math.floor(Date.UTC(2024, 0, 1) / 1000);
        const { alice, bob, fSushi, fSushiBar } = await setupTest(deployTime);

        const week0 = toWeekNumber(deployTime) + 1;
        expect(await fSushiBar.startWeek()).to.be.equal(week0);
        expect(await fSushiBar.lastCheckpoint()).to.be.equal(week0);

        await mineAtWeekStart(week0);

        expect(await fSushiBar.previewDeposit(ONE, MAXIMUM_WEEKS)).to.be.equal(ONE);

        await fSushi.connect(alice).approve(fSushiBar.address, ONE);
        await fSushiBar.connect(alice).deposit(ONE, MAXIMUM_WEEKS, alice.address);
        expect(await fSushiBar.balanceOf(alice.address)).to.be.equal(ONE);
        expect(await fSushiBar.totalSupply()).to.be.equal(ONE);
        expect(await fSushiBar.totalAssets()).to.be.equal(ONE);

        await fSushi.transfer(fSushiBar.address, ONE.div(2));
        await fSushiBar.checkpoint();
        // 1 + 1/2 = 3/2
        expect(await fSushiBar.totalAssets()).to.be.equal(ONE.mul(3).div(2));

        await fSushi.connect(bob).approve(fSushiBar.address, ONE.div(2));
        await fSushiBar.connect(bob).deposit(ONE.div(2), 52, bob.address);
        // (1/2 * 1/2) * 1 / (3/2) = 1/6
        expect(await fSushiBar.balanceOf(bob.address)).to.be.approximately(ONE.div(6), DELTA);
        // 1 + 1/6 = 7/6
        expect(await fSushiBar.totalSupply()).to.be.equal(ONE.mul(7).div(6));
        // 3/2 + 1/2 = 2
        expect(await fSushiBar.totalAssets()).to.be.equal(ONE.mul(2));

        await fSushi.transfer(fSushiBar.address, ONE.mul(1));
        await fSushiBar.checkpoint();
        // 2 + 1 = 3
        expect(await fSushiBar.totalAssets()).to.be.equal(ONE.mul(3));
        expectDeepApproximately(await fSushiBar.previewWithdraw(bob.address), [0, 0]);

        await time.increase(WEEK * 52 + DAY);
        expectDeepApproximately(await fSushiBar.previewWithdraw(bob.address), [ONE.mul(1).div(6), ONE.mul(8).div(11)]);

        const balanceBob = await fSushi.balanceOf(bob.address);
        await fSushiBar.connect(bob).withdraw(bob.address);
        // 1/2 + 1/2 - (1/4) * 3) / (11/4) = 1 - 3/11 = 8/11
        expect((await fSushi.balanceOf(bob.address)).sub(balanceBob)).to.be.approximately(ONE.mul(8).div(11), DELTA);
        // 7/6 - 1/6 = 1
        expect(await fSushiBar.totalSupply()).to.be.equal(ONE);
        // 3 - 8/11 = 75/33
        expect(await fSushiBar.totalAssets()).to.be.approximately(ONE.mul(75).div(33), DELTA);

        await time.increase(WEEK * 52);

        const balanceAlice = await fSushi.balanceOf(alice.address);
        await fSushiBar.connect(alice).withdraw(alice.address);
        // 1 + 1 - (1 * 75/33) / (5/2) = 2 - 10/11 = 12/11
        expect((await fSushi.balanceOf(alice.address)).sub(balanceAlice)).to.be.approximately(
            ONE.mul(12).div(11),
            DELTA
        );
        expect(await fSushiBar.totalSupply()).to.be.equal(0);
        // 75/33 - 12/11 = 13/11
        expect(await fSushiBar.totalAssets()).to.be.approximately(ONE.mul(13).div(11), DELTA);
    });
});
