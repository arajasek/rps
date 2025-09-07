import { RPS, RPS__factory } from "../types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";

// Enum constants that match the Solidity contract
const Move = {
  Rock: 0,
  Paper: 1,
  Scissors: 2,
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
  const factory = (await ethers.getContractFactory("RPS")) as RPS__factory;
  const rpsContract = (await factory.deploy()) as RPS;
  const rpsContractAddress = await rpsContract.getAddress();

  return { rpsContract, rpsContractAddress };
}

describe("RPS", function () {
  let signers: Signers;
  let rpsContract: RPS;
  let rpsContractAddress: string;

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
    ({ rpsContract, rpsContractAddress } = await deployFixture());
  });

  it("should be deployed", async function () {
    expect(ethers.isAddress(rpsContractAddress)).to.eq(true);
  });

  it("should create a new game between two players", async function () {
    const tx = await rpsContract.connect(signers.alice).createGame(signers.bob.address);
    const receipt = await tx.wait();

    expect(receipt?.status).to.eq(1);
    expect(await rpsContract.gameCounter()).to.eq(1);

    const game = await rpsContract.getGame(1);
    expect(game.player1).to.eq(signers.alice.address);
    expect(game.player2).to.eq(signers.bob.address);
    expect(game.outcome).to.eq(0); // Pending
  });

  it("should not allow player to play against themselves", async function () {
    await expect(rpsContract.connect(signers.alice).createGame(signers.alice.address)).to.be.revertedWith(
      "Cannot play against yourself",
    );
  });

  it("should allow both players to submit moves and determine winner", async function () {
    // Create game
    await rpsContract.connect(signers.alice).createGame(signers.bob.address);
    const gameId = 1;

    // Alice plays Rock, Bob plays Scissors
    // Rock beats Scissors, so Alice should win
    await rpsContract.connect(signers.alice).submitMove(gameId, Move.Rock);
    await rpsContract.connect(signers.bob).submitMove(gameId, Move.Scissors);

    const game = await rpsContract.getGame(gameId);
    expect(game.move1).to.eq(Move.Rock);
    expect(game.move2).to.eq(Move.Scissors);
    expect(game.outcome).to.eq(GameOutcome.Player1Wins);
  });

  it("should handle tie games", async function () {
    await rpsContract.connect(signers.alice).createGame(signers.bob.address);
    const gameId = 1;

    // Both play Rock
    await rpsContract.connect(signers.alice).submitMove(gameId, Move.Rock);
    await rpsContract.connect(signers.bob).submitMove(gameId, Move.Rock);

    const game = await rpsContract.getGame(gameId);
    expect(game.outcome).to.eq(GameOutcome.Tie);
  });

  it("should handle all winning combinations", async function () {
    // Test Paper beats Rock
    await rpsContract.connect(signers.alice).createGame(signers.bob.address);
    await rpsContract.connect(signers.alice).submitMove(1, Move.Paper);
    await rpsContract.connect(signers.bob).submitMove(1, Move.Rock);

    let game = await rpsContract.getGame(1);
    expect(game.outcome).to.eq(GameOutcome.Player1Wins);

    // Test Scissors beats Paper
    await rpsContract.connect(signers.alice).createGame(signers.bob.address);
    await rpsContract.connect(signers.alice).submitMove(2, Move.Scissors);
    await rpsContract.connect(signers.bob).submitMove(2, Move.Paper);

    game = await rpsContract.getGame(2);
    expect(game.outcome).to.eq(GameOutcome.Player1Wins);

    // Test Player 2 wins
    await rpsContract.connect(signers.alice).createGame(signers.bob.address);
    await rpsContract.connect(signers.alice).submitMove(3, Move.Rock);
    await rpsContract.connect(signers.bob).submitMove(3, Move.Paper);

    game = await rpsContract.getGame(3);
    expect(game.outcome).to.eq(GameOutcome.Player2Wins);
  });

  it("should not allow submitting move twice", async function () {
    await rpsContract.connect(signers.alice).createGame(signers.bob.address);

    await rpsContract.connect(signers.alice).submitMove(1, Move.Rock);
    await expect(rpsContract.connect(signers.alice).submitMove(1, Move.Paper)).to.be.revertedWith(
      "Move already submitted",
    );
  });

  it("should not allow unauthorized players to submit moves", async function () {
    await rpsContract.connect(signers.alice).createGame(signers.bob.address);

    await expect(rpsContract.connect(signers.charlie).submitMove(1, Move.Rock)).to.be.revertedWith("Not authorized");
  });
});
