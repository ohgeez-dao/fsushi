import { ethers } from "hardhat";
import { constants } from "ethers";
import { MasterChef, SushiToken, UniswapV2Factory, WETH9 } from "../typechain-types";

const setupSushiswap = async () => {
    const WETH9 = await ethers.getContractFactory("WETH9");
    const weth = (await WETH9.deploy()) as WETH9;

    const Factory = await ethers.getContractFactory("UniswapV2Factory");
    const factory = (await Factory.deploy(constants.AddressZero)) as UniswapV2Factory;

    const Sushi = await ethers.getContractFactory("SushiToken");
    const sushi = (await Sushi.deploy()) as SushiToken;

    const Chef = await ethers.getContractFactory("MasterChef");
    const chef = (await Chef.deploy(sushi.address, constants.AddressZero, 0, 0, 0)) as MasterChef;

    return {
        weth,
        factory,
        sushi,
        chef,
    };
};

export default setupSushiswap;
