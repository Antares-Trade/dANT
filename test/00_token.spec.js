const { expectRevert } = require("@openzeppelin/test-helpers");
const dANT = artifacts.require("dANT");

contract("dANT", function ([alice, bob, carol]) {
  beforeEach(async function () {
    this.dant = await dANT.new(5000000, { from: alice });
    const minterRole = await this.dant.MINTER_ROLE();
    await this.dant.grantRole(minterRole, alice, { from: alice });
  });

  it("should have correct name and symbol and decimal", async function () {
    const name = await this.dant.name();
    const symbol = await this.dant.symbol();
    const decimals = await this.dant.decimals();
    assert.equal(name, "Digital Antares Dollar");
    assert.equal(symbol, "dANT");
    assert.equal(decimals, "18");
  });

  it("should only allow minters to mint new tokens", async function () {
    const initSupply = await this.dant.totalSupply();
    assert.equal(initSupply, "5000000000000000000000000");
    await this.dant.mint(alice, "100", { from: alice });
    await this.dant.mint(bob, "1000", { from: alice });
    await expectRevert(
      this.dant.mint(carol, "1000", { from: bob }),
      "mint: bad role"
    );
    const totalSupply = await this.dant.totalSupply();
    const aliceBal = await this.dant.balanceOf(alice);
    const bobBal = await this.dant.balanceOf(bob);
    const carolBal = await this.dant.balanceOf(carol);
    assert.equal(totalSupply, "5000000000000000000001100");
    assert.equal(aliceBal, "5000000000000000000000100");
    assert.equal(bobBal, "1000");
    assert.equal(carolBal, "0");
  });

  it("should supply token transfers properly", async function () {
    const initSupply = await this.dant.totalSupply();
    assert.equal(initSupply, "5000000000000000000000000");
    await this.dant.mint(alice, "100", { from: alice });
    await this.dant.mint(bob, "1000", { from: alice });
    await this.dant.transfer(carol, "10", { from: alice });
    await this.dant.transfer(carol, "100", { from: bob });
    const totalSupply = await this.dant.totalSupply();
    const aliceBal = await this.dant.balanceOf(alice);
    const bobBal = await this.dant.balanceOf(bob);
    const carolBal = await this.dant.balanceOf(carol);
    assert.equal(totalSupply, "5000000000000000000001100");
    assert.equal(aliceBal, "5000000000000000000000090");
    assert.equal(bobBal, "900");
    assert.equal(carolBal, "110");
  });

  it("should fail if you try to do bad transfers", async function () {
    await this.dant.mint(carol, "100", { from: alice });
    await expectRevert(
      this.dant.transfer(alice, "110", { from: carol }),
      "ERC20: transfer amount exceeds balance"
    );
    await expectRevert(
      this.dant.transfer(carol, "1", { from: bob }),
      "ERC20: transfer amount exceeds balance"
    );
  });
});
