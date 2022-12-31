import { ethers, network } from "hardhat";
import { expect } from "chai";
import { FSushi, FSushiBar } from "../typechain-types";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { mineAtWeekStart, toWeekNumber, WEEK } from "./utils/date-utils";

const ONE = ethers.constants.WeiPerEther;

const setupTest = async deployTimestamp => {
    const [deployer, alice, bob, carol] = await ethers.getSigners();

    const FS = await ethers.getContractFactory("FSushi");
    const fSushi = (await FS.deploy()) as FSushi;
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

    it("should deposit/withdraw and checkpoint", async function () {
        const deployTime = Math.floor(Date.UTC(2023, 0, 1) / 1000);
        const { alice, bob, carol, fSushi, fSushiBar } = await setupTest(deployTime);

        const week0 = toWeekNumber(deployTime) + 1;
        expect(await fSushiBar.startWeek()).to.be.equal(week0);
        expect(await fSushiBar.lastCheckpoint()).to.be.equal(week0);

        await expect(fSushiBar.connect(alice).deposit(ONE, alice.address)).to.be.revertedWithCustomError(
            fSushiBar,
            "TooEarly"
        );
        expect(await fSushiBar.lockedTotalBalanceDuring(week0)).to.be.equal(0);

        await mineAtWeekStart(week0);

        await fSushi.connect(alice).approve(fSushiBar.address, ONE);
        await fSushiBar.connect(alice).deposit(ONE, alice.address);
        expect(await fSushiBar.lockedTotalBalanceDuring(week0)).to.be.equal(ONE);
        expect(await fSushiBar.lockedUserBalanceDuring(alice.address, week0)).to.be.equal(ONE);
        expect(await fSushiBar.lockedUserBalanceDuring(bob.address, week0)).to.be.equal(0);
        expect(await fSushiBar.lockedUserBalanceDuring(carol.address, week0)).to.be.equal(0);

        await fSushi.connect(bob).approve(fSushiBar.address, ONE);
        await fSushiBar.connect(bob).deposit(ONE, bob.address);
        expect(await fSushiBar.lockedTotalBalanceDuring(week0)).to.be.equal(ONE.mul(2));
        expect(await fSushiBar.lockedUserBalanceDuring(alice.address, week0)).to.be.equal(ONE);
        expect(await fSushiBar.lockedUserBalanceDuring(bob.address, week0)).to.be.equal(ONE);
        expect(await fSushiBar.lockedUserBalanceDuring(carol.address, week0)).to.be.equal(0);

        await fSushi.connect(carol).approve(fSushiBar.address, ONE);
        await fSushiBar.connect(carol).deposit(ONE, carol.address);
        expect(await fSushiBar.lockedTotalBalanceDuring(week0)).to.be.equal(ONE.mul(3));
        expect(await fSushiBar.lockedUserBalanceDuring(alice.address, week0)).to.be.equal(ONE);
        expect(await fSushiBar.lockedUserBalanceDuring(bob.address, week0)).to.be.equal(ONE);
        expect(await fSushiBar.lockedUserBalanceDuring(carol.address, week0)).to.be.equal(ONE);

        await expect(
            fSushiBar.connect(alice).withdraw(ONE, alice.address, alice.address)
        ).to.be.revertedWithCustomError(fSushiBar, "TooEarly");

        const week1 = week0 + 1;
        await time.increase(WEEK);

        await fSushiBar.connect(alice).withdraw(ONE, alice.address, alice.address);
        expect(await fSushiBar.lockedTotalBalanceDuring(week1)).to.be.equal(ONE.mul(2));
        expect(await fSushiBar.lockedUserBalanceDuring(alice.address, week1)).to.be.equal(0);
        expect(await fSushiBar.lockedUserBalanceDuring(bob.address, week1)).to.be.equal(0);
        expect(await fSushiBar.lockedUserBalanceDuring(carol.address, week1)).to.be.equal(0);

        await fSushiBar.userCheckpoint(bob.address);
        expect(await fSushiBar.lockedUserBalanceDuring(bob.address, week1)).to.be.equal(ONE);

        await fSushiBar.userCheckpoint(carol.address);
        expect(await fSushiBar.lockedUserBalanceDuring(carol.address, week1)).to.be.equal(ONE);

        await fSushiBar.connect(bob).withdraw(ONE, bob.address, bob.address);
        expect(await fSushiBar.lockedTotalBalanceDuring(week1)).to.be.equal(ONE);
        expect(await fSushiBar.lockedUserBalanceDuring(alice.address, week1)).to.be.equal(0);
        expect(await fSushiBar.lockedUserBalanceDuring(bob.address, week1)).to.be.equal(0);
        expect(await fSushiBar.lockedUserBalanceDuring(carol.address, week1)).to.be.equal(ONE);

        await fSushiBar.connect(carol).withdraw(ONE, carol.address, carol.address);
        expect(await fSushiBar.lockedTotalBalanceDuring(week1)).to.be.equal(0);
        expect(await fSushiBar.lockedUserBalanceDuring(alice.address, week1)).to.be.equal(0);
        expect(await fSushiBar.lockedUserBalanceDuring(bob.address, week1)).to.be.equal(0);
        expect(await fSushiBar.lockedUserBalanceDuring(carol.address, week1)).to.be.equal(0);

        await fSushi.connect(alice).approve(fSushiBar.address, ONE);
        await fSushiBar.connect(alice).deposit(ONE, alice.address);
        expect(await fSushiBar.lockedTotalBalanceDuring(week1)).to.be.equal(ONE);
        expect(await fSushiBar.lockedUserBalanceDuring(alice.address, week1)).to.be.equal(ONE);
        expect(await fSushiBar.lockedUserBalanceDuring(bob.address, week1)).to.be.equal(0);
        expect(await fSushiBar.lockedUserBalanceDuring(carol.address, week1)).to.be.equal(0);

        await time.increase(WEEK * 10);
        for (let i = 0; i < 10; i++) {
            expect(await fSushiBar.lockedTotalBalanceDuring(week1 + i + 1)).to.be.equal(0);
            expect(await fSushiBar.lockedUserBalanceDuring(alice.address, week1 + i + 1)).to.be.equal(0);
            expect(await fSushiBar.lockedUserBalanceDuring(bob.address, week1 + i + 1)).to.be.equal(0);
            expect(await fSushiBar.lockedUserBalanceDuring(carol.address, week1 + i + 1)).to.be.equal(0);
        }

        await fSushiBar.checkpoint();
        for (let i = 0; i < 10; i++) {
            expect(await fSushiBar.lockedTotalBalanceDuring(week1 + i + 1)).to.be.equal(ONE);
            expect(await fSushiBar.lockedUserBalanceDuring(alice.address, week1 + i + 1)).to.be.equal(0);
            expect(await fSushiBar.lockedUserBalanceDuring(bob.address, week1 + i + 1)).to.be.equal(0);
            expect(await fSushiBar.lockedUserBalanceDuring(carol.address, week1 + i + 1)).to.be.equal(0);
        }

        await fSushiBar.userCheckpoint(alice.address);
        for (let i = 0; i < 10; i++) {
            expect(await fSushiBar.lockedTotalBalanceDuring(week1 + i + 1)).to.be.equal(ONE);
            expect(await fSushiBar.lockedUserBalanceDuring(alice.address, week1 + i + 1)).to.be.equal(ONE);
        }
    });
});
