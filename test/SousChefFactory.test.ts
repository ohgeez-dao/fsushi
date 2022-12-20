import { ethers } from "hardhat";
import { constants } from "ethers";
import { expect } from "chai";
import {
    StakedLPTokenFactory,
    StakedLPToken__factory,
    FlashFTokenFactory,
    FlashProtocol,
    FlashNFT,
    FlashFToken__factory,
    SushiBarVault,
    SousChefFactory,
    SousChef__factory,
    FeeVault,
} from "../typechain-types";
import setupSushiswap from "./utils/setupSushiswap";
import setupTokens from "./utils/setupTokens";

const setupTest = async (stakeFeeBPS, flashStakeFeeBPS, feeRecipient) => {
    const tokens = await setupTokens();
    const sushi = await setupSushiswap(tokens);
    const [deployer, alice, bob, carol] = await ethers.getSigners();

    const SLPVault = await ethers.getContractFactory("SushiBarVault");
    const slpVault = (await SLPVault.deploy(tokens.sushi.address, sushi.bar.address)) as SushiBarVault;

    const SLPFactory = await ethers.getContractFactory("StakedLPTokenFactory");
    const slpFactory = (await SLPFactory.deploy(
        sushi.router.address,
        sushi.chef.address,
        slpVault.address
    )) as StakedLPTokenFactory;

    const FlashFactory = await ethers.getContractFactory("FlashFTokenFactory");
    const flashFactory = (await FlashFactory.deploy()) as FlashFTokenFactory;

    const FlashNft = await ethers.getContractFactory("FlashNFT");
    const flashNFT = (await FlashNft.deploy()) as FlashNFT;

    const Protocol = await ethers.getContractFactory("FlashProtocol");
    const flashProtocol = (await Protocol.deploy(flashNFT.address, flashFactory.address)) as FlashProtocol;
    await flashFactory.transferOwnership(flashProtocol.address);

    const Factory = await ethers.getContractFactory("SousChefFactory");
    const factory = (await Factory.deploy(
        flashProtocol.address,
        slpFactory.address,
        stakeFeeBPS,
        flashStakeFeeBPS,
        feeRecipient.address
    )) as SousChefFactory;

    return {
        deployer,
        alice,
        bob,
        carol,
        tokens,
        sushi,
        slpVault,
        slpFactory,
        flashFactory,
        flashNFT,
        flashProtocol,
        factory,
    };
};

describe("SousChefFactory", function () {
    it("should create SousChef when slpToken exists", async function () {
        const Vault = await ethers.getContractFactory("FeeVault");
        const feeVault = (await Vault.deploy()) as FeeVault;

        const { tokens, sushi, slpFactory, flashProtocol, factory } = await setupTest(0, 0, feeVault);

        const { pid } = await sushi.addPool(tokens.sushi, tokens.weth, 100);
        await slpFactory.createStakedLPToken(pid);

        const address = await factory.predictSousChefAddress(pid);
        await expect(factory.createSousChef(pid)).to.emit(factory, "CreateSousChef");

        const sousChef = SousChef__factory.connect(await factory.getSousChef(pid), ethers.provider);
        expect(sousChef.address).to.be.equal(address);

        await expect(factory.createSousChef(pid)).to.be.revertedWithCustomError(factory, "SousChefCreated");

        const slpToken = StakedLPToken__factory.connect(await sousChef.slpToken(), ethers.provider);
        const fTokenName = "SousChef " + (await slpToken.name());
        const fTokenSymbol = "f" + (await slpToken.symbol()) + "-" + slpToken.address.substring(2, 6);
        await expect(
            flashProtocol.registerStrategy(sousChef.address, slpToken.address, fTokenName, fTokenSymbol)
        ).to.emit(flashProtocol, "StrategyRegistered");

        const fToken = FlashFToken__factory.connect(await sousChef.fToken(), ethers.provider);
        expect(await fToken.name()).to.be.equal(fTokenName);
        expect(await fToken.symbol()).to.be.equal(fTokenSymbol);
    });

    it("should create SousChef when slpToken doesn't exist", async function () {
        const Vault = await ethers.getContractFactory("FeeVault");
        const feeVault = (await Vault.deploy()) as FeeVault;

        const { tokens, sushi, slpFactory, flashProtocol, factory } = await setupTest(0, 0, feeVault);

        const { pid } = await sushi.addPool(tokens.sushi, tokens.weth, 100);
        expect(await slpFactory.getStakedLPToken(pid)).to.be.equal(constants.AddressZero);

        const address = await factory.predictSousChefAddress(pid);
        await expect(factory.createSousChef(pid)).to.emit(factory, "CreateSousChef");

        const sousChef = SousChef__factory.connect(await factory.getSousChef(pid), ethers.provider);
        expect(await slpFactory.getStakedLPToken(pid)).to.be.equal(await sousChef.slpToken());
        expect(sousChef.address).to.be.equal(address);

        await expect(factory.createSousChef(pid)).to.be.revertedWithCustomError(factory, "SousChefCreated");

        const slpToken = StakedLPToken__factory.connect(await sousChef.slpToken(), ethers.provider);
        const fTokenName = "SousChef " + (await slpToken.name());
        const fTokenSymbol = "f" + (await slpToken.symbol()) + "-" + slpToken.address.substring(2, 6);
        expect(
            await flashProtocol.registerStrategy(sousChef.address, slpToken.address, fTokenName, fTokenSymbol)
        ).to.emit(flashProtocol, "StrategyRegistered");

        const fToken = FlashFToken__factory.connect(await sousChef.fToken(), ethers.provider);
        expect(await fToken.name()).to.be.equal(fTokenName);
        expect(await fToken.symbol()).to.be.equal(fTokenSymbol);
    });
});
