import { ethers, network } from "hardhat";
import { expect } from "chai";
import { FSushi, FSushiAirdropsVotingEscrow, VotingEscrowMock } from "../typechain-types";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import setupTokens from "./utils/setupTokens";
import { BigNumber } from "ethers";
import { toTimestamp, toWeekNumber } from "./utils/date-utils";

const DAY = 24 * 3600;
const WEEK = DAY * 7;
const INTERVAL = 3 * DAY;
const MAX_DURATION = 728 * DAY;
const ONE = ethers.constants.WeiPerEther;
const INITIAL_SUPPLY_PER_WEEK = BigNumber.from(10).pow(18).mul(5000);

const setupTest = async deployTimestamp => {
    const { sushi } = await setupTokens();
    const [deployer, alice, bob, carol] = await ethers.getSigners();

    await time.setNextBlockTimestamp(deployTimestamp);

    const VE = await ethers.getContractFactory("VotingEscrowMock");
    const ve = (await VE.deploy(sushi.address, "VotingEscrow", "VE", INTERVAL, MAX_DURATION)) as VotingEscrowMock;

    const FS = await ethers.getContractFactory("FSushi");
    const fSushi = (await FS.deploy()) as FSushi;

    return {
        sushi,
        deployer,
        alice,
        bob,
        carol,
        ve,
        fSushi,
    };
};

describe("FSushiAirdropsVotingEscrow", function () {
    beforeEach(async () => {
        await network.provider.request({
            method: "hardhat_reset",
            params: [],
        });
    });

    it("should claim", async function () {
        const deployTime = Math.floor(Date.UTC(2024, 1, 5) / 1000);
        const { sushi, alice, bob, ve, fSushi } = await setupTest(deployTime);

        await sushi.mint(alice.address, ONE.mul(100));
        await sushi.connect(alice).approve(ve.address, ONE.mul(100));

        await sushi.mint(bob.address, ONE.mul(100));
        await sushi.connect(bob).approve(ve.address, ONE.mul(100));

        await ve.connect(alice).createLock(ONE.mul(100), MAX_DURATION - DAY);
        await ve.connect(bob).createLock(ONE.mul(100), MAX_DURATION - DAY);

        await time.increase(WEEK * 16);

        const FSA = await ethers.getContractFactory("FSushiAirdropsVotingEscrow");
        const airdrops = (await FSA.deploy(ve.address, fSushi.address)) as FSushiAirdropsVotingEscrow;
        await fSushi.setMinter(airdrops.address, true);

        const balanceAlice = await fSushi.balanceOf(alice.address);
        await airdrops.connect(alice).claim(alice.address);
        const amountAlice = (await fSushi.balanceOf(alice.address)).sub(balanceAlice);
        expect(amountAlice).to.be.equal(INITIAL_SUPPLY_PER_WEEK.div(2));

        const balanceBob = await fSushi.balanceOf(bob.address);
        await airdrops.connect(bob).claim(bob.address);
        const amountBob = (await fSushi.balanceOf(bob.address)).sub(balanceBob);
        expect(amountBob).to.be.equal(INITIAL_SUPPLY_PER_WEEK.div(2));

        const startWeek = await airdrops.startWeek();
        for (let i = 0; i < 30; i++) {
            const now = await time.latest();
            const week = toWeekNumber(now);
            const weekStart = toTimestamp(toWeekNumber(now));

            const balanceAlice = await fSushi.balanceOf(alice.address);
            const balanceBob = await fSushi.balanceOf(bob.address);
            await airdrops.connect(alice).claim(alice.address);
            await airdrops.connect(bob).claim(bob.address);

            const amountAlice = (await fSushi.balanceOf(alice.address)).sub(balanceAlice);
            const amountBob = (await fSushi.balanceOf(bob.address)).sub(balanceBob);
            if (Math.abs(now - weekStart) < DAY) {
                // first day of a week
                const supply = INITIAL_SUPPLY_PER_WEEK.shr(week - startWeek.toNumber());
                expect(amountAlice).to.be.equal(supply.div(2));
                expect(amountBob).to.be.equal(supply.div(2));
            } else {
                // other days
                expect(amountAlice).to.be.equal(0);
            }

            await time.increase(DAY);
        }
    });
});
