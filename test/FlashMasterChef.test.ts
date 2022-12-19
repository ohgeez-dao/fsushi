import { ethers } from "hardhat";
import { constants } from "ethers";
import { assert, expect } from "chai";
import {
    StakedLPTokenFactory,
    StakedLPToken,
    StakedLPToken__factory,
    FlashFTokenFactory,
    FlashProtocol,
    FlashNFT,
    FlashMasterChef,
    FlashFToken__factory,
    UniswapV2Pair__factory,
    SushiBarVault,
} from "../typechain-types";
import setupSushiswap, { SUSHI_PER_BLOCK } from "./utils/setupSushiswap";
import setupTokens from "./utils/setupTokens";
import addressEquals from "./utils/addressEquals";
import now from "./utils/now";

const ONE = ethers.constants.WeiPerEther;
const YEAR = 365 * 24 * 3600;
const DELTA = ethers.BigNumber.from(10).pow(8);

const setupTest = async (feeBPS, feeRecipient) => {
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

    const createStakedLPToken = async pid => {
        await slpFactory.createStakedLPToken(pid);
        return StakedLPToken__factory.connect(
            await slpFactory.predictStakedLPTokenAddress(pid),
            ethers.provider
        ) as StakedLPToken;
    };

    // add SUSHI-WETH pool
    const { pid, lpToken } = await sushi.addPool(tokens.sushi, tokens.weth, 100);
    const slpToken = await createStakedLPToken(pid);

    const FlashFactory = await ethers.getContractFactory("FlashFTokenFactory");
    const factory = (await FlashFactory.deploy()) as FlashFTokenFactory;

    const FlashNft = await ethers.getContractFactory("FlashNFT");
    const nft = (await FlashNft.deploy()) as FlashNFT;

    const Protocol = await ethers.getContractFactory("FlashProtocol");
    const protocol = (await Protocol.deploy(nft.address, factory.address)) as FlashProtocol;
    await factory.transferOwnership(protocol.address);

    const FlashMC = await ethers.getContractFactory("FlashMasterChef");
    const strategy = (await FlashMC.deploy(
        protocol.address,
        feeBPS,
        feeRecipient,
        slpFactory.address,
        pid
    )) as FlashMasterChef;

    await protocol.registerStrategy(
        strategy.address,
        slpToken.address,
        "FlashMasterChef " + (await slpToken.name()),
        "f" + (await slpToken.symbol()) + "-" + slpToken.address.substring(2, 6)
    );

    const fToken = FlashFToken__factory.connect(await strategy.fToken(), ethers.provider);

    const findPathToSushi = async tokenAddressIn => {
        if (addressEquals(tokenAddressIn, tokens.sushi.address)) {
            return [tokens.sushi.address];
        }
        const pair = await sushi.factory.getPair(tokenAddressIn, tokens.sushi.address);
        if (addressEquals(pair, constants.AddressZero)) {
            const length = (await sushi.factory.allPairsLength()).toNumber();
            for (let i = 0; i < length; i++) {
                const lpToken = UniswapV2Pair__factory.connect(await sushi.factory.allPairs(i), ethers.provider);
                const token0 = await lpToken.token0();
                const token1 = await lpToken.token1();
                if (addressEquals(tokenAddressIn, token0) || addressEquals(tokenAddressIn, token1)) {
                    const bridge = addressEquals(tokenAddressIn, token0) ? token1 : token0;
                    if ((await sushi.factory.getPair(bridge, tokens.sushi.address)) != constants.AddressZero) {
                        return [tokenAddressIn, bridge, tokens.sushi.address];
                    }
                }
            }
            assert(false, "cannot find path to sushi");
        } else {
            return [tokenAddressIn, tokens.sushi.address];
        }
    };

    const quote = async (amountIn, path) => {
        if (path.length < 2) return amountIn;
        const amountOuts = await sushi.router.getAmountsOut(amountIn, path);
        return amountOuts[amountOuts.length - 1];
    };

    const getStakeParameters = async (lpToken, amountLP, beneficiary) => {
        const [token0, token1] = [await lpToken.token0(), await lpToken.token1()];
        const totalSupply = await lpToken.totalSupply();
        const [reserve0, reserve1] = await lpToken.getReserves();
        const amount0 = reserve0.mul(amountLP).div(totalSupply);
        const amount1 = reserve1.mul(amountLP).div(totalSupply);

        const path0 = await findPathToSushi(token0);
        const path1 = await findPathToSushi(token1);
        const amount = (await quote(amount0, path0)).add(await quote(amount1, path1));

        return [amountLP, path0, path1, amount, beneficiary.address, (await now()) + 60] as const;
    };

    const mintSLP = async (account, amountToken) => {
        if ((await lpToken.totalSupply()).isZero()) {
            amountToken = amountToken.add(1000);
        }
        await tokens.sushi.transfer(account.address, amountToken);
        await tokens.weth.connect(account).deposit({ value: amountToken });
        await sushi.addLiquidity(account, tokens.sushi, tokens.weth, amountToken, amountToken);

        const amountLP = await lpToken.balanceOf(account.address);
        await lpToken.connect(account).approve(slpToken.address, constants.MaxUint256);
        const params = await getStakeParameters(lpToken, amountLP, account);
        await slpToken.connect(account).stake(...params);
        return params[3];
    };

    return {
        deployer,
        alice,
        bob,
        carol,
        tokens,
        sushi,
        slpStrategy: slpVault,
        slpFactory,
        pid,
        lpToken,
        slpToken,
        factory,
        nft,
        protocol,
        strategy,
        fToken,
        createStakedLPToken,
        mintSLP,
    };
};

describe("FlashMasterChef", function () {
    it("should stake for 1 account", async function () {
        const Vault = await ethers.getContractFactory("FeeVault");
        const vault = await Vault.deploy();

        const { alice, slpToken, protocol, strategy, fToken, mintSLP } = await setupTest(0, vault.address);

        const amount = ONE.mul(100);
        const amountLP = await mintSLP(alice, amount);
        expect(await slpToken.balanceOf(alice.address)).to.be.equal(amountLP);

        await slpToken.connect(alice).approve(protocol.address, constants.MaxUint256);
        // 100 SUSHI is pending
        expect(await slpToken.balanceOf(alice.address)).to.be.approximately(amountLP.add(SUSHI_PER_BLOCK), DELTA);

        // stake all SLP (staked LP amount + 200 pending SUSHI)
        const amountSLP = amountLP.add(SUSHI_PER_BLOCK.mul(2));
        await protocol.connect(alice).stake(strategy.address, amountSLP, YEAR, alice.address, false);
        expect(await slpToken.balanceOf(alice.address)).to.be.equal(0);
        expect(await slpToken.balanceOf(strategy.address)).to.be.approximately(amountSLP, DELTA);
        expect(await fToken.balanceOf(alice.address)).to.be.approximately(amountSLP, DELTA);
    });
});
