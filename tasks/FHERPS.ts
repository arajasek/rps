import { FhevmType } from "@fhevm/hardhat-plugin";
import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

/**
 * Tutorial: Deploy and Interact Locally (--network localhost)
 * ===========================================================
 *
 * 1. From a separate terminal window:
 *
 *   npx hardhat node
 *
 * 2. Deploy the FHERPS contract
 *
 *   npx hardhat --network localhost deploy
 *
 * 3. Interact with the FHERPS contract
 *
 *   npx hardhat --network localhost fherps:address
 *   npx hardhat --network localhost fherps:create-game --opponent 0x0000000000000000000000000000000000000000
 *   npx hardhat --network localhost fherps:submit-move --game-id 1 --move 1
 *   npx hardhat --network localhost fherps:get-game --game-id 1
 *   npx hardhat --network localhost fherps:decrypt-outcome --game-id 1
 *
 *
 * Tutorial: Deploy and Interact on Sepolia (--network sepolia)
 * ===========================================================
 *
 * 1. Deploy the FHERPS contract
 *
 *   npx hardhat --network sepolia deploy
 *
 * 2. Interact with the FHERPS contract
 *
 *   npx hardhat --network sepolia fherps:address
 *   npx hardhat --network sepolia fherps:create-game --opponent <address>
 *   npx hardhat --network sepolia fherps:submit-move --game-id 1 --move 2
 *   npx hardhat --network sepolia fherps:get-game --game-id 1
 *   npx hardhat --network sepolia fherps:decrypt-outcome --game-id 1
 *
 */

/**
 * Example:
 *   - npx hardhat --network localhost fherps:address
 *   - npx hardhat --network sepolia fherps:address
 */
task("fherps:address", "Prints the FHERPS contract address").setAction(async function (
  _taskArguments: TaskArguments,
  hre,
) {
  const { deployments } = hre;

  const fherps = await deployments.get("FHERPS");

  console.log("FHERPS address is " + fherps.address);
});

/**
 * Example:
 *   - npx hardhat --network localhost fherps:create-game --opponent 0x0000000000000000000000000000000000000000
 *   - npx hardhat --network sepolia fherps:create-game --opponent 0x70997970C51812dc3A010C7d01b50e0d17dc79C8
 */
task("fherps:create-game", "Creates a new Rock Paper Scissors game")
  .addOptionalParam("address", "Optionally specify the FHERPS contract address")
  .addParam("opponent", "The opponent's address (use 0x0000000000000000000000000000000000000000 for single-player)")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments } = hre;

    const FHERPSDeployment = taskArguments.address
      ? { address: taskArguments.address }
      : await deployments.get("FHERPS");
    console.log(`FHERPS: ${FHERPSDeployment.address}`);

    const signers = await ethers.getSigners();
    const fherpsContract = await ethers.getContractAt("FHERPS", FHERPSDeployment.address);

    const opponent = taskArguments.opponent;
    const isSinglePlayer = opponent === ethers.ZeroAddress;

    console.log(`Creating ${isSinglePlayer ? "single-player" : "two-player"} game...`);
    console.log(`Player 1: ${signers[0].address}`);
    console.log(`Player 2: ${opponent}`);

    const tx = await fherpsContract.connect(signers[0]).createGame(opponent);
    console.log(`Wait for tx: ${tx.hash}...`);

    const receipt = await tx.wait();
    console.log(`tx: ${tx.hash} status=${receipt?.status}`);

    // Extract game ID from events
    const gameCreatedEvent = receipt?.logs.find(
      (log: any) => log.topics[0] === ethers.id("GameCreated(uint256,address,address)"),
    );

    if (gameCreatedEvent) {
      const gameId = ethers.toBigInt(gameCreatedEvent.topics[1]);
      console.log(`Game created with ID: ${gameId}`);
    }

    console.log("Game creation succeeded!");
  });

/**
 * Example:
 *   - npx hardhat --network localhost fherps:submit-move --game-id 1 --move 1
 *   - npx hardhat --network sepolia fherps:submit-move --game-id 1 --move 2
 */
