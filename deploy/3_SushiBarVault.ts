const SUSHI = {
    "1": "",
};
const SUSHI_BAR = {
    "1": "",
};

export default async ({ getNamedAccounts, deployments, network }) => {
    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();

    const { chainId } = network.config;
    await deploy("SushiBarVault", {
        from: deployer,
        args: [SUSHI[chainId], SUSHI_BAR[chainId]],
        log: true,
    });
};
