import { ethers } from "hardhat";
import { constants } from "ethers";
import { ERC20Mock, SushiToken, WETH9 } from "../../typechain-types";
import { setBalance } from "@nomicfoundation/hardhat-network-helpers";

const ONE = ethers.constants.WeiPerEther;

const setupTokens = async () => {
    const [deployer] = await ethers.getSigners();
    await setBalance(deployer.address, constants.MaxUint256);

    const WETH9 = await ethers.getContractFactory("WETH9");
    const weth = (await WETH9.deploy()) as WETH9;
    await weth.connect(deployer).deposit({ value: ONE.mul(1000).add(1000) });

    const Sushi = await ethers.getContractFactory("SushiToken");
    const sushi = (await Sushi.deploy()) as SushiToken;
    await sushi.mint(deployer.address, constants.WeiPerEther.mul(1000));

    const deployERC20 = async (name, symbol, decimals) => {
        const ERC20 = await ethers.getContractFactory("ERC20Mock");
        return (await ERC20.deploy(name, symbol, decimals)) as ERC20Mock;
    };
    const usdc = await deployERC20("USD coin", "USDC", 6);
    await usdc.mint(deployer.address, ONE.mul(1000).add(1000));
    const usdt = await deployERC20("Tether", "USDT", 6);
    await usdt.mint(deployer.address, ONE.mul(1000).add(1000));
    const wbtc = await deployERC20("Wrapped Bitcoin", "WBTC", 8);
    await wbtc.mint(deployer.address, ONE.mul(1000).add(1000));

    return {
        weth,
        sushi,
        usdc,
        usdt,
        wbtc,
        deployERC20,
    };
};

export default setupTokens;
