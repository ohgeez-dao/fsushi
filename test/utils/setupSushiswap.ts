import { ethers } from "hardhat";
import { constants } from "ethers";
import {
    ERC20Mock,
    MasterChef,
    SushiToken,
    UniswapV2Factory,
    UniswapV2Pair__factory,
    UniswapV2Router02,
    WETH9,
} from "../../typechain-types";

export const SUSHI_PER_BLOCK = 100;

const getBlockTimestamp = async () => {
    const { timestamp } = await ethers.provider.getBlock(await ethers.provider.getBlockNumber());
    return timestamp;
};

const setupSushiswap = async () => {
    const [deployer] = await ethers.getSigners();

    const WETH9 = await ethers.getContractFactory("WETH9");
    const weth = (await WETH9.deploy()) as WETH9;

    const Factory = await ethers.getContractFactory("UniswapV2Factory");
    const factory = (await Factory.deploy(constants.AddressZero)) as UniswapV2Factory;

    const Router = await ethers.getContractFactory("UniswapV2Router02");
    const router = (await Router.deploy(factory.address, weth.address)) as UniswapV2Router02;

    const Sushi = await ethers.getContractFactory("SushiToken");
    const sushi = (await Sushi.deploy()) as SushiToken;
    await sushi.mint(deployer.address, constants.WeiPerEther.mul(1000));

    const Chef = await ethers.getContractFactory("MasterChef");
    const chef = (await Chef.deploy(
        sushi.address,
        deployer.address,
        constants.WeiPerEther.mul(SUSHI_PER_BLOCK),
        0,
        0
    )) as MasterChef;
    await sushi.transferOwnership(chef.address);

    const deployERC20 = async (name, symbol, decimals) => {
        const ERC20 = await ethers.getContractFactory("ERC20Mock");
        return (await ERC20.deploy(name, symbol, decimals)) as ERC20Mock;
    };
    const usdc = await deployERC20("USD coin", "USDC", 6);
    const usdt = await deployERC20("Tether", "USDT", 6);
    const wbtc = await deployERC20("Wrapped Bitcoin", "WBTC", 8);

    const addPool = async (tokenA, tokenB, allocPoint) => {
        const pid = await factory.allPairsLength();
        await factory.createPair(tokenA.address, tokenB.address);
        const lpToken = UniswapV2Pair__factory.connect(
            await factory.getPair(tokenA.address, tokenB.address),
            ethers.provider
        );
        await chef.add(allocPoint, lpToken.address, false);
        return { pid, lpToken };
    };

    const addLiquidity = async (signer, tokenA, tokenB, amountA, amountB) => {
        await tokenA.connect(signer).approve(router.address, constants.MaxUint256);
        await tokenB.connect(signer).approve(router.address, constants.MaxUint256);
        await router
            .connect(signer)
            .addLiquidity(
                tokenA.address,
                tokenB.address,
                amountA,
                amountB,
                0,
                0,
                signer.address,
                (await getBlockTimestamp()) + 60
            );
    };

    return {
        weth,
        factory,
        router,
        sushi,
        chef,
        usdc,
        usdt,
        wbtc,
        deployERC20,
        addPool,
        addLiquidity,
    };
};

export default setupSushiswap;
