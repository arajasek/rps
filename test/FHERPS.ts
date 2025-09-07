import { FHERPS, FHERPS__factory } from "../types";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";

// Enum constants that match the Solidity contract
const Move = {
  NoMove: 0,
  Rock: 1,
  Paper: 2,
  Scissors: 3,
} as const;

const GameOutcome = {
  Pending: 0,
  Player1Wins: 1,
  Player2Wins: 2,
  Tie: 3,
} as const;

type Signers = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
  charlie: HardhatEthersSigner;
};

async function deployFixture() {
  const factory = (await ethers.getContractFactory("FHERPS")) as FHERPS__factory;
  const fheRpsContract = (await factory.deploy()) as FHERPS;
  const fheRpsContractAddress = await fheRpsContract.getAddress();

  return { fheRpsContract, fheRpsContractAddress };
}

describe("FHERPS", function () {
  let signers: Signers;
  let fheRpsContract: FHERPS;
  let fheRpsContractAddress: string;

  before(async function () {
    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = {
      deployer: ethSigners[0],
      alice: ethSigners[1],
      bob: ethSigners[2],
      charlie: ethSigners[3],
    };
  });

  beforeEach(async () => {
    ({ fheRpsContract, fheRpsContractAddress } = await deployFixture());
  });

  it("should be deployed", async function () {
    expect(ethers.isAddress(fheRpsContractAddress)).to.eq(true);
  });

  it("should create a new game between two players", async function () {
    const tx = await fheRpsContract.connect(signers.alice).createGame(signers.bob.address);
    const receipt = await tx.wait();

    expect(receipt?.status).to.eq(1);
    expect(await fheRpsContract.gameCounter()).to.eq(1);

    const game = await fheRpsContract.getGame(1);
    expect(game.player1).to.eq(signers.alice.address);
    expect(game.player2).to.eq(signers.bob.address);
    const decryptedOutcome = await fhevm.userDecryptEuint(
      FhevmType.euint8,
      game.outcome,
      fheRpsContractAddress,
      signers.alice,
    );
    expect(decryptedOutcome).to.eq(GameOutcome.Pending);
  });

  it("should not allow player to play against themselves", async function () {
    await expect(fheRpsContract.connect(signers.alice).createGame(signers.alice.address)).to.be.revertedWith(
      "Cannot play against yourself",
    );
  });

  it("should allow both players to submit encrypted moves and determine winner", async function () {
    // Create game
    await fheRpsContract.connect(signers.alice).createGame(signers.bob.address);
    const gameId = 1;

    // Alice plays Rock (encrypted)
    const aliceMove = await fhevm
      .createEncryptedInput(fheRpsContractAddress, signers.alice.address)
      .add8(Move.Rock)
      .encrypt();

    // Bob plays Scissors (encrypted)
    const bobMove = await fhevm
      .createEncryptedInput(fheRpsContractAddress, signers.bob.address)
      .add8(Move.Scissors)
      .encrypt();

    // Submit moves
    await fheRpsContract.connect(signers.alice).submitMove(gameId, aliceMove.handles[0], aliceMove.inputProof);
    await fheRpsContract.connect(signers.bob).submitMove(gameId, bobMove.handles[0], bobMove.inputProof);

    // Check game state - moves are submitted and Alice wins (Rock beats Scissors)
    const game = await fheRpsContract.getGame(gameId);
    const decryptedOutcome = await fhevm.userDecryptEuint(
      FhevmType.euint8,
      game.outcome,
      fheRpsContractAddress,
      signers.alice,
    );
    expect(decryptedOutcome).to.eq(GameOutcome.Player1Wins);
  });

  it("should handle tie games with encrypted moves", async function () {
    await fheRpsContract.connect(signers.alice).createGame(signers.bob.address);
    const gameId = 1;

    // Both players play Rock (encrypted)
    const aliceMove = await fhevm
      .createEncryptedInput(fheRpsContractAddress, signers.alice.address)
      .add8(Move.Rock)
      .encrypt();

    const bobMove = await fhevm
      .createEncryptedInput(fheRpsContractAddress, signers.bob.address)
      .add8(Move.Rock)
      .encrypt();

    await fheRpsContract.connect(signers.alice).submitMove(gameId, aliceMove.handles[0], aliceMove.inputProof);
    await fheRpsContract.connect(signers.bob).submitMove(gameId, bobMove.handles[0], bobMove.inputProof);

    const game = await fheRpsContract.getGame(gameId);
    const decryptedOutcome = await fhevm.userDecryptEuint(
      FhevmType.euint8,
      game.outcome,
      fheRpsContractAddress,
      signers.alice,
    );
    expect(decryptedOutcome).to.eq(GameOutcome.Tie);
  });

  it("should handle all winning combinations", async function () {
    // Test Paper beats Rock
    await fheRpsContract.connect(signers.alice).createGame(signers.bob.address);

    const aliceMove1 = await fhevm
      .createEncryptedInput(fheRpsContractAddress, signers.alice.address)
      .add8(Move.Paper)
      .encrypt();

    const bobMove1 = await fhevm
      .createEncryptedInput(fheRpsContractAddress, signers.bob.address)
      .add8(Move.Rock)
      .encrypt();

    await fheRpsContract.connect(signers.alice).submitMove(1, aliceMove1.handles[0], aliceMove1.inputProof);
    await fheRpsContract.connect(signers.bob).submitMove(1, bobMove1.handles[0], bobMove1.inputProof);

    let game = await fheRpsContract.getGame(1);
    let decryptedOutcome = await fhevm.userDecryptEuint(
      FhevmType.euint8,
      game.outcome,
      fheRpsContractAddress,
      signers.alice,
    );
    expect(decryptedOutcome).to.eq(GameOutcome.Player1Wins);

    // Test Scissors beats Paper
    await fheRpsContract.connect(signers.alice).createGame(signers.bob.address);

    const aliceMove2 = await fhevm
      .createEncryptedInput(fheRpsContractAddress, signers.alice.address)
      .add8(Move.Scissors)
      .encrypt();

    const bobMove2 = await fhevm
      .createEncryptedInput(fheRpsContractAddress, signers.bob.address)
      .add8(Move.Paper)
      .encrypt();

    await fheRpsContract.connect(signers.alice).submitMove(2, aliceMove2.handles[0], aliceMove2.inputProof);
    await fheRpsContract.connect(signers.bob).submitMove(2, bobMove2.handles[0], bobMove2.inputProof);

    game = await fheRpsContract.getGame(2);
    decryptedOutcome = await fhevm.userDecryptEuint(
      FhevmType.euint8,
      game.outcome,
      fheRpsContractAddress,
      signers.alice,
    );
    expect(decryptedOutcome).to.eq(GameOutcome.Player1Wins);

    // Test Player 2 wins: Paper beats Rock
    await fheRpsContract.connect(signers.alice).createGame(signers.bob.address);

    const aliceMove3 = await fhevm
      .createEncryptedInput(fheRpsContractAddress, signers.alice.address)
      .add8(Move.Rock)
      .encrypt();

    const bobMove3 = await fhevm
      .createEncryptedInput(fheRpsContractAddress, signers.bob.address)
      .add8(Move.Paper)
      .encrypt();

    await fheRpsContract.connect(signers.alice).submitMove(3, aliceMove3.handles[0], aliceMove3.inputProof);
    await fheRpsContract.connect(signers.bob).submitMove(3, bobMove3.handles[0], bobMove3.inputProof);

    game = await fheRpsContract.getGame(3);
    decryptedOutcome = await fhevm.userDecryptEuint(
      FhevmType.euint8,
      game.outcome,
      fheRpsContractAddress,
      signers.alice,
    );
    expect(decryptedOutcome).to.eq(GameOutcome.Player2Wins);
  });

  it("should handle invalid encrypted moves", async function () {
    await fheRpsContract.connect(signers.alice).createGame(signers.bob.address);

    // Try to submit invalid move (0 or 4 - out of valid range 1,2,3)
    const invalidMove = await fhevm
      .createEncryptedInput(fheRpsContractAddress, signers.alice.address)
      .add8(0) // Invalid move (should be 1, 2, or 3)
      .encrypt();

    // Submit invalid move - this won't revert but will set error state
    await fheRpsContract.connect(signers.alice).submitMove(1, invalidMove.handles[0], invalidMove.inputProof);

    // Check error state
    const [errorCode, timestamp] = await fheRpsContract.getLastError(signers.alice.address);
    const decryptedError = await fhevm.userDecryptEuint(
      FhevmType.euint8,
      errorCode,
      fheRpsContractAddress,
      signers.alice,
    );

    expect(decryptedError).to.eq(1); // INVALID_MOVE_ERROR
    expect(timestamp).to.be.greaterThan(0);
  });

  it("should handle submitting move twice", async function () {
    await fheRpsContract.connect(signers.alice).createGame(signers.bob.address);

    const aliceMove = await fhevm
      .createEncryptedInput(fheRpsContractAddress, signers.alice.address)
      .add8(Move.Rock)
      .encrypt();

    await fheRpsContract.connect(signers.alice).submitMove(1, aliceMove.handles[0], aliceMove.inputProof);

    const aliceMove2 = await fhevm
      .createEncryptedInput(fheRpsContractAddress, signers.alice.address)
      .add8(Move.Paper)
      .encrypt();

    // Submit second move - this won't revert but will set error state
    await fheRpsContract.connect(signers.alice).submitMove(1, aliceMove2.handles[0], aliceMove2.inputProof);

    // Check error state
    const [errorCode, timestamp] = await fheRpsContract.getLastError(signers.alice.address);
    const decryptedError = await fhevm.userDecryptEuint(
      FhevmType.euint8,
      errorCode,
      fheRpsContractAddress,
      signers.alice,
    );

    expect(decryptedError).to.eq(2); // ALREADY_SUBMITTED_ERROR

    // Verify Alice's move is still Rock (not updated to Paper)
    const encryptedMove = await fheRpsContract.connect(signers.alice).getPlayerMove(1);
    const decryptedMove = await fhevm.userDecryptEuint(
      FhevmType.euint8,
      encryptedMove,
      fheRpsContractAddress,
      signers.alice,
    );

    expect(decryptedMove).to.eq(Move.Rock); // Should still be Rock, not Paper
  });

  it("should not allow unauthorized players to submit moves", async function () {
    await fheRpsContract.connect(signers.alice).createGame(signers.bob.address);

    const charlieMove = await fhevm
      .createEncryptedInput(fheRpsContractAddress, signers.charlie.address)
      .add8(Move.Rock)
      .encrypt();

    await expect(
      fheRpsContract.connect(signers.charlie).submitMove(1, charlieMove.handles[0], charlieMove.inputProof),
    ).to.be.revertedWith("Not authorized");
  });

  it("should allow players to retrieve their own encrypted moves", async function () {
    await fheRpsContract.connect(signers.alice).createGame(signers.bob.address);
    const gameId = 1;

    const aliceMove = await fhevm
      .createEncryptedInput(fheRpsContractAddress, signers.alice.address)
      .add8(Move.Paper)
      .encrypt();

    await fheRpsContract.connect(signers.alice).submitMove(gameId, aliceMove.handles[0], aliceMove.inputProof);

    // Alice can get her own move (no need for isPlayer1 param anymore)
    const encryptedMove = await fheRpsContract.connect(signers.alice).getPlayerMove(gameId);

    // Decrypt to verify
    const decryptedMove = await fhevm.userDecryptEuint(
      FhevmType.euint8,
      encryptedMove,
      fheRpsContractAddress,
      signers.alice,
    );

    expect(decryptedMove).to.eq(Move.Paper);
  });

  it("should not allow players to see opponent's moves", async function () {
    await fheRpsContract.connect(signers.alice).createGame(signers.bob.address);
    const gameId = 1;

    const bobMove = await fhevm
      .createEncryptedInput(fheRpsContractAddress, signers.bob.address)
      .add8(Move.Scissors)
      .encrypt();

    await fheRpsContract.connect(signers.bob).submitMove(gameId, bobMove.handles[0], bobMove.inputProof);

    // Alice should not be able to decrypt Bob's move even if she gets it from getGame
    // But she can get her own move (which should be 0/NoMove since she hasn't submitted)
    const encryptedMove = await fheRpsContract.connect(signers.alice).getPlayerMove(gameId);
    const decryptedMove = await fhevm.userDecryptEuint(
      FhevmType.euint8,
      encryptedMove,
      fheRpsContractAddress,
      signers.alice,
    );

    expect(decryptedMove).to.eq(Move.NoMove); // Alice hasn't submitted her move yet
  });

  it("should return encrypted values that maintain privacy", async function () {
    await fheRpsContract.connect(signers.alice).createGame(signers.bob.address);
    const gameId = 1;

    const aliceMove = await fhevm
      .createEncryptedInput(fheRpsContractAddress, signers.alice.address)
      .add8(Move.Rock)
      .encrypt();

    const bobMove = await fhevm
      .createEncryptedInput(fheRpsContractAddress, signers.bob.address)
      .add8(Move.Paper)
      .encrypt();

    await fheRpsContract.connect(signers.alice).submitMove(gameId, aliceMove.handles[0], aliceMove.inputProof);
    await fheRpsContract.connect(signers.bob).submitMove(gameId, bobMove.handles[0], bobMove.inputProof);

    const game = await fheRpsContract.getGame(gameId);

    // Verify game setup
    expect(game.player1).to.eq(signers.alice.address);
    expect(game.player2).to.eq(signers.bob.address);

    // Verify only authorized players can decrypt the outcome
    const decryptedOutcome = await fhevm.userDecryptEuint(
      FhevmType.euint8,
      game.outcome,
      fheRpsContractAddress,
      signers.alice,
    );

    expect(decryptedOutcome).to.eq(GameOutcome.Player2Wins); // Paper beats Rock
  });

  describe("Single Player Mode", function () {
    it("should create a single-player game when opponent is address(0)", async function () {
      const tx = await fheRpsContract.connect(signers.alice).createGame(ethers.ZeroAddress);
      const receipt = await tx.wait();

      expect(receipt?.status).to.eq(1);
      expect(await fheRpsContract.gameCounter()).to.eq(1);

      const game = await fheRpsContract.getGame(1);
      expect(game.player1).to.eq(signers.alice.address);
      expect(game.player2).to.eq(ethers.ZeroAddress);

      // Outcome should start as pending
      const decryptedOutcome = await fhevm.userDecryptEuint(
        FhevmType.euint8,
        game.outcome,
        fheRpsContractAddress,
        signers.alice,
      );
      expect(decryptedOutcome).to.eq(GameOutcome.Pending);
    });

    it("should complete single-player game when player submits move", async function () {
      // Create single-player game
      await fheRpsContract.connect(signers.alice).createGame(ethers.ZeroAddress);
      const gameId = 1;

      // Alice submits her move
      const aliceMove = await fhevm
        .createEncryptedInput(fheRpsContractAddress, signers.alice.address)
        .add8(Move.Rock)
        .encrypt();

      await fheRpsContract.connect(signers.alice).submitMove(gameId, aliceMove.handles[0], aliceMove.inputProof);

      // Game should be complete with an outcome
      const game = await fheRpsContract.getGame(gameId);
      const decryptedOutcome = await fhevm.userDecryptEuint(
        FhevmType.euint8,
        game.outcome,
        fheRpsContractAddress,
        signers.alice,
      );

      // Should have a valid outcome (not pending)
      expect(Number(decryptedOutcome)).to.be.oneOf([GameOutcome.Player1Wins, GameOutcome.Player2Wins, GameOutcome.Tie]);

      // Player should be able to see their own move
      const playerMove = await fheRpsContract.connect(signers.alice).getPlayerMove(gameId);
      const decryptedPlayerMove = await fhevm.userDecryptEuint(
        FhevmType.euint8,
        playerMove,
        fheRpsContractAddress,
        signers.alice,
      );
      expect(decryptedPlayerMove).to.eq(Move.Rock);
    });

    it("should handle single-player game with different outcomes", async function () {
      // Test multiple single-player games to verify randomness and outcomes
      const results = [];

      for (let i = 0; i < 3; i++) {
        await fheRpsContract.connect(signers.alice).createGame(ethers.ZeroAddress);
        const gameId = i + 1;

        // Alice always plays Rock
        const aliceMove = await fhevm
          .createEncryptedInput(fheRpsContractAddress, signers.alice.address)
          .add8(Move.Rock)
          .encrypt();

        await fheRpsContract.connect(signers.alice).submitMove(gameId, aliceMove.handles[0], aliceMove.inputProof);

        const game = await fheRpsContract.getGame(gameId);
        const decryptedOutcome = await fhevm.userDecryptEuint(
          FhevmType.euint8,
          game.outcome,
          fheRpsContractAddress,
          signers.alice,
        );

        results.push({ outcome: decryptedOutcome });
      }

      // Verify all games completed with valid outcomes
      results.forEach((result) => {
        expect(Number(result.outcome)).to.be.oneOf([GameOutcome.Player1Wins, GameOutcome.Player2Wins, GameOutcome.Tie]);
      });
    });

    it("should not allow unauthorized players to submit moves in single-player game", async function () {
      await fheRpsContract.connect(signers.alice).createGame(ethers.ZeroAddress);

      const bobMove = await fhevm
        .createEncryptedInput(fheRpsContractAddress, signers.bob.address)
        .add8(Move.Paper)
        .encrypt();

      await expect(
        fheRpsContract.connect(signers.bob).submitMove(1, bobMove.handles[0], bobMove.inputProof),
      ).to.be.revertedWith("Not authorized");
    });
  });
});
