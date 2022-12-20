import { ethers } from "hardhat";
import { expect } from "chai";
import { AccruedLPTokenFactory, AccruedLPToken, SushiBarVault } from "../typechain-types";
import setupTokens from "./utils/setupTokens";
import setupSushiswap from "./utils/setupSushiswap";

const setupTest = async () => {
    const tokens = await setupTokens();
    const sushi = await setupSushiswap(tokens);

    const Vault = await ethers.getContractFactory("SushiBarVault");
    const vault = (await Vault.deploy(tokens.sushi.address, sushi.bar.address)) as SushiBarVault;

    const Factory = await ethers.getContractFactory("AccruedLPTokenFactory");
    const factory = (await Factory.deploy(
        sushi.router.address,
        sushi.chef.address,
        vault.address
    )) as AccruedLPTokenFactory;

    return {
        tokens,
        sushi,
        factory,
    };
};

describe("AccruedLPTokenFactory", function () {
    it("should create AccruedLPToken", async function () {
        const { tokens, sushi, factory } = await setupTest();

        const pid = 0;
        await sushi.factory.createPair(tokens.sushi.address, tokens.weth.address);
        const lpToken = await sushi.factory.getPair(tokens.sushi.address, tokens.weth.address);
        await sushi.chef.add(100, lpToken, false);

        const tokenAddress = await factory.predictAccruedLPTokenAddress(pid);
        await expect(factory.createAccruedLPToken(pid))
            .to.emit(factory, "CreateAccruedLPToken")
            .withArgs(pid, tokenAddress);

        expect(await factory.getAccruedLPToken(pid)).to.hexEqual(tokenAddress);
        await expect(factory.createAccruedLPToken(pid)).to.revertedWithCustomError(factory, "TokenCreated");

        const AccruedLPToken = await ethers.getContractFactory("AccruedLPToken");
        const token = AccruedLPToken.attach(tokenAddress) as AccruedLPToken;

        expect(await token.factory()).to.be.equal(factory.address);
        expect(await token.pid()).to.be.equal(pid);
        expect(await token.lpToken()).to.be.equal(lpToken);
    });
});
