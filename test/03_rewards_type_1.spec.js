const { expectRevert, time } = require("@openzeppelin/test-helpers");
const { web3 } = require("@openzeppelin/test-helpers/src/setup");
const { bnArrayToString, toWei, toBN } = require("./utils");
const dANT = artifacts.require("dANT");
const ReferralRewards = artifacts.require("ReferralRewards");
const ReferralTree = artifacts.require("ReferralTree");
const RewardsType1 = artifacts.require("RewardsType1");

contract("RewardsType1", function ([alice, bob, carol, david, eve, frank]) {
  beforeEach(async function () {
    this.dant = await dANT.new(5000000, { from: alice });
    this.referralRoot = frank;
    this.referralTree = await ReferralTree.new(this.referralRoot, {
      from: alice,
    });
    this.rewardsType1 = await RewardsType1.new(
      this.dant.address,
      this.referralTree.address,
      { from: alice }
    );
    this.referralRewards = await ReferralRewards.at(
      await this.rewardsType1.referralRewards()
    );
    const minterRole = await this.dant.MINTER_ROLE();
    const rewardsRole = await this.referralTree.REWARDS_ROLE();
    await this.dant.grantRole(minterRole, this.rewardsType1.address, {
      from: alice,
    });
    await this.dant.grantRole(minterRole, this.referralRewards.address, {
      from: alice,
    });
    await this.referralTree.grantRole(rewardsRole, alice, { from: alice });
    await this.referralTree.addReferralReward(this.referralRewards.address);
  });

  it("should have correct initial configurations", async function () {
    const token = await this.rewardsType1.token();
    const referralTree = await this.referralRewards.referralTree();
    const depositBounds = await this.referralRewards.getDepositBounds();
    const depositRate = await this.referralRewards.getDepositRates();
    const stakingRate = await this.referralRewards.getStakingRates();
    const duration = await this.rewardsType1.duration();
    const rewardPerSec = await this.rewardsType1.rewardPerSec();
    assert.equal(token, this.dant.address);
    assert.equal(referralTree, this.referralTree.address);
    assert.deepEqual(bnArrayToString(depositBounds), [
      toWei("5000"),
      toWei("2000"),
      toWei("100"),
    ]);
    assert.deepEqual(bnArrayToString(depositRate), [
      [toWei("0.06"), toWei("0.02"), toWei("0.01")],
      [toWei("0.05"), toWei("0.015"), toWei("0.0075")],
      [toWei("0.04"), toWei("0.01"), toWei("0.005")],
    ]);
    assert.deepEqual(bnArrayToString(stakingRate), [
      [toWei("0.06"), toWei("0.02"), toWei("0.01")],
      [toWei("0.05"), toWei("0.015"), toWei("0.0075")],
      [toWei("0.04"), toWei("0.01"), toWei("0.005")],
    ]);
    assert.equal(duration, "12960000");
    assert.equal(rewardPerSec, "86805555556");
  });

  it("should record deposit and assept no referral", async function () {
    const addressNull = "0x0000000000000000000000000000000000000000";
    const amount = toWei("1000");
    await this.dant.transfer(bob, amount, { from: alice });
    await this.dant.approve(this.rewardsType1.address, amount, { from: bob });
    await this.rewardsType1.stake(amount, this.referralRoot, { from: bob });
    const bobAccount = await this.rewardsType1.userInfo(bob);
    const bobDeposit = await this.rewardsType1.getDeposit(bob, 0);
    const totalStake = await this.rewardsType1.totalStake();
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
    assert.equal(
      bobDeposit[1].toNumber(),
      (await time.latest()).toNumber() + 12960000
    );
    assert.equal(totalStake, amount);
  });

  it("should set referral during the deposit", async function () {
    const addressNull = "0x0000000000000000000000000000000000000000";
    const amount = toWei("1000");
    await this.dant.transfer(bob, amount, { from: alice });
    await this.dant.approve(this.rewardsType1.address, amount, { from: bob });
    await this.rewardsType1.stake(amount, this.referralRoot, { from: bob });
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
    await this.dant.approve(this.rewardsType1.address, amount, { from: bob });
    await this.rewardsType1.stake(amount, this.referralRoot, { from: bob });
    const bobAccount = await this.rewardsType1.userInfo(bob);
    const totalStake = await this.rewardsType1.totalStake();
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
    this.retries(5);
    const addressNull = "0x0000000000000000000000000000000000000000";
    const amount = toWei("1000");
    await this.dant.transfer(bob, amount, { from: alice });
    await this.dant.approve(this.rewardsType1.address, amount, { from: bob });
    await this.rewardsType1.stake(amount, this.referralRoot, { from: bob });
    const initBobAccount = await this.rewardsType1.userInfo(bob);
    await time.increaseTo(initBobAccount.lastUpdate.toNumber() + 6480000);
    await this.rewardsType1.stake(0, addressNull, { from: bob });
    const finalBobAccount = await this.rewardsType1.userInfo(bob);
    const scaledReward = toWei("562.50000000288");
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
    await this.dant.approve(this.rewardsType1.address, referralMinStake, {
      from: eve,
    });
    await this.dant.approve(this.rewardsType1.address, referralMinStake, {
      from: david,
    });
    await this.dant.approve(this.rewardsType1.address, referralMinStake, {
      from: carol,
    });
    await this.rewardsType1.stake(referralMinStake, this.referralRoot, {
      from: eve,
    });
    await this.rewardsType1.stake(referralMinStake, eve, {
      from: david,
    });
    await this.rewardsType1.stake(referralMinStake, david, {
      from: carol,
    });
    await this.dant.approve(this.rewardsType1.address, amount, { from: bob });
    await this.rewardsType1.stake(amount, carol, { from: bob });
    const initBobAccount = await this.rewardsType1.userInfo(bob);
    await time.increaseTo(initBobAccount.lastUpdate.toNumber() + 6480000);
    const carolReferralReward = toBN(
      await this.referralRewards.getReferralReward(carol)
    );
    const davidReferralReward = toBN(
      await this.referralRewards.getReferralReward(david)
    );
    const eveReferralReward = toBN(
      await this.referralRewards.getReferralReward(eve)
    );
    const carolReward = toBN(toWei("62.5000000001152"));
    const davidReward = toBN(toWei("21.87500000004032")); // 15.6250000000288 + 6.25000000001152
    const eveReward = toBN(toWei("15.6250000000288")); // 7.8125000000144 + 6.25000000001152 + 1.56250000000288
    assert.ok(carolReferralReward.sub(carolReward).abs().lte(toBN(1e13)));
    assert.ok(davidReferralReward.sub(davidReward).abs().lte(toBN(1e13)));
    assert.ok(eveReferralReward.sub(eveReward).abs().lte(toBN(1e13)));
  });

  it("should claim user reward properly after half period", async function () {
    this.retries(4);
    const amount = toWei("1000");
    await this.dant.transfer(bob, amount, { from: alice });
    await this.dant.approve(this.rewardsType1.address, amount, { from: bob });
    await this.rewardsType1.stake(amount, this.referralRoot, { from: bob });
    const initBobAccount = await this.rewardsType1.userInfo(bob);
    await time.increaseTo(initBobAccount.lastUpdate.toNumber() + 6480000);
    await this.rewardsType1.stake(0, this.referralRoot, { from: bob });
    const finalBobAccount = await this.rewardsType1.userInfo(bob);
    const finalBobBalance = await this.dant.balanceOf(bob);
    const reward = toWei("562.50000000288");
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
    await this.dant.approve(this.rewardsType1.address, referralMinStake, {
      from: eve,
    });
    await this.dant.approve(this.rewardsType1.address, referralMinStake, {
      from: david,
    });
    await this.dant.approve(this.rewardsType1.address, referralMinStake, {
      from: carol,
    });
    await this.rewardsType1.stake(referralMinStake, this.referralRoot, {
      from: eve,
    });
    await this.rewardsType1.stake(referralMinStake, eve, {
      from: david,
    });
    await this.rewardsType1.stake(referralMinStake, david, {
      from: carol,
    });
    await this.dant.approve(this.rewardsType1.address, amount, { from: bob });
    await this.rewardsType1.stake(amount, carol, { from: bob });
    const initBobAccount = await this.rewardsType1.userInfo(bob);
    await time.increaseTo(initBobAccount.lastUpdate.toNumber() + 6480000);
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
    const carolReward = toBN(toWei("62.5000000001152"));
    const davidReward = toBN(toWei("21.87500000004032")); // 15.6250000000288 + 6.25000000001152
    const eveReward = toBN(toWei("15.6250008680843556")); // 7.8125000000144 + 6.25000000001152 + 1.56250000000288 + 0.0000008680555556
    assert.ok(carolReferralReward.sub(carolReward).abs().lte(toBN(1e13)));
    assert.ok(davidReferralReward.sub(davidReward).abs().lte(toBN(1e13)));
    assert.ok(eveReferralReward.sub(eveReward).abs().lte(toBN(1e13)));
  });

  it("should assess user reward after period ended", async function () {
    this.retries(4);
    const addressNull = "0x0000000000000000000000000000000000000000";
    const amount = toWei("1000");
    await this.dant.transfer(bob, amount, { from: alice });
    await this.dant.approve(this.rewardsType1.address, amount, { from: bob });
    await this.rewardsType1.stake(amount, this.referralRoot, { from: bob });
    const initBobAccount = await this.rewardsType1.userInfo(bob);
    await time.increaseTo(initBobAccount.lastUpdate.toNumber() + 12960000);
    await this.rewardsType1.stake(0, addressNull, { from: bob });
    const scaledReward = toWei("1125.00000000576");
    const bobAccount = await this.rewardsType1.userInfo(bob);
    // assert.equal(bobAccount.amount, amount);
    assert.equal(bobAccount.reward.toString(), scaledReward);
    await time.increase(100);
    await this.rewardsType1.stake(0, addressNull, { from: bob });
    const finalBobAccount = await this.rewardsType1.userInfo(bob);
    const rewardsType0Balance = await this.dant.balanceOf(
      this.rewardsType1.address
    );
    assert.equal(rewardsType0Balance, 0);
    assert.equal(finalBobAccount.amount, 0);
    // assert.equal(finalBobAccount.unfrozen, amount);
    assert.equal(finalBobAccount.reward.toString(), scaledReward);
    assert.equal(
      finalBobAccount.lastUpdate.toString(),
      (await time.latest()).toString()
    );
    assert.equal(finalBobAccount.depositHead, 1);
    assert.equal(finalBobAccount.depositTail, 1);
  });

  it("should withdraw user deposit after period ended", async function () {
    this.retries(4);
    const addressNull = "0x0000000000000000000000000000000000000000";
    const amount = toWei("1000");
    await this.dant.transfer(bob, amount, { from: alice });
    await this.dant.approve(this.rewardsType1.address, amount, { from: bob });
    await this.rewardsType1.stake(amount, this.referralRoot, { from: bob });
    const initBobAccount = await this.rewardsType1.userInfo(bob);
    await time.increaseTo(initBobAccount.lastUpdate.toNumber() + 12960001);
    await this.rewardsType1.stake(0, addressNull, { from: bob });
    const bobAccount = await this.rewardsType1.userInfo(bob);
    // assert.equal(bobAccount.unfrozen.toString(), amount);
    await time.increase(100);
    await this.rewardsType1.stake(0, addressNull, { from: bob });
    const finalBobAccount = await this.rewardsType1.userInfo(bob);
    const rewardsType0Balance = await this.dant.balanceOf(
      this.rewardsType1.address
    );
    const bobBalance = toBN(await this.dant.balanceOf(bob));
    assert.equal(rewardsType0Balance, 0);
    assert.ok(
      bobBalance
        .sub(toBN(toWei("2250.00000001152")))
        .sub(toBN(amount))
        .lte(toBN(1e13))
    );
    assert.equal(finalBobAccount.amount, 0);
    assert.equal(finalBobAccount.unfrozen, 0);
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
    await this.dant.approve(this.rewardsType1.address, referralMinStake, {
      from: eve,
    });
    await this.dant.approve(this.rewardsType1.address, referralMinStake, {
      from: david,
    });
    await this.dant.approve(this.rewardsType1.address, referralMinStake, {
      from: carol,
    });
    await this.rewardsType1.stake(referralMinStake, this.referralRoot, {
      from: eve,
    });
    await this.rewardsType1.stake(referralMinStake, eve, {
      from: david,
    });
    await this.rewardsType1.stake(referralMinStake, david, {
      from: carol,
    });
    await this.dant.approve(this.rewardsType1.address, amount, { from: bob });
    await this.rewardsType1.stake(amount, carol, { from: bob });
    const initBobAccount = await this.rewardsType1.userInfo(bob);
    await time.increaseTo(initBobAccount.lastUpdate.toNumber() + 6480000);
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
    const carolReward = toBN(toWei("78.125000000144"));
    const davidReward = toBN(toWei("257.81251432339186674")); // 23.4375000000432 + 234.375000000432 + 165*86805555556/1e18
    const eveReward = toBN(toWei("316.40626757870820009")); // 11.7187500000216 + 234.375000000432 + 70.3125000001296 + 202.5*86805555556/1e18
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
    await this.dant.approve(this.rewardsType1.address, referralMinStake, {
      from: eve,
    });
    await this.dant.approve(this.rewardsType1.address, referralMinStake, {
      from: david,
    });
    await this.dant.approve(this.rewardsType1.address, referralMinStake, {
      from: carol,
    });
    await this.rewardsType1.stake(referralMinStake, this.referralRoot, {
      from: eve,
    });
    await this.rewardsType1.stake(referralMinStake, eve, {
      from: david,
    });
    await this.rewardsType1.stake(referralMinStake, david, {
      from: carol,
    });
    await this.dant.approve(this.rewardsType1.address, amount, { from: bob });
    await this.rewardsType1.stake(amount, carol, { from: bob });
    const initBobAccount = await this.rewardsType1.userInfo(bob);
    await time.increaseTo(initBobAccount.lastUpdate.toNumber() + 6480000);
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
    const carolReward = toBN(toWei("93.7500000001728"));
    const davidReward = toBN(toWei("593.75003298720551128")); // 31.2500000000576 + 562.5000000010368 + 380*86805555556/1e18
    const eveReward = toBN(toWei("765.62504253613342244")); // 15.6250000000288 + 562.5000000010368 + 187.5000000003456 + 490*86805555556/1e18
    assert.ok(carolReferralReward.sub(carolReward).abs().lte(toBN(1e13)));
    assert.ok(davidReferralReward.sub(davidReward).abs().lte(toBN(1e13)));
    assert.ok(eveReferralReward.sub(eveReward).abs().lte(toBN(1e13)));
  });

  it("should proccess few deposits and end them separately", async function () {
    this.retries(4);
    const finalAmount = toWei("6000");
    await this.dant.transfer(bob, finalAmount, { from: alice });
    await this.referralTree.setReferral(eve, this.referralRoot, {
      from: alice,
    });
    let amount = toWei("1000");
    await this.rewardsType1.stake(0, eve, { from: david });
    await this.rewardsType1.stake(0, david, { from: carol });
    await this.dant.approve(this.rewardsType1.address, finalAmount, {
      from: bob,
    });
    await this.rewardsType1.stake(amount, carol, { from: bob });
    let bobAccount = await this.rewardsType1.userInfo(bob);
    await time.increaseTo(bobAccount.lastUpdate.toNumber() + 4320000);
    amount = toWei("2000");
    await this.rewardsType1.stake(amount, carol, { from: bob });
    bobAccount = await this.rewardsType1.userInfo(bob);
    await time.increaseTo(bobAccount.lastUpdate.toNumber() + 4320000);
    amount = toWei("3000");
    await this.rewardsType1.stake(amount, carol, { from: bob });
    bobAccount = await this.rewardsType1.userInfo(bob);
    assert.equal(bobAccount.depositHead, 0);
    assert.equal(bobAccount.depositTail, 3);
    await time.increaseTo(bobAccount.lastUpdate.toNumber() + 4320001);
    await this.rewardsType1.stake(0, this.referralRoot, { from: bob });
    bobAccount = await this.rewardsType1.userInfo(bob);
    let rewardsType0Balance = await this.dant.balanceOf(
      this.rewardsType1.address
    );
    assert.equal(rewardsType0Balance.toString(), toWei("5000"));
    assert.equal(bobAccount.amount, toWei("5000"));
    assert.equal(bobAccount.depositHead, 1);
    assert.equal(bobAccount.depositTail, 3);
    await time.increaseTo(bobAccount.lastUpdate.toNumber() + 4320000);
    await this.rewardsType1.stake(0, this.referralRoot, { from: bob });
    bobAccount = await this.rewardsType1.userInfo(bob);
    rewardsType0Balance = await this.dant.balanceOf(this.rewardsType1.address);
    assert.equal(rewardsType0Balance.toString(), toWei("3000"));
    assert.equal(bobAccount.amount, toWei("3000"));
    assert.equal(bobAccount.depositHead, 2);
    assert.equal(bobAccount.depositTail, 3);
    await time.increaseTo(bobAccount.lastUpdate.toNumber() + 4320001);
    await this.rewardsType1.stake(0, this.referralRoot, { from: bob });
    bobAccount = await this.rewardsType1.userInfo(bob);
    rewardsType0Balance = await this.dant.balanceOf(this.rewardsType1.address);
    assert.equal(rewardsType0Balance.toString(), toWei("0"));
    assert.equal(bobAccount.amount, toWei("0"));
    assert.equal(bobAccount.depositHead, 3);
    assert.equal(bobAccount.depositTail, 3);
  });
});
