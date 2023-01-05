const FLASH_PROTOCOL = {
    "1": "",
};
const FEE_RECIPIENT = {
    "1": "",
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
