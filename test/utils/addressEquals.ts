import { utils } from "ethers";

const addressEquals = (addressA, addressB) => utils.getAddress(addressA) == utils.getAddress(addressB);

export default addressEquals;