task("fherps:submit-move", "Submits an encrypted move to a game")
  .addOptionalParam("address", "Optionally specify the FHERPS contract address")
  .addParam("gameId", "The game ID")
  .addParam("move", "The move: 1=Rock, 2=Paper, 3=Scissors")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;

    const gameId = parseInt(taskArguments.gameId);
    const move = parseInt(taskArguments.move);

    if (!Number.isInteger(gameId)) {
      throw new Error(`Argument --game-id is not an integer`);
    }

    if (!Number.isInteger(move) || move < 1 || move > 3) {
      throw new Error(`Argument --move must be 1 (Rock), 2 (Paper), or 3 (Scissors)`);
    }

    await fhevm.initializeCLIApi();

    const FHERPSDeployment = taskArguments.address
      ? { address: taskArguments.address }
      : await deployments.get("FHERPS");
    console.log(`FHERPS: ${FHERPSDeployment.address}`);

    const signers = await ethers.getSigners();
    const fherpsContract = await ethers.getContractAt("FHERPS", FHERPSDeployment.address);

    const moves = ["", "Rock", "Paper", "Scissors"];
    console.log(`Submitting move: ${moves[move]} for game ${gameId}`);

    // Encrypt the move
    const encryptedMove = await fhevm
      .createEncryptedInput(FHERPSDeployment.address, signers[0].address)
      .add8(move)
      .encrypt();

    const tx = await fherpsContract
      .connect(signers[0])
      .submitMove(gameId, encryptedMove.handles[0], encryptedMove.inputProof);
    console.log(`Wait for tx: ${tx.hash}...`);

    const receipt = await tx.wait();
    console.log(`tx: ${tx.hash} status=${receipt?.status}`);

    console.log(`Move submission succeeded!`);
  });

/**
 * Example:
 *   - npx hardhat --network localhost fherps:get-game --game-id 1
 *   - npx hardhat --network sepolia fherps:get-game --game-id 1
 */
task("fherps:get-game", "Gets game information")
  .addOptionalParam("address", "Optionally specify the FHERPS contract address")
  .addParam("gameId", "The game ID")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments } = hre;

    const gameId = parseInt(taskArguments.gameId);
    if (!Number.isInteger(gameId)) {
      throw new Error(`Argument --game-id is not an integer`);
    }

    const FHERPSDeployment = taskArguments.address
      ? { address: taskArguments.address }
      : await deployments.get("FHERPS");
    console.log(`FHERPS: ${FHERPSDeployment.address}`);

    const fherpsContract = await ethers.getContractAt("FHERPS", FHERPSDeployment.address);

    const gameData = await fherpsContract.getGame(gameId);
    const isSinglePlayer = gameData.player2 === ethers.ZeroAddress;

    console.log(`Game ${gameId} Information:`);
    console.log(`Player 1: ${gameData.player1}`);
    console.log(`Player 2: ${isSinglePlayer ? "AI (Single-Player)" : gameData.player2}`);
    console.log(`Move 1 (encrypted): ${gameData.move1}`);
    console.log(`Move 2 (encrypted): ${gameData.move2}`);
    console.log(`Outcome (encrypted): ${gameData.outcome}`);
  });

/**
 * Example:
 *   - npx hardhat --network localhost fherps:decrypt-outcome --game-id 1
 *   - npx hardhat --network sepolia fherps:decrypt-outcome --game-id 1
 */
task("fherps:decrypt-outcome", "Decrypts the game outcome (if accessible)")
  .addOptionalParam("address", "Optionally specify the FHERPS contract address")
  .addParam("gameId", "The game ID")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;

    const gameId = parseInt(taskArguments.gameId);
    if (!Number.isInteger(gameId)) {
      throw new Error(`Argument --game-id is not an integer`);
    }

    await fhevm.initializeCLIApi();

    const FHERPSDeployment = taskArguments.address
      ? { address: taskArguments.address }
      : await deployments.get("FHERPS");
    console.log(`FHERPS: ${FHERPSDeployment.address}`);

    const signers = await ethers.getSigners();
    const fherpsContract = await ethers.getContractAt("FHERPS", FHERPSDeployment.address);

    const gameData = await fherpsContract.getGame(gameId);

    if (gameData.outcome === ethers.ZeroHash) {
      console.log(`Encrypted outcome: ${gameData.outcome}`);
      console.log("Clear outcome: Pending (no moves submitted yet)");
      return;
    }

    try {
      const clearOutcome = await fhevm.userDecryptEuint(
        FhevmType.euint8,
        gameData.outcome,
        FHERPSDeployment.address,
        signers[0],
      );

      const outcomes = ["Pending", "Player 1 Wins", "Player 2 Wins", "Tie"];
      console.log(`Encrypted outcome: ${gameData.outcome}`);
      console.log(`Clear outcome: ${outcomes[clearOutcome] || "Unknown"}`);
    } catch (error) {
      console.log(`Failed to decrypt outcome: ${error}`);
      console.log("Note: You can only decrypt outcomes for games you're playing in");
    }
  });

