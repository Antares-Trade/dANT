const { expectRevert, time } = require("@openzeppelin/test-helpers");
const { bnArrayToString, toWei, fromWei, toBN } = require("./utils");
const dANT = artifacts.require("dANT");
const ReferralRewards = artifacts.require("ReferralRewards");
const ReferralTree = artifacts.require("ReferralTree");
const RewardsType0 = artifacts.require("RewardsType0");
const RewardsType1 = artifacts.require("RewardsType1");
const RewardsType2 = artifacts.require("RewardsType2");

contract("System", function ([alice, bob, carol, david, eve, frank]) {
  beforeEach(async function () {
    this.dant = await dANT.deployed();
    this.referralTree = await ReferralTree.deployed();
    this.rewardsType0 = await RewardsType0.deployed();
    this.rewardsType1 = await RewardsType1.deployed();
    this.rewardsType2 = await RewardsType2.deployed();
    this.referralRewardsType0 = await ReferralRewards.at(
      await this.rewardsType0.referralRewards()
    );
    this.referralRewardsType1 = await ReferralRewards.at(
      await this.rewardsType1.referralRewards()
    );
    this.referralRewardsType2 = await ReferralRewards.at(
      await this.rewardsType2.referralRewards()
    );
  });

  it("should ensure system integrity", async function () {
    const treeRoot = await this.referralTree.treeRoot();
    const referralStake = toWei("100");
    const amount = toWei("1");
    await this.dant.transfer(david, toBN(referralStake).muln(3), {
      from: alice,
    });
    await this.dant.transfer(carol, toBN(referralStake).muln(3), {
      from: alice,
    });
    await this.dant.transfer(bob, toBN(referralStake).muln(3), { from: alice });
    await this.dant.approve(this.rewardsType0.address, amount, { from: alice });
    await this.dant.approve(this.rewardsType1.address, amount, { from: alice });
    await this.dant.approve(this.rewardsType2.address, amount, { from: alice });
    await this.dant.approve(this.rewardsType0.address, referralStake, {
      from: bob,
    });
    await this.dant.approve(this.rewardsType1.address, referralStake, {
      from: bob,
    });
    await this.dant.approve(this.rewardsType2.address, referralStake, {
      from: bob,
    });
    await this.dant.approve(this.rewardsType0.address, referralStake, {
      from: carol,
    });
    await this.dant.approve(this.rewardsType1.address, referralStake, {
      from: carol,
    });
    await this.dant.approve(this.rewardsType2.address, referralStake, {
      from: carol,
    });
    await this.dant.approve(this.rewardsType0.address, referralStake, {
      from: david,
    });
    await this.dant.approve(this.rewardsType1.address, referralStake, {
      from: david,
    });
    await this.dant.approve(this.rewardsType2.address, referralStake, {
      from: david,
    });
    await this.rewardsType0.stake(referralStake, treeRoot, {
      from: david,
    });
    await this.rewardsType0.stake(referralStake, david, {
      from: carol,
    });
    await this.rewardsType0.stake(referralStake, carol, {
      from: bob,
    });
    await this.rewardsType1.stake(referralStake, treeRoot, {
      from: david,
    });
    await this.rewardsType1.stake(referralStake, david, {
      from: carol,
    });
    await this.rewardsType1.stake(referralStake, carol, {
      from: bob,
    });
    await this.rewardsType2.stake(referralStake, treeRoot, {
      from: david,
    });
    await this.rewardsType2.stake(referralStake, david, {
      from: carol,
    });
    await this.rewardsType2.stake(referralStake, carol, {
      from: bob,
    });
    await this.dant.approve(this.rewardsType0.address, amount, { from: alice });
    await this.dant.approve(this.rewardsType1.address, amount, { from: alice });
    await this.dant.approve(this.rewardsType2.address, amount, { from: alice });
    await this.rewardsType0.stake(amount, bob, { from: alice });
    await this.rewardsType1.stake(amount, bob, { from: alice });
    await this.rewardsType2.stake(amount, bob, { from: alice });
    await time.increase(10000);
    await this.referralTree.claimAllDividends({ from: bob });
    await this.referralTree.claimAllDividends({ from: carol });
    await this.referralTree.claimAllDividends({ from: david });
    const aliceRewardsType0 = await this.rewardsType0.getReward(alice);
    const aliceRewardsType1 = await this.rewardsType1.getReward(alice);
    const aliceRewardsType2 = await this.rewardsType2.getReward(alice);
    const bobRewardsType0 = await this.rewardsType0.getReward(bob);
    const bobRewardsType1 = await this.rewardsType1.getReward(bob);
    const bobRewardsType2 = await this.rewardsType2.getReward(bob);
    const carolRewardsType0 = await this.rewardsType0.getReward(carol);
    const carolRewardsType1 = await this.rewardsType1.getReward(carol);
    const carolRewardsType2 = await this.rewardsType2.getReward(carol);
    const totalAliceReward = toBN(
      Math.floor(aliceRewardsType0) +
        Math.floor(aliceRewardsType1) +
        Math.floor(aliceRewardsType2)
    );
    const totalBobReward = toBN(
      Math.floor(bobRewardsType0) +
        Math.floor(bobRewardsType1) +
        Math.floor(bobRewardsType2)
    );
    const totalCarolReward = toBN(
      Math.floor(carolRewardsType0) +
        Math.floor(carolRewardsType1) +
        Math.floor(carolRewardsType2)
    );
    const bobBalance = toBN(await this.dant.balanceOf(bob));
    const carolBalance = toBN(await this.dant.balanceOf(carol));
    const davidBalance = toBN(await this.dant.balanceOf(david));
    const bobReward = toBN(
      Math.floor(totalAliceReward * 0.04) + Math.floor(amount * 0.08)
    );
    const carolReward = toBN(
      Math.floor(totalAliceReward * 0.01) + Math.floor(amount * 0.02)
    ).add(
      toBN(Math.floor(totalBobReward * 0.04) + Math.floor(referralStake * 0.08))
    );
    const davidReward = toBN(
      Math.floor(totalAliceReward * 0.005) + Math.floor(amount * 0.01)
    )
      .add(
        toBN(
          Math.floor(totalCarolReward * 0.04) + Math.floor(referralStake * 0.08)
        )
      )
      .add(
        toBN(
          Math.floor(totalBobReward * 0.01) + Math.floor(referralStake * 0.02)
        )
      );
    assert.ok(bobBalance.sub(bobReward).abs().lte(toBN(1e13)));
    assert.ok(carolBalance.sub(carolReward).abs().lte(toBN(1e13)));
    assert.ok(davidBalance.sub(davidReward).abs().lte(toBN(1e13)));
  });
});
