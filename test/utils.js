const bnArrayToString = (bn) =>
  bn.map((v) => {
    return Array.isArray(v) ? bnArrayToString(v) : v.toString();
  });
const toWei = web3.utils.toWei;
const fromWei = web3.utils.fromWei;
const toBN = web3.utils.toBN;
module.exports.bnArrayToString = bnArrayToString;
module.exports.toWei = toWei;
module.exports.fromWei = fromWei;
module.exports.toBN = toBN;
