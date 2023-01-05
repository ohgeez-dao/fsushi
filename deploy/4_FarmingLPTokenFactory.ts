const SUSHISWAP_ROUTER = {
    "1": "",
};
const MASTER_CHEF = {
    "1": "",
};

export default async ({ getNamedAccounts, deployments, network }) => {
    const { deploy, get } = deployments;
    const { deployer } = await getNamedAccounts();

    const vault = await get("SushiBarVault");

    const { chainId } = network.config;
    await deploy("FarmingLPTokenFactory", {
        from: deployer,
        args: [SUSHISWAP_ROUTER[chainId], MASTER_CHEF[chainId], vault.address],
        log: true,
    });
};
