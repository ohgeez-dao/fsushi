import { ethers } from "hardhat";
import { constants } from "ethers";
import { expect } from "chai";
import {
    FarmingLPTokenFactory,
    FarmingLPToken__factory,
    FlashFTokenFactory,
    FlashProtocol,
    FlashNFT,
    FlashFToken__factory,
    SushiBarVault,
    FlashStrategySushiSwapFactory,
    FlashStrategySushiSwap__factory,
    FeeVault,
} from "../typechain-types";
import setupSushiswap from "./utils/setupSushiswap";
import setupTokens from "./utils/setupTokens";

const setupTest = async feeRecipient => {
    const tokens = await setupTokens();
    const sushi = await setupSushiswap(tokens);
    const [deployer, alice, bob, carol] = await ethers.getSigners();

    const SBVault = await ethers.getContractFactory("SushiBarVault");
    const sbVault = (await SBVault.deploy(tokens.sushi.address, sushi.bar.address)) as SushiBarVault;

    const ALPFactory = await ethers.getContractFactory("FarmingLPTokenFactory");
    const flpFactory = (await ALPFactory.deploy(
        sushi.router.address,
        sushi.chef.address,
        sbVault.address
    )) as FarmingLPTokenFactory;

    const FlashFactory = await ethers.getContractFactory("FlashFTokenFactory");
    const flashFactory = (await FlashFactory.deploy()) as FlashFTokenFactory;

    const FlashNft = await ethers.getContractFactory("FlashNFT");
    const flashNFT = (await FlashNft.deploy()) as FlashNFT;

    const Protocol = await ethers.getContractFactory("FlashProtocol");
    const flashProtocol = (await Protocol.deploy(flashNFT.address, flashFactory.address)) as FlashProtocol;
    await flashFactory.transferOwnership(flashProtocol.address);

    const Factory = await ethers.getContractFactory("FlashStrategySushiSwapFactory");
    const factory = (await Factory.deploy(
        flashProtocol.address,
        flpFactory.address,
        feeRecipient.address
    )) as FlashStrategySushiSwapFactory;

    return {
        deployer,
        alice,
        bob,
        carol,
        tokens,
        sushi,
        sbVault,
        flpFactory,
        flashFactory,
        flashNFT,
        flashProtocol,
        factory,
    };
};

describe("FlashStrategySushiSwapFactory", function () {
    it("should create FlashStrategySushiSwap when flpToken exists", async function () {
        const Vault = await ethers.getContractFactory("FeeVault");
        const feeVault = (await Vault.deploy()) as FeeVault;

        const { tokens, sushi, flpFactory, flashProtocol, factory } = await setupTest(feeVault);

        const { pid } = await sushi.addPool(tokens.sushi, tokens.weth, 100);
        await flpFactory.createFarmingLPToken(pid);

        const address = await factory.predictFlashStrategySushiSwapAddress(pid);
        await expect(factory.createFlashStrategySushiSwap(pid)).to.emit(factory, "CreateFlashStrategySushiSwap");

        const sousChef = FlashStrategySushiSwap__factory.connect(
            await factory.getFlashStrategySushiSwap(pid),
            ethers.provider
        );
        expect(sousChef.address).to.be.equal(address);

        await expect(factory.createFlashStrategySushiSwap(pid)).to.be.revertedWithCustomError(
            factory,
            "FlashStrategySushiSwapCreated"
        );

        const flpToken = FarmingLPToken__factory.connect(await sousChef.flpToken(), ethers.provider);
        const fTokenName = "FlashStrategySushiSwap " + (await flpToken.name());
        const fTokenSymbol = "f" + (await flpToken.symbol()) + "-" + flpToken.address.substring(2, 6);
        await expect(
            flashProtocol.registerStrategy(sousChef.address, flpToken.address, fTokenName, fTokenSymbol)
        ).to.emit(flashProtocol, "StrategyRegistered");

        const fToken = FlashFToken__factory.connect(await sousChef.fToken(), ethers.provider);
        expect(await fToken.name()).to.be.equal(fTokenName);
        expect(await fToken.symbol()).to.be.equal(fTokenSymbol);
    });

    it("should create FlashStrategySushiSwap when flpToken doesn't exist", async function () {
        const Vault = await ethers.getContractFactory("FeeVault");
        const feeVault = (await Vault.deploy()) as FeeVault;

        const { tokens, sushi, flpFactory, flashProtocol, factory } = await setupTest(feeVault);

        const { pid } = await sushi.addPool(tokens.sushi, tokens.weth, 100);
        expect(await flpFactory.getFarmingLPToken(pid)).to.be.equal(constants.AddressZero);

        const address = await factory.predictFlashStrategySushiSwapAddress(pid);
        await expect(factory.createFlashStrategySushiSwap(pid)).to.emit(factory, "CreateFlashStrategySushiSwap");

        const sousChef = FlashStrategySushiSwap__factory.connect(
            await factory.getFlashStrategySushiSwap(pid),
            ethers.provider
        );
        expect(await flpFactory.getFarmingLPToken(pid)).to.be.equal(await sousChef.flpToken());
        expect(sousChef.address).to.be.equal(address);

        await expect(factory.createFlashStrategySushiSwap(pid)).to.be.revertedWithCustomError(
            factory,
            "FlashStrategySushiSwapCreated"
        );

        const flpToken = FarmingLPToken__factory.connect(await sousChef.flpToken(), ethers.provider);
        const fTokenName = "FlashStrategySushiSwap " + (await flpToken.name());
        const fTokenSymbol = "f" + (await flpToken.symbol()) + "-" + flpToken.address.substring(2, 6);
        expect(
            await flashProtocol.registerStrategy(sousChef.address, flpToken.address, fTokenName, fTokenSymbol)
        ).to.emit(flashProtocol, "StrategyRegistered");

        const fToken = FlashFToken__factory.connect(await sousChef.fToken(), ethers.provider);
        expect(await fToken.name()).to.be.equal(fTokenName);
        expect(await fToken.symbol()).to.be.equal(fTokenSymbol);
    });
});