/**
 * Example:
 *   - npx hardhat --network localhost fherps:decrypt-move --game-id 1
 *   - npx hardhat --network sepolia fherps:decrypt-move --game-id 1
 */
task("fherps:decrypt-move", "Decrypts your move in a game")
  .addOptionalParam("address", "Optionally specify the FHERPS contract address")
  .addParam("gameId", "The game ID")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;

    const gameId = parseInt(taskArguments.gameId);
    if (!Number.isInteger(gameId)) {
      throw new Error(`Argument --game-id is not an integer`);
    }

    await fhevm.initializeCLIApi();

    const FHERPSDeployment = taskArguments.address
      ? { address: taskArguments.address }
      : await deployments.get("FHERPS");
    console.log(`FHERPS: ${FHERPSDeployment.address}`);

    const signers = await ethers.getSigners();
    const fherpsContract = await ethers.getContractAt("FHERPS", FHERPSDeployment.address);

    try {
      const encryptedMove = await fherpsContract.connect(signers[0]).getPlayerMove(gameId);

      if (encryptedMove === ethers.ZeroHash) {
        console.log(`Encrypted move: ${encryptedMove}`);
        console.log("Clear move: No move submitted yet");
        return;
      }

      const clearMove = await fhevm.userDecryptEuint(
        FhevmType.euint8,
        encryptedMove,
        FHERPSDeployment.address,
        signers[0],
      );

      const moves = ["No Move", "Rock", "Paper", "Scissors"];
      console.log(`Encrypted move: ${encryptedMove}`);
      console.log(`Clear move: ${moves[clearMove] || "Unknown"}`);
    } catch (error) {
      console.log(`Failed to decrypt move: ${error}`);
      console.log("Note: You can only decrypt your own moves");
    }
  });

/**
 * Example:
 *   - npx hardhat --network localhost fherps:check-error
 *   - npx hardhat --network sepolia fherps:check-error
 */
task("fherps:check-error", "Checks for any errors in your last transaction")
  .addOptionalParam("address", "Optionally specify the FHERPS contract address")
  .addOptionalParam("user", "Optionally specify the user address to check (defaults to signer[0])")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;

    await fhevm.initializeCLIApi();

    const FHERPSDeployment = taskArguments.address
      ? { address: taskArguments.address }
      : await deployments.get("FHERPS");
    console.log(`FHERPS: ${FHERPSDeployment.address}`);

    const signers = await ethers.getSigners();
    const fherpsContract = await ethers.getContractAt("FHERPS", FHERPSDeployment.address);

    const userAddress = taskArguments.user || signers[0].address;
    console.log(`Checking errors for: ${userAddress}`);

    const errorData = await fherpsContract.getLastError(userAddress);

    if (errorData.timestamp === 0n) {
      console.log("No errors recorded for this user");
      return;
    }

    try {
      const clearError = await fhevm.userDecryptEuint(
        FhevmType.euint8,
        errorData.error,
        FHERPSDeployment.address,
        signers[0],
      );

      const errorMessages = {
        0: "No error",
        1: "Invalid move - must be Rock (1), Paper (2), or Scissors (3)",
        2: "Move already submitted for this game",
      };

      console.log(`Encrypted error: ${errorData.error}`);
      console.log(`Clear error: ${errorMessages[clearError as keyof typeof errorMessages] || "Unknown error"}`);
      console.log(`Error timestamp: ${new Date(Number(errorData.timestamp) * 1000).toISOString()}`);
    } catch (error) {
      console.log(`Failed to decrypt error: ${error}`);
      console.log("Note: You can only decrypt your own error states");
    }
  });
