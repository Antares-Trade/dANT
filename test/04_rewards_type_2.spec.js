const { expectRevert, time } = require("@openzeppelin/test-helpers");
const { web3 } = require("@openzeppelin/test-helpers/src/setup");
const { bnArrayToString, toWei, toBN } = require("./utils");
const dANT = artifacts.require("dANT");
const ReferralRewards = artifacts.require("ReferralRewards");
const ReferralTree = artifacts.require("ReferralTree");
const RewardsType2 = artifacts.require("RewardsType2");

contract("RewardsType2", function ([alice, bob, carol, david, eve, frank]) {
  beforeEach(async function () {
    this.dant = await dANT.new(5000000, { from: alice });
    this.referralRoot = frank;
    this.referralTree = await ReferralTree.new(this.referralRoot, {
      from: alice,
    });
    this.rewardsType2 = await RewardsType2.new(
      this.dant.address,
      this.referralTree.address,
      { from: alice }
    );
    this.referralRewards = await ReferralRewards.at(
      await this.rewardsType2.referralRewards()
    );
    const minterRole = await this.dant.MINTER_ROLE();
    const rewardsRole = await this.referralTree.REWARDS_ROLE();
    await this.dant.grantRole(minterRole, this.rewardsType2.address, {
      from: alice,
    });
    await this.dant.grantRole(minterRole, this.referralRewards.address, {
      from: alice,
    });
    await this.referralTree.grantRole(rewardsRole, alice, { from: alice });
    await this.referralTree.addReferralReward(this.referralRewards.address);
  });

  it("should have correct initial configurations", async function () {
    const token = await this.rewardsType2.token();
    const referralTree = await this.referralRewards.referralTree();
    const depositBounds = await this.referralRewards.getDepositBounds();
    const depositRate = await this.referralRewards.getDepositRates();
    const stakingRate = await this.referralRewards.getStakingRates();
    const duration = await this.rewardsType2.duration();
    const rewardPerSec = await this.rewardsType2.rewardPerSec();
    assert.equal(token, this.dant.address);
    assert.equal(referralTree, this.referralTree.address);
    assert.deepEqual(bnArrayToString(depositBounds), [
      toWei("5000"),
      toWei("2000"),
      toWei("100"),
    ]);
    assert.deepEqual(bnArrayToString(depositRate), [
      [toWei("0"), toWei("0"), toWei("0")],
      [toWei("0"), toWei("0"), toWei("0")],
      [toWei("0"), toWei("0"), toWei("0")],
    ]);
    assert.deepEqual(bnArrayToString(stakingRate), [
      [toWei("0.06"), toWei("0.02"), toWei("0.01")],
      [toWei("0.05"), toWei("0.015"), toWei("0.0075")],
      [toWei("0.04"), toWei("0.01"), toWei("0.005")],
    ]);
    assert.equal(duration, "0");
    assert.equal(rewardPerSec, "57870370370");
  });

  it("should record deposit and assept no referral", async function () {
    const addressNull = "0x0000000000000000000000000000000000000000";
    const amount = toWei("1000");
    await this.dant.transfer(bob, amount, { from: alice });
    await this.dant.approve(this.rewardsType2.address, amount, { from: bob });
    await this.rewardsType2.stake(amount, this.referralRoot, { from: bob });
    const bobAccount = await this.rewardsType2.userInfo(bob);
    const bobDeposit = await this.rewardsType2.getDeposit(bob, 0);
    const totalStake = await this.rewardsType2.totalStake();
    assert.equal(bobAccount.amount, amount);
    assert.equal(bobAccount.unfrozen, 0);
    assert.equal(bobAccount.reward, 0);
    assert.equal(
      bobAccount.lastUpdate.toString(),
      (await time.latest()).toString()
    );
    assert.equal(bobAccount.depositHead, 0);
    assert.equal(bobAccount.depositTail, 1);
    assert.equal(bobDeposit[0], amount);
    assert.equal(bobDeposit[1].toNumber(), (await time.latest()).toNumber());
    assert.equal(totalStake, amount);
  });

  it("should set referral during the deposit", async function () {
    const addressNull = "0x0000000000000000000000000000000000000000";
    const amount = toWei("1000");
    await this.dant.transfer(bob, amount, { from: alice });
    await this.dant.approve(this.rewardsType2.address, amount, { from: bob });
    await this.rewardsType2.stake(amount, this.referralRoot, { from: bob });
    const bobReferrals = await this.referralTree.getReferrals(bob, 3);
    assert.deepEqual(bobReferrals, [
      this.referralRoot,
      addressNull,
      addressNull,
    ]);
  });

  it("should process 0 deposit", async function () {
    const addressNull = "0x0000000000000000000000000000000000000000";
    const amount = toWei("0");
    await this.dant.transfer(bob, amount, { from: alice });
    await this.dant.approve(this.rewardsType2.address, amount, { from: bob });
    await this.rewardsType2.stake(amount, this.referralRoot, { from: bob });
    const bobAccount = await this.rewardsType2.userInfo(bob);
    const totalStake = await this.rewardsType2.totalStake();
    assert.equal(bobAccount.amount, 0);
    assert.equal(bobAccount.unfrozen, 0);
    assert.equal(bobAccount.reward, 0);
    assert.equal(
      bobAccount.lastUpdate.toString(),
      (await time.latest()).toString()
    );
    assert.equal(bobAccount.depositHead, 0);
    assert.equal(bobAccount.depositTail, 0);
    assert.equal(totalStake, 0);
  });

  it("should assess user reward properly after half period", async function () {
    this.retries(4);
    const addressNull = "0x0000000000000000000000000000000000000000";
    const amount = toWei("1000");
    await this.dant.transfer(bob, amount, { from: alice });
    await this.dant.approve(this.rewardsType2.address, amount, { from: bob });
    await this.rewardsType2.stake(amount, this.referralRoot, { from: bob });
    const initBobAccount = await this.rewardsType2.userInfo(bob);
    await time.increaseTo(initBobAccount.lastUpdate.toNumber() + 10000000);
    await this.rewardsType2.stake(0, addressNull, { from: bob });
    const finalBobAccount = await this.rewardsType2.userInfo(bob);
    const scaledReward = toWei("578.7037037");
    assert.equal(finalBobAccount.amount, amount);
    assert.equal(finalBobAccount.unfrozen, 0);
    assert.equal(finalBobAccount.reward.toString(), scaledReward);
    assert.equal(
      finalBobAccount.lastUpdate.toString(),
      (await time.latest()).toString()
    );
    assert.equal(finalBobAccount.depositHead, 0);
    assert.equal(finalBobAccount.depositTail, 1);
  });

  it("should assess referral reward properly after half period on all levels", async function () {
    this.retries(10);
    const addressNull = "0x0000000000000000000000000000000000000000";
    const amount = toWei("1000");
    const referralMinStake = toWei("100");
    await this.dant.transfer(bob, amount, { from: alice });
    await this.dant.transfer(eve, referralMinStake, { from: alice });
    await this.dant.transfer(david, referralMinStake, { from: alice });
    await this.dant.transfer(carol, referralMinStake, { from: alice });
    await this.dant.approve(this.rewardsType2.address, referralMinStake, {
      from: eve,
    });
    await this.dant.approve(this.rewardsType2.address, referralMinStake, {
      from: david,
    });
    await this.dant.approve(this.rewardsType2.address, referralMinStake, {
      from: carol,
    });
    await this.rewardsType2.stake(referralMinStake, this.referralRoot, {
      from: eve,
    });
    await this.rewardsType2.stake(referralMinStake, eve, {
      from: david,
    });
    await this.rewardsType2.stake(referralMinStake, david, {
      from: carol,
    });
    await this.dant.approve(this.rewardsType2.address, amount, { from: bob });
    await this.rewardsType2.stake(amount, carol, { from: bob });
    const initBobAccount = await this.rewardsType2.userInfo(bob);
    await time.increaseTo(initBobAccount.lastUpdate.toNumber() + 10000000);
    const carolReferralReward = toBN(
      await this.referralRewards.getReferralReward(carol)
    );
    const davidReferralReward = toBN(
      await this.referralRewards.getReferralReward(david)
    );
    const eveReferralReward = toBN(
      await this.referralRewards.getReferralReward(eve)
    );
    const carolReward = toBN(toWei("23.148148148"));
    const davidReward = toBN(toWei("8.1018518518")); // 5.787037037 + 2.3148148148
    const eveReward = toBN(toWei("5.787037037")); // 2.8935185185 + 2.3148148148 + 0.5787037037
    assert.ok(carolReferralReward.sub(carolReward).abs().lte(toBN(1e13)));
    assert.ok(davidReferralReward.sub(davidReward).abs().lte(toBN(1e13)));
    assert.ok(eveReferralReward.sub(eveReward).abs().lte(toBN(1e13)));
  });

  it("should claim user reward properly after half period", async function () {
    this.retries(4);
    const amount = toWei("1000");
    await this.dant.transfer(bob, amount, { from: alice });
    await this.dant.approve(this.rewardsType2.address, amount, { from: bob });
    await this.rewardsType2.stake(amount, this.referralRoot, { from: bob });
    const initBobAccount = await this.rewardsType2.userInfo(bob);
    await time.increaseTo(initBobAccount.lastUpdate.toNumber() + 10000000);
    await this.rewardsType2.stake(0, this.referralRoot, { from: bob });
    const finalBobAccount = await this.rewardsType2.userInfo(bob);
    const finalBobBalance = await this.dant.balanceOf(bob);
    const reward = toWei("578.7037037");
    assert.equal(finalBobAccount.amount, amount);
    assert.equal(finalBobBalance.toString(), reward);
  });

  it("should claim referral reward properly after half period on all levels", async function () {
    this.retries(10);
    const addressNull = "0x0000000000000000000000000000000000000000";
    const amount = toWei("1000");
    const referralMinStake = toWei("100");
    await this.dant.transfer(bob, amount, { from: alice });
    await this.dant.transfer(eve, referralMinStake, { from: alice });
    await this.dant.transfer(david, referralMinStake, { from: alice });
    await this.dant.transfer(carol, referralMinStake, { from: alice });
    await this.dant.approve(this.rewardsType2.address, referralMinStake, {
      from: eve,
    });
    await this.dant.approve(this.rewardsType2.address, referralMinStake, {
      from: david,
    });
    await this.dant.approve(this.rewardsType2.address, referralMinStake, {
      from: carol,
    });
    await this.rewardsType2.stake(referralMinStake, this.referralRoot, {
      from: eve,
    });
    await this.rewardsType2.stake(referralMinStake, eve, {
      from: david,
    });
    await this.rewardsType2.stake(referralMinStake, david, {
      from: carol,
    });
    await this.dant.approve(this.rewardsType2.address, amount, { from: bob });
    await this.rewardsType2.stake(amount, carol, { from: bob });
    const initBobAccount = await this.rewardsType2.userInfo(bob);
    await time.increaseTo(initBobAccount.lastUpdate.toNumber() + 10000000);
    await this.referralRewards.claimDividends({
      from: carol,
    });
    await this.referralRewards.claimDividends({
      from: david,
    });
    await this.referralRewards.claimDividends({
      from: eve,
    });
    const carolReferralReward = toBN(await this.dant.balanceOf(carol));
    const davidReferralReward = toBN(await this.dant.balanceOf(david));
    const eveReferralReward = toBN(await this.dant.balanceOf(eve));
    const carolReward = toBN(toWei("23.148148148"));
    const davidReward = toBN(toWei("8.1018518518")); // 5.787037037 + 2.3148148148
    const eveReward = toBN(toWei("5.7870376157037037")); // 2.8935185185 + 2.3148148148 + 0.5787037037 + 10 * 57870370370/1e18
    assert.ok(carolReferralReward.sub(carolReward).abs().lte(toBN(1e13)));
    assert.ok(davidReferralReward.sub(davidReward).abs().lte(toBN(1e13)));
    assert.ok(eveReferralReward.sub(eveReward).abs().lte(toBN(1e13)));
  });

  it("should stop assesing reward after withdrawal requested", async function () {
    this.retries(5);
    const addressNull = "0x0000000000000000000000000000000000000000";
    const amount = toWei("1000");
    await this.dant.transfer(bob, amount, { from: alice });
    await this.dant.approve(this.rewardsType2.address, amount, { from: bob });
    await this.rewardsType2.stake(amount, this.referralRoot, { from: bob });
    const initBobAccount = await this.rewardsType2.userInfo(bob);
    await time.increaseTo(initBobAccount.lastUpdate.toNumber() + 10000000);
    await this.rewardsType2.stake(0, addressNull, { from: bob });
    const scaledReward = toWei("578.7037037");
    const bobAccount = await this.rewardsType2.userInfo(bob);
    assert.equal(bobAccount.amount, amount);
    assert.equal(bobAccount.reward.toString(), scaledReward);
    await this.rewardsType2.unstake(0, { from: bob });
    const finalBobAccount = await this.rewardsType2.userInfo(bob);
    const rewardsType0Balance = await this.dant.balanceOf(
      this.rewardsType2.address
    );
    const bobRequest = await this.rewardsType2.unstakeRequests(bob, 0);
    assert.equal(rewardsType0Balance, amount);
    assert.equal(finalBobAccount.amount, 0);
    assert.equal(finalBobAccount.unfrozen, amount);
    assert.equal(finalBobAccount.reward.toString(), scaledReward);
    assert.equal(
      bobRequest.timelock.toNumber(),
      finalBobAccount.lastUpdate.toNumber() + 259200
    );
    assert.equal(bobRequest.amount, amount);
    assert.equal(bobRequest.status, 1);
  });

  it("should withdraw user deposit after timelock ended", async function () {
    this.retries(4);
    const amount = toWei("1000");
    await this.dant.transfer(bob, amount, { from: alice });
    await this.referralTree.setReferral(eve, this.referralRoot, {
      from: alice,
    });
    await this.dant.approve(this.rewardsType2.address, amount, { from: bob });
    await this.rewardsType2.stake(amount, this.referralRoot, { from: bob });
    const initBobAccount = await this.rewardsType2.userInfo(bob);
    await time.increaseTo(initBobAccount.lastUpdate.toNumber() + 10000000);
    await this.rewardsType2.unstake(0, { from: bob });
    const bobAccount = await this.rewardsType2.userInfo(bob);
    assert.equal(bobAccount.unfrozen.toString(), amount);
    const bobAccountAfterUnstake = await this.rewardsType2.userInfo(bob);
    await time.increaseTo(
      bobAccountAfterUnstake.lastUpdate.toNumber() + 259201
    );
    await this.rewardsType2.stake(0, this.referralRoot, { from: bob });
    const finalBobAccount = await this.rewardsType2.userInfo(bob);
    const rewardsType0Balance = await this.dant.balanceOf(
      this.rewardsType2.address
    );
    const bobBalance = await this.dant.balanceOf(bob);
    const bobRequest = await this.rewardsType2.unstakeRequests(bob, 0);
    assert.equal(rewardsType0Balance, 0);
    assert.ok(
      bobBalance
        .sub(toBN(toWei("578.7037037")))
        .sub(toBN(amount))
        .lte(toBN(1e13))
    );
    assert.equal(finalBobAccount.amount, 0);
    assert.equal(finalBobAccount.unfrozen, 0);
    assert.equal(bobRequest.amount, amount);
    assert.equal(bobRequest.status, 2);
  });

  it("should fail to withdraw deposit before period ended", async function () {
    this.retries(4);
    const amount = toWei("1000");
    await this.dant.transfer(bob, amount, { from: alice });
    await this.dant.approve(this.rewardsType2.address, amount, { from: bob });
    await this.rewardsType2.stake(amount, this.referralRoot, { from: bob });
    const initBobAccount = await this.rewardsType2.userInfo(bob);
    await time.increaseTo(initBobAccount.lastUpdate.toNumber() + 10000000);
    await this.rewardsType2.unstake(0, { from: bob });
    await this.rewardsType2.stake(0, this.referralRoot, { from: bob });
  });

  it("should apply middle referral rates if total staked 5000 > amount > 2000", async function () {
    this.retries(10);
    const addressNull = "0x0000000000000000000000000000000000000000";
    const amount = toWei("1000");
    const referralMinStake = toWei("3000");
    await this.dant.transfer(bob, amount, { from: alice });
    await this.dant.transfer(eve, referralMinStake, { from: alice });
    await this.dant.transfer(david, referralMinStake, { from: alice });
    await this.dant.transfer(carol, referralMinStake, { from: alice });
    await this.dant.approve(this.rewardsType2.address, referralMinStake, {
      from: eve,
    });
    await this.dant.approve(this.rewardsType2.address, referralMinStake, {
      from: david,
    });
    await this.dant.approve(this.rewardsType2.address, referralMinStake, {
      from: carol,
    });
    await this.rewardsType2.stake(referralMinStake, this.referralRoot, {
      from: eve,
    });
    await this.rewardsType2.stake(referralMinStake, eve, {
      from: david,
    });
    await this.rewardsType2.stake(referralMinStake, david, {
      from: carol,
    });
    await this.dant.approve(this.rewardsType2.address, amount, { from: bob });
    await this.rewardsType2.stake(amount, carol, { from: bob });
    const initBobAccount = await this.rewardsType2.userInfo(bob);
    await time.increaseTo(initBobAccount.lastUpdate.toNumber() + 10000000);
    await this.referralRewards.claimDividends({
      from: carol,
    });
    await this.referralRewards.claimDividends({
      from: david,
    });
    await this.referralRewards.claimDividends({
      from: eve,
    });
    const carolReferralReward = toBN(await this.dant.balanceOf(carol));
    const davidReferralReward = toBN(await this.dant.balanceOf(david));
    const eveReferralReward = toBN(await this.dant.balanceOf(eve));
    const carolReward = toBN(toWei("28.935185185"));
    const davidReward = toBN(toWei("95.48612065911111105")); // 8.6805555555 + 86.805555555 + 165 * 57870370370/1e18
    const eveReward = toBN(toWei("117.187511717999999925")); // 4.34027777775 + 86.805555555 + 26.0416666665 + 202.5 * 57870370370/1e18
    assert.ok(carolReferralReward.sub(carolReward).abs().lte(toBN(1e13)));
    assert.ok(davidReferralReward.sub(davidReward).abs().lte(toBN(1e13)));
    assert.ok(eveReferralReward.sub(eveReward).abs().lte(toBN(1e13)));
  });

  it("should apply higher referral rates if total staked amount > 5000", async function () {
    this.retries(10);
    const addressNull = "0x0000000000000000000000000000000000000000";
    const amount = toWei("1000");
    const referralMinStake = toWei("6000");
    await this.dant.transfer(bob, amount, { from: alice });
    await this.dant.transfer(eve, referralMinStake, { from: alice });
    await this.dant.transfer(david, referralMinStake, { from: alice });
    await this.dant.transfer(carol, referralMinStake, { from: alice });
    await this.dant.approve(this.rewardsType2.address, referralMinStake, {
      from: eve,
    });
    await this.dant.approve(this.rewardsType2.address, referralMinStake, {
      from: david,
    });
    await this.dant.approve(this.rewardsType2.address, referralMinStake, {
      from: carol,
    });
    await this.rewardsType2.stake(referralMinStake, this.referralRoot, {
      from: eve,
    });
    await this.rewardsType2.stake(referralMinStake, eve, {
      from: david,
    });
    await this.rewardsType2.stake(referralMinStake, david, {
      from: carol,
    });
    await this.dant.approve(this.rewardsType2.address, amount, { from: bob });
    await this.rewardsType2.stake(amount, carol, { from: bob });
    const initBobAccount = await this.rewardsType2.userInfo(bob);
    await time.increaseTo(initBobAccount.lastUpdate.toNumber() + 10000000);
    await this.referralRewards.claimDividends({
      from: carol,
    });
    await this.referralRewards.claimDividends({
      from: david,
    });
    await this.referralRewards.claimDividends({
      from: eve,
    });
    const carolReferralReward = toBN(await this.dant.balanceOf(carol));
    const davidReferralReward = toBN(await this.dant.balanceOf(david));
    const eveReferralReward = toBN(await this.dant.balanceOf(eve));
    const carolReward = toBN(toWei("34.722222222"));
    const davidReward = toBN(toWei("219.9074293967407406")); // 11.574074074 + 208.333333332 + 380 * 57870370370/1e18
    const eveReward = toBN(toWei("283.5648431694814813")); // 5.787037037 + 208.333333332 + 69.444444444 + 490 * 57870370370/1e18
    assert.ok(carolReferralReward.sub(carolReward).abs().lte(toBN(1e13)));
    assert.ok(davidReferralReward.sub(davidReward).abs().lte(toBN(1e13)));
    assert.ok(eveReferralReward.sub(eveReward).abs().lte(toBN(1e13)));
  });

  it("should proccess few deposits and end them separately", async function () {
    this.retries(4);
    const finalAmount = toWei("6000");
    await this.dant.transfer(bob, finalAmount, { from: alice });
    let amount = toWei("1000");
    await this.referralTree.setReferral(eve, this.referralRoot, {
      from: alice,
    });
    await this.rewardsType2.stake(0, eve, { from: david });
    await this.rewardsType2.stake(0, david, { from: carol });
    await this.dant.approve(this.rewardsType2.address, finalAmount, {
      from: bob,
    });
    await this.rewardsType2.stake(amount, carol, { from: bob });
    let bobAccount = await this.rewardsType2.userInfo(bob);
    await time.increaseTo(bobAccount.lastUpdate.toNumber() + 4320000);
    amount = toWei("2000");
    await this.rewardsType2.stake(amount, carol, { from: bob });
    bobAccount = await this.rewardsType2.userInfo(bob);
    await time.increaseTo(bobAccount.lastUpdate.toNumber() + 4320000);
    amount = toWei("3000");
    await this.rewardsType2.stake(amount, carol, { from: bob });
    bobAccount = await this.rewardsType2.userInfo(bob);
    assert.equal(bobAccount.depositHead, 0);
    assert.equal(bobAccount.depositTail, 3);
    await time.increaseTo(bobAccount.lastUpdate.toNumber() + 4320001);
    await this.rewardsType2.unstake(toWei("1000"), { from: bob });
    bobAccount = await this.rewardsType2.userInfo(bob);
    let rewardsType0Balance = await this.dant.balanceOf(
      this.rewardsType2.address
    );
    assert.equal(rewardsType0Balance.toString(), toWei("6000"));
    assert.equal(bobAccount.amount, toWei("5000"));
    assert.equal(bobAccount.depositHead, 0);
    assert.equal(bobAccount.depositTail, 3);
    await time.increaseTo(bobAccount.lastUpdate.toNumber() + 4320000);
    await this.rewardsType2.unstake(toWei("2000"), { from: bob });
    bobAccount = await this.rewardsType2.userInfo(bob);
    rewardsType0Balance = await this.dant.balanceOf(this.rewardsType2.address);
    assert.equal(rewardsType0Balance.toString(), toWei("5000"));
    assert.equal(bobAccount.amount, toWei("3000"));
    assert.equal(bobAccount.depositHead, 0);
    assert.equal(bobAccount.depositTail, 3);
    await time.increaseTo(bobAccount.lastUpdate.toNumber() + 4320001);
    await this.rewardsType2.unstake(toWei("3000"), { from: bob });
    bobAccount = await this.rewardsType2.userInfo(bob);
    rewardsType0Balance = await this.dant.balanceOf(this.rewardsType2.address);
    assert.equal(rewardsType0Balance.toString(), toWei("3000"));
    assert.equal(bobAccount.amount, toWei("0"));
    assert.equal(bobAccount.depositHead, 0);
    assert.equal(bobAccount.depositTail, 3);
  });
});
