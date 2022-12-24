import { ethers } from "hardhat";
import { expect } from "chai";
import { FSushi } from "../typechain-types";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { mineAtWeekStart, toWeekNumber } from "./utils/date-utils";

const ONE = ethers.constants.WeiPerEther;

const setupTest = async deployTimestamp => {
    const [deployer, alice, bob, carol] = await ethers.getSigners();

    await time.setNextBlockTimestamp(deployTimestamp);

    const FS = await ethers.getContractFactory("FSushi");
    const fSushi = (await FS.deploy()) as FSushi;

    return {
        deployer,
        alice,
        bob,
        carol,
        fSushi,
    };
};

describe("FSushi", function () {
    it("should mint and checkpoint", async function () {
        const deployTime = Date.UTC(2023, 0, 1);
        const { alice, bob, carol, fSushi } = await setupTest(deployTime);

        const startWeek = toWeekNumber(deployTime) + 1;
        expect(await fSushi.startWeek()).to.be.equal(startWeek);
        expect(await fSushi.lastCheckpoint()).to.be.equal(startWeek);

        expect(await fSushi.maximumTotalSupplyDuring(startWeek)).to.be.equal(0);

        await mineAtWeekStart(startWeek);

        await fSushi.mint(alice.address, ONE);
        expect(await fSushi.maximumTotalSupplyDuring(startWeek)).to.be.equal(ONE);

        await fSushi.mint(bob.address, ONE);
        expect(await fSushi.maximumTotalSupplyDuring(startWeek)).to.be.equal(ONE.mul(2));

        await fSushi.mint(carol.address, ONE);
        expect(await fSushi.maximumTotalSupplyDuring(startWeek)).to.be.equal(ONE.mul(3));

        await fSushi.checkpoint();
        for (let i = 0; i < 10; i++) {
            expect(await fSushi.maximumTotalSupplyDuring(startWeek + i + 1)).to.be.equal(0);
        }

        await mineAtWeekStart(startWeek + 10);

        await fSushi.checkpoint();
        for (let i = 0; i < 10; i++) {
            expect(await fSushi.maximumTotalSupplyDuring(startWeek + i + 1)).to.be.equal(ONE.mul(3));
        }
    });
});
