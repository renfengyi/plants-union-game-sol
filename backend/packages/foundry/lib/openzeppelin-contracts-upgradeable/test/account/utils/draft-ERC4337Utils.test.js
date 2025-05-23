const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { packValidationData, UserOperation } = require('../../helpers/erc4337');
const { deployEntrypoint } = require('../../helpers/erc4337-entrypoint');
const { MAX_UINT48 } = require('../../helpers/constants');
const ADDRESS_ONE = '0x0000000000000000000000000000000000000001';

const fixture = async () => {
  const { entrypoint } = await deployEntrypoint();
  const [authorizer, sender, factory, paymaster] = await ethers.getSigners();
  const utils = await ethers.deployContract('$ERC4337Utils');
  const SIG_VALIDATION_SUCCESS = await utils.$SIG_VALIDATION_SUCCESS();
  const SIG_VALIDATION_FAILED = await utils.$SIG_VALIDATION_FAILED();
  return { utils, authorizer, sender, entrypoint, factory, paymaster, SIG_VALIDATION_SUCCESS, SIG_VALIDATION_FAILED };
};

describe('ERC4337Utils', function () {
  beforeEach(async function () {
    Object.assign(this, await loadFixture(fixture));
  });

  describe('parseValidationData', function () {
    it('parses the validation data', async function () {
      const authorizer = this.authorizer;
      const validUntil = 0x12345678n;
      const validAfter = 0x9abcdef0n;
      const validationData = packValidationData(validAfter, validUntil, authorizer);

      expect(this.utils.$parseValidationData(validationData)).to.eventually.deep.equal([
        authorizer.address,
        validAfter,
        validUntil,
      ]);
    });

    it('returns an type(uint48).max if until is 0', async function () {
      const authorizer = this.authorizer;
      const validAfter = 0x12345678n;
      const validationData = packValidationData(validAfter, 0, authorizer);

      expect(this.utils.$parseValidationData(validationData)).to.eventually.deep.equal([
        authorizer.address,
        validAfter,
        MAX_UINT48,
      ]);
    });

    it('parse canonical values', async function () {
      expect(this.utils.$parseValidationData(this.SIG_VALIDATION_SUCCESS)).to.eventually.deep.equal([
        ethers.ZeroAddress,
        0n,
        MAX_UINT48,
      ]);

      expect(this.utils.$parseValidationData(this.SIG_VALIDATION_FAILED)).to.eventually.deep.equal([
        ADDRESS_ONE,
        0n,
        MAX_UINT48,
      ]);
    });
  });

  describe('packValidationData', function () {
    it('packs the validation data', async function () {
      const authorizer = this.authorizer;
      const validUntil = 0x12345678n;
      const validAfter = 0x9abcdef0n;
      const validationData = packValidationData(validAfter, validUntil, authorizer);

      expect(
        this.utils.$packValidationData(ethers.Typed.address(authorizer), validAfter, validUntil),
      ).to.eventually.equal(validationData);
    });

    it('packs the validation data (bool)', async function () {
      const success = false;
      const validUntil = 0x12345678n;
      const validAfter = 0x9abcdef0n;
      const validationData = packValidationData(validAfter, validUntil, false);

      expect(this.utils.$packValidationData(ethers.Typed.bool(success), validAfter, validUntil)).to.eventually.equal(
        validationData,
      );
    });

    it('packing reproduced canonical values', async function () {
      expect(this.utils.$packValidationData(ethers.Typed.address(ethers.ZeroAddress), 0n, 0n)).to.eventually.equal(
        this.SIG_VALIDATION_SUCCESS,
      );
      expect(this.utils.$packValidationData(ethers.Typed.bool(true), 0n, 0n)).to.eventually.equal(
        this.SIG_VALIDATION_SUCCESS,
      );
      expect(this.utils.$packValidationData(ethers.Typed.address(ADDRESS_ONE), 0n, 0n)).to.eventually.equal(
        this.SIG_VALIDATION_FAILED,
      );
      expect(this.utils.$packValidationData(ethers.Typed.bool(false), 0n, 0n)).to.eventually.equal(
        this.SIG_VALIDATION_FAILED,
      );
    });
  });

  describe('combineValidationData', function () {
    const validUntil1 = 0x12345678n;
    const validAfter1 = 0x9abcdef0n;
    const validUntil2 = 0x87654321n;
    const validAfter2 = 0xabcdef90n;

    it('combines the validation data', async function () {
      const validationData1 = packValidationData(validAfter1, validUntil1, ethers.ZeroAddress);
      const validationData2 = packValidationData(validAfter2, validUntil2, ethers.ZeroAddress);
      const expected = packValidationData(validAfter2, validUntil1, true);

      // check symmetry
      expect(this.utils.$combineValidationData(validationData1, validationData2)).to.eventually.equal(expected);
      expect(this.utils.$combineValidationData(validationData2, validationData1)).to.eventually.equal(expected);
    });

    for (const [authorizer1, authorizer2] of [
      [ethers.ZeroAddress, '0xbf023313b891fd6000544b79e353323aa94a4f29'],
      ['0xbf023313b891fd6000544b79e353323aa94a4f29', ethers.ZeroAddress],
    ]) {
      it('returns SIG_VALIDATION_FAILURE if one of the authorizers is not address(0)', async function () {
        const validationData1 = packValidationData(validAfter1, validUntil1, authorizer1);
        const validationData2 = packValidationData(validAfter2, validUntil2, authorizer2);
        const expected = packValidationData(validAfter2, validUntil1, false);

        // check symmetry
        expect(this.utils.$combineValidationData(validationData1, validationData2)).to.eventually.equal(expected);
        expect(this.utils.$combineValidationData(validationData2, validationData1)).to.eventually.equal(expected);
      });
    }
  });

  describe('getValidationData', function () {
    it('returns the validation data with valid validity range', async function () {
      const aggregator = this.authorizer;
      const validAfter = 0;
      const validUntil = MAX_UINT48;
      const validationData = packValidationData(validAfter, validUntil, aggregator);

      expect(this.utils.$getValidationData(validationData)).to.eventually.deep.equal([aggregator.address, false]);
    });

    it('returns the validation data with invalid validity range (expired)', async function () {
      const aggregator = this.authorizer;
      const validAfter = 0;
      const validUntil = 1;
      const validationData = packValidationData(validAfter, validUntil, aggregator);

      expect(this.utils.$getValidationData(validationData)).to.eventually.deep.equal([aggregator.address, true]);
    });

    it('returns the validation data with invalid validity range (not yet valid)', async function () {
      const aggregator = this.authorizer;
      const validAfter = MAX_UINT48;
      const validUntil = MAX_UINT48;
      const validationData = packValidationData(validAfter, validUntil, aggregator);

      expect(this.utils.$getValidationData(validationData)).to.eventually.deep.equal([aggregator.address, true]);
    });

    it('returns address(0) and false for validationData = 0', function () {
      expect(this.utils.$getValidationData(0n)).to.eventually.deep.equal([ethers.ZeroAddress, false]);
    });
  });

  describe('hash', function () {
    it('returns the operation hash with specified entrypoint and chainId', async function () {
      const userOp = new UserOperation({ sender: this.sender, nonce: 1 });
      const chainId = await ethers.provider.getNetwork().then(({ chainId }) => chainId);
      const otherChainId = 0xdeadbeef;

      // check that helper matches entrypoint logic
      expect(this.entrypoint.getUserOpHash(userOp.packed)).to.eventually.equal(userOp.hash(this.entrypoint, chainId));

      // check library against helper
      expect(this.utils.$hash(userOp.packed, this.entrypoint, chainId)).to.eventually.equal(
        userOp.hash(this.entrypoint, chainId),
      );
      expect(this.utils.$hash(userOp.packed, this.entrypoint, otherChainId)).to.eventually.equal(
        userOp.hash(this.entrypoint, otherChainId),
      );
    });
  });

  describe('userOp values', function () {
    describe('intiCode', function () {
      beforeEach(async function () {
        this.userOp = new UserOperation({
          sender: this.sender,
          nonce: 1,
          verificationGas: 0x12345678n,
          factory: this.factory,
          factoryData: '0x123456',
        });

        this.emptyUserOp = new UserOperation({
          sender: this.sender,
          nonce: 1,
        });
      });

      it('returns factory', async function () {
        expect(this.utils.$factory(this.userOp.packed)).to.eventually.equal(this.factory);
        expect(this.utils.$factory(this.emptyUserOp.packed)).to.eventually.equal(ethers.ZeroAddress);
      });

      it('returns factoryData', async function () {
        expect(this.utils.$factoryData(this.userOp.packed)).to.eventually.equal('0x123456');
        expect(this.utils.$factoryData(this.emptyUserOp.packed)).to.eventually.equal('0x');
      });
    });

    it('returns verificationGasLimit', async function () {
      const userOp = new UserOperation({ sender: this.sender, nonce: 1, verificationGas: 0x12345678n });
      expect(this.utils.$verificationGasLimit(userOp.packed)).to.eventually.equal(userOp.verificationGas);
    });

    it('returns callGasLimit', async function () {
      const userOp = new UserOperation({ sender: this.sender, nonce: 1, callGas: 0x12345678n });
      expect(this.utils.$callGasLimit(userOp.packed)).to.eventually.equal(userOp.callGas);
    });

    it('returns maxPriorityFeePerGas', async function () {
      const userOp = new UserOperation({ sender: this.sender, nonce: 1, maxPriorityFee: 0x12345678n });
      expect(this.utils.$maxPriorityFeePerGas(userOp.packed)).to.eventually.equal(userOp.maxPriorityFee);
    });

    it('returns maxFeePerGas', async function () {
      const userOp = new UserOperation({ sender: this.sender, nonce: 1, maxFeePerGas: 0x12345678n });
      expect(this.utils.$maxFeePerGas(userOp.packed)).to.eventually.equal(userOp.maxFeePerGas);
    });

    it('returns gasPrice', async function () {
      const userOp = new UserOperation({
        sender: this.sender,
        nonce: 1,
        maxPriorityFee: 0x12345678n,
        maxFeePerGas: 0x87654321n,
      });
      expect(this.utils.$gasPrice(userOp.packed)).to.eventually.equal(userOp.maxPriorityFee);
    });

    describe('paymasterAndData', function () {
      beforeEach(async function () {
        this.userOp = new UserOperation({
          sender: this.sender,
          nonce: 1,
          paymaster: this.paymaster,
          paymasterVerificationGasLimit: 0x12345678n,
          paymasterPostOpGasLimit: 0x87654321n,
          paymasterData: '0xbeefcafe',
        });

        this.emptyUserOp = new UserOperation({
          sender: this.sender,
          nonce: 1,
        });
      });

      it('returns paymaster', async function () {
        expect(this.utils.$paymaster(this.userOp.packed)).to.eventually.equal(this.userOp.paymaster);
        expect(this.utils.$paymaster(this.emptyUserOp.packed)).to.eventually.equal(ethers.ZeroAddress);
      });

      it('returns verificationGasLimit', async function () {
        expect(this.utils.$paymasterVerificationGasLimit(this.userOp.packed)).to.eventually.equal(
          this.userOp.paymasterVerificationGasLimit,
        );
        expect(this.utils.$paymasterVerificationGasLimit(this.emptyUserOp.packed)).to.eventually.equal(0n);
      });

      it('returns postOpGasLimit', async function () {
        expect(this.utils.$paymasterPostOpGasLimit(this.userOp.packed)).to.eventually.equal(
          this.userOp.paymasterPostOpGasLimit,
        );
        expect(this.utils.$paymasterPostOpGasLimit(this.emptyUserOp.packed)).to.eventually.equal(0n);
      });

      it('returns data', async function () {
        expect(this.utils.$paymasterData(this.userOp.packed)).to.eventually.equal(this.userOp.paymasterData);
        expect(this.utils.$paymasterData(this.emptyUserOp.packed)).to.eventually.equal('0x');
      });
    });
  });
});
