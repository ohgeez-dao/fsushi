import { ethers } from "hardhat";
import { constants } from "ethers";
import { StakedLPTokenFactory } from "../typechain-types";
import setupSushiswap from "./setupSushiswap";
import { expect } from "chai";

const setupTest = async () => {
    const sushi = await setupSushiswap();

    const Factory = await ethers.getContractFactory("StakedLPTokenFactory");
    const factory = (await Factory.deploy(constants.HashZero, sushi.chef.address)) as StakedLPTokenFactory;

    return {
        sushi,
        factory,
    };
};

describe("StakedLPTokenFactory", function () {
    it("should create StakedLPToken", async function () {
        const { sushi, factory } = await setupTest();

        await sushi.factory.createPair(sushi.sushi.address, sushi.weth.address);
        const lpToken = await sushi.factory.getPair(sushi.sushi.address, sushi.weth.address);
        await sushi.chef.add(100, lpToken, false);

        await factory.createStakedLPToken(0);
        expect(await factory.tokens(0)).to.hexEqual("0xbd667153e57d3ec132ff7bff6dc492de526b3d07");
    });
});
