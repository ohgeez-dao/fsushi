const SUSHI = {
    "1": "0x6B3595068778DD592e39A122f4f5a5cF09C90fE2",
};
const SUSHI_BAR = {
    "1": "0x8798249c2E607446EfB7Ad49eC89dD1865Ff4272",
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
