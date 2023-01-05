const SUSHISWAP_ROUTER = {
    "1": "0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F",
};
const MASTER_CHEF = {
    "1": "0xc2EdaD668740f1aA35E4D8f227fB8E17dcA888Cd",
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
