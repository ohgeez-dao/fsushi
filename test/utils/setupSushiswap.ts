import { ethers } from "hardhat";
import { constants } from "ethers";
import {
    MasterChef,
    SushiBar,
    UniswapV2Factory,
    UniswapV2Pair__factory,
    UniswapV2Router02,
} from "../../typechain-types";

export const SUSHI_PER_BLOCK = 100;

const getBlockTimestamp = async () => {
    const { timestamp } = await ethers.provider.getBlock(await ethers.provider.getBlockNumber());
    return timestamp;
};

const setupSushiswap = async tokens => {
    const [deployer] = await ethers.getSigners();

    const Factory = await ethers.getContractFactory("UniswapV2Factory");
    const factory = (await Factory.deploy(constants.AddressZero)) as UniswapV2Factory;

    const Router = await ethers.getContractFactory("UniswapV2Router02");
    const router = (await Router.deploy(factory.address, tokens.weth.address)) as UniswapV2Router02;

    const Chef = await ethers.getContractFactory("MasterChef");
    const chef = (await Chef.deploy(
        tokens.sushi.address,
        deployer.address,
        constants.WeiPerEther.mul(SUSHI_PER_BLOCK),
        0,
        0
    )) as MasterChef;
    await tokens.sushi.transferOwnership(chef.address);

    const Bar = await ethers.getContractFactory("SushiBar");
    const bar = (await Bar.deploy(tokens.sushi.address)) as SushiBar;

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
        factory,
        router,
        chef,
        bar,
        addPool,
        addLiquidity,
    };
};

export default setupSushiswap;
