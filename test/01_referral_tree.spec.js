const { expectRevert } = require("@openzeppelin/test-helpers");
const ReferralTree = artifacts.require("ReferralTree");
const ReferralRewards = artifacts.require("ReferralRewards");

contract(
  "ReferralTree",
  function ([alice, bob, carol, dave, eve, frank, grace]) {
    beforeEach(async function () {
      this.referralTree = await ReferralTree.new(grace, { from: alice });
      const rewardsRole = await this.referralTree.REWARDS_ROLE();
      await this.referralTree.grantRole(rewardsRole, alice, { from: alice });
    });

    it("should only allow admins to add new referrals", async function () {
      await this.referralTree.setReferral(carol, grace, { from: alice });
      await this.referralTree.setReferral(bob, carol, { from: alice });
      await this.referralTree.setReferral(alice, bob, { from: alice });
      await expectRevert(
        this.referralTree.setReferral(carol, alice, { from: bob }),
        "setReferral: bad role"
      );
      const aliceReferral = await this.referralTree.referrals(alice);
      const bobReferral = await this.referralTree.referrals(bob);
      assert.equal(aliceReferral, bob);
      assert.equal(bobReferral, carol);
    });

    it("should build the propper referral tree", async function () {
      await this.referralTree.setReferral(frank, grace, { from: alice });
      await this.referralTree.setReferral(eve, frank, { from: alice });
      await this.referralTree.setReferral(dave, eve, { from: alice });
      await this.referralTree.setReferral(carol, dave, { from: alice });
      await this.referralTree.setReferral(bob, carol, { from: alice });
      await this.referralTree.setReferral(alice, bob, { from: alice });
      const aliceReferrals = await this.referralTree.getReferrals(alice, 3);
      const bobReferrals = await this.referralTree.getReferrals(bob, 3);
      const carolReferrals = await this.referralTree.getReferrals(carol, 3);
      const daveReferrals = await this.referralTree.getReferrals(dave, 3);
      const eveReferrals = await this.referralTree.getReferrals(eve, 3);
      const addressNull = "0x0000000000000000000000000000000000000000";
      assert.deepEqual(aliceReferrals, [bob, carol, dave]);
      assert.deepEqual(bobReferrals, [carol, dave, eve]);
      assert.deepEqual(carolReferrals, [dave, eve, frank]);
      assert.deepEqual(daveReferrals, [eve, frank, grace]);
      assert.deepEqual(eveReferrals, [frank, grace, addressNull]);
    });

    it("should only allow referral from the tree", async function () {
      await expectRevert(
        this.referralTree.setReferral(bob, alice, { from: alice }),
        "setReferral: not registered referral"
      );
    });

    it("should left the first referral if update is tried", async function () {
      const addressNull = "0x0000000000000000000000000000000000000000";
      await this.referralTree.setReferral(carol, grace, { from: alice });
      await this.referralTree.setReferral(bob, carol, { from: alice });
      await this.referralTree.setReferral(alice, bob, { from: alice });
      await this.referralTree.setReferral(bob, alice, { from: alice });
      const bobReferrals = await this.referralTree.getReferrals(bob, 3);
      assert.deepEqual(bobReferrals, [carol, grace, addressNull]);
    });

    it("shouldn't assept 0 referral", async function () {
      const addressNull = "0x0000000000000000000000000000000000000000";
      await expectRevert(
        this.referralTree.setReferral(bob, addressNull, { from: alice }),
        "setReferral: not registered referral"
      );
    });

    it("should add and remove referral reward", async function () {
      const addressNull = "0x0000000000000000000000000000000000000000";
      const referralRewardsInstance = await ReferralRewards.new(
        addressNull,
        addressNull,
        addressNull,
        [5000, 2000, 0],
        [
          [6, 2, 1],
          [5, 15, 75],
          [4, 1, 5],
        ],
        [
          [6, 2, 1],
          [5, 15, 75],
          [4, 1, 5],
        ],
        { from: alice }
      );
      await this.referralTree.addReferralReward(
        referralRewardsInstance.address.toString(),
        {
          from: alice,
        }
      );
      const referralRewards = await this.referralTree.getReferralRewards();
      assert.deepEqual(referralRewards, [
        referralRewardsInstance.address.toString(),
      ]);
      await this.referralTree.removeReferralReward(
        referralRewardsInstance.address.toString(),
        {
          from: alice,
        }
      );
      const updatedReferralRewards = await this.referralTree.getReferralRewards();
      assert.deepEqual(updatedReferralRewards, []);
    });

    it("should change admin properly", async function () {
      const defaultAdminRole = await this.referralTree.DEFAULT_ADMIN_ROLE();
      await this.referralTree.changeAdmin(bob, {
        from: alice,
      });
      const adminCount = await this.referralTree.getRoleMemberCount(
        defaultAdminRole
      );
      assert.equal(adminCount, 1);
      const admin = await this.referralTree.getRoleMember(defaultAdminRole, 0);
      assert.equal(admin, bob);
      await expectRevert(
        this.referralTree.changeAdmin(carol, {
          from: alice,
        }),
        "changeAdmin: bad role"
      );
      await this.referralTree.changeAdmin(carol, {
        from: bob,
      });
      const newAdminCount = await this.referralTree.getRoleMemberCount(
        defaultAdminRole
      );
      assert.equal(newAdminCount, 1);
      const newAdmin = await this.referralTree.getRoleMember(
        defaultAdminRole,
        0
      );
      assert.equal(newAdmin, carol);
    });
  }
);
