# Confidential Rock Paper Scissors - Frontend Developer Guide

## Overview

This guide provides comprehensive instructions for frontend developers working with the Confidential Rock Paper Scissors smart contract built on Zama's fhevm (Fully Homomorphic Encryption Virtual Machine).

## What Does This Contract Achieve?

Imagine you're playing Rock-Paper-Scissors on a crowded bus. Normally, you'd have to show your hand to your opponent and everyone else would see it too. But what if you could use secret hand signals that only you understand - signals so secret that even your opponent doesn't know what you chose?

That's exactly what this contract achieves, using Fully Homomorphic Encryption (FHE). Zama's FHEVM library is essentially a tool to generate these secret hand signals.

Players using FHEVM can secretly submit their moves (Rock, Paper, or Scissors) to a completely public forum - the blockchain - where anyone can see that *something* was submitted, but no one can tell what the actual move was. 

The meaning of the secret signals is shared with the smart contract. The contract can thus fairly compute who wins each round using these encrypted moves, and announce the result to the two players. In this metaphor, the contract is a perfectly trustworthy referee who determines the winner and confidentially announces the result.

The "others on the bus" - anyone monitoring the blockchain - just see encrypted data being submitted and encrypted results being updated, but have absolutely no idea about the state of the games being played.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Creating & Playing Games](#creating--playing-games)
   - [Creating a Game](#creating-a-game)
   - [Submitting a Move](#submitting-a-move)
   - [Error Handling](#error-handling)
3. [Viewing State](#viewing-state)
   - [Getting Game Information](#getting-game-information)
   - [Getting Your Move](#getting-your-move)
   - [Checking for Errors](#checking-for-errors)
4. [Events](#events)
   - [GameCreated](#gamecreated)
   - [MoveSubmitted](#movesubmitted)
   - [ErrorChanged](#errorchanged)
5. [Best Practices](#best-practices)
6. [Questions](#questions)

## Getting Started

`Pre-requisites: Node 18+, npm, Metamask`

The contract has already been deployed to Ethereum's Sepolia testnet at `0x18973Fac696e2F4711F7dEd532F049EA70fa5623`. If you would like to deploy your own contract for testing, follow the instructions [here](https://docs.zama.ai/protocol/solidity-guides/development-guide/hardhat/run_test#run-on-sepolia-ethereum-testnet).
Note that Sepolia is the only public network supporting full FHEVM functionality as of today.

To get started building the frontend, follow the simple steps [here](https://docs.zama.ai/protocol/relayer-sdk-guides/fhevm-relayer/initialization). It is also useful to know how to create encrypted inputs in the frontend by reviewing the information [here](https://docs.zama.ai/protocol/relayer-sdk-guides/fhevm-relayer/input).

```
Tip: You can see how to interact with the contract by taking a look at tasks/FHERPS.ts!
```

## Creating & Playing Games

There are only two methods needed to interact with the full functionality of the contract.

### Creating a Game
```solidity
function createGame(address opponent) external returns (uint256 gameId);
```

Creates a new game; `opponent` may be another address (two-player) or `address(0)` (single-player). In single-player mode, the opponent's move will be randomly chosen by the contract. Note that this method does not involve any encrypted inputs or outputs.

Example invocation:
```
   fheRpsContract.connect(<address1>).createGame(<address2>);
```

### Submitting a Move

The three possible moves are represented by the following numbers:
- `Rock`: 1
- `Paper`: 2
- `Scissors`: 3

```solidity
function submitMove(uint256 gameId, externalEuint8 encryptedMove, bytes calldata inputProof) external;
```

Submit an encrypted move. `encryptedMove` is an `externalEuint8` handle (index into the proof) and `inputProof` is the bytes proof produced at encryption time.

Example invocation for gameID 1:
```
   // Create Encrypted Move
    const move = await fhevm
      .createEncryptedInput(fheRpsContractAddress, <address>)
      .add8(3) // 3 corresponds to playing Scissors
      .encrypt();

    // Submit Encrypted Move
    await fheRpsContract.connect(<address>).submitMove(1, move.handles[0], move.inputProof);
```

Note that this method will fail if the player has already submitted a move for the game in question. Consider checking state with `getPlayerMove` (see below) before submitting this transaction.

### Error Handling

Error Handling in a fully encrypted setting is more complex than a traditional Solidity contract. Instead of simply returning or emitting an error, which would leak information to the public, the contract tracks the latest error by each user. See [here](https://docs.zama.ai/protocol/solidity-guides/smart-contract/logics/error_handling) for more information on the error-handling pattern used by this contract.

There are three error codes:
- `NO_ERROR (0)`: Indicates no error tracked for the user
- `INVALID_MOVE_ERROR(1)`: Indicates the latest move submitted by the user wasn't a valid move (not 1, 2, or 3)
- `ALREADY_SUBMITTED_ERROR(2)`: Indicates that the latest move submitted by the user was for a game they have already submitted a move for.

Note that only the latest error per user is tracked. It is important to listen for the `ErrorChanged` event (more below) to gather all errors.

## Viewing State

There are three methods available to view game and error state information. Some of these methods return encrypted information, see [here](https://docs.zama.ai/protocol/relayer-sdk-guides/fhevm-relayer/decryption/user-decryption#step-2-decrypt-the-ciphertext) for how to decrypt such information.

### Getting Game Information

```solidity
function getGame(uint256 gameId) external view returns (address player1, address player2, euint8 move1, euint8 move2, euint8 outcome);
```

Returns all game data for a given game ID. The moves and outcome are encrypted and can only be decrypted by authorized players. Note that this method returns encrypted data types (`euint8`) for the moves and outcome.

Example invocation:
```
const gameData = await fheRpsContract.getGame(1);
// gameData.player1 and gameData.player2 are plain addresses
// gameData.move1, gameData.move2, and gameData.outcome are encrypted handles
```

### Getting Your Move

```solidity
function getPlayerMove(uint256 gameId) external view returns (euint8);
```

Returns the encrypted move for the calling player in a specific game. This method includes authorization - you can only retrieve your own move, not your opponent's.

Example invocation:
```
const myEncryptedMove = await fheRpsContract.connect(<address>).getPlayerMove(1);
// myEncryptedMove is an encrypted handle that can be decrypted by the player
```

### Checking for Errors

Error Handling

```solidity
function getLastError(address user) external view returns (euint8 error, uint256 timestamp);
```

Returns the last error state for a given user address. The error code is encrypted but can be decrypted by the user to understand what went wrong. The timestamp indicates when the error occurred.

Example invocation:
```
const errorData = await fheRpsContract.getLastError(<address>);
// errorData.error is encrypted, errorData.timestamp is a plain uint256
```

## Events

The contract emits three events to help frontend applications track game state changes and handle errors.

### GameCreated

```solidity
event GameCreated(uint256 indexed gameId, address indexed player1, address indexed player2);
```

Emitted when a new game is created. All parameters are indexed for efficient filtering. For single-player games, `player2` will be `address(0)`.

### MoveSubmitted

```solidity
event MoveSubmitted(uint256 indexed gameId, address indexed player);
```

Emitted when a player successfully submits a move. Both parameters are indexed for filtering by specific games or players.

### ErrorChanged

```solidity
event ErrorChanged(address indexed user);
```

Emitted when a user's error state changes (typically when an error occurs during move submission). This is crucial for error handling since errors are stored encrypted in the contract state.

## Best Practices

1. **Always validate inputs** before calling contract functions
2. **Handle errors gracefully** using the contract's error system
3. **Use event listeners** for real-time updates
4. **Check move submission status** before allowing new moves
6. **Cache game data** to reduce unnecessary contract calls

## Questions

For more examples in code of how to interact with the contract, refer to the test suite in `test/FHERPS.ts`.
For questions not covered in this document, please refer to the [Zama documentation](https://docs.zama.ai/protocol). If that does not address your question, please ask in the [Community Forum](https://community.zama.ai/c/zama-protocol/15).