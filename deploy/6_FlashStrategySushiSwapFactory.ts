const FLASH_PROTOCOL = {
    "1": "0x78b2d65dd1d3d9Fb2972d7Ef467261Ca101EC2B9",
};
const FEE_RECIPIENT = {
    "1": "0x0903f8892c06A99bf1D68088fAB597a0762e0BC8",
};

export default async ({ getNamedAccounts, deployments, network }) => {
    const { deploy, get } = deployments;
    const { deployer } = await getNamedAccounts();

    const factory = await get("FarmingLPTokenFactory");

    const { chainId } = network.config;
    await deploy("FlashStrategySushiSwapFactory", {
        from: deployer,
        args: [FLASH_PROTOCOL[chainId], factory.address, FEE_RECIPIENT[chainId]],
        log: true,
    });
};
