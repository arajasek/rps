// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import {FHE, euint8, externalEuint8, ebool} from "@fhevm/solidity/lib/FHE.sol";
import {SepoliaConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title Confidential Rock Paper Scissors Game using FHEVM
/// @notice Two players can play rock paper scissors with fully encrypted moves
/// @dev Moves are encrypted: 0 = NoMove, 1 = Rock, 2 = Paper, 3 = Scissors
contract FHERPS is SepoliaConfig {
    uint8 constant NO_MOVE = 0;
    uint8 constant ROCK = 1;
    uint8 constant PAPER = 2;
    uint8 constant SCISSORS = 3;

    struct Game {
        address player1;
        address player2;
        euint8 move1;
        euint8 move2;
        // outcome is encrypted: 0 = Pending, 1 = Player1 wins, 2 = Player2 wins, 3 = Tie
        euint8 outcome;
    }

    // Error handling
    struct LastError {
        euint8 error;
        uint256 timestamp;
    }

    // Error codes
    euint8 internal NO_ERROR;
    euint8 internal INVALID_MOVE_ERROR;
    euint8 internal ALREADY_SUBMITTED_ERROR;

    // Results
    euint8 internal PENDING_GAME;
    euint8 internal PLAYER1_WINS;
    euint8 internal PLAYER2_WINS;
    euint8 internal TIE_GAME;

    uint256 public gameCounter;
    mapping(uint256 => Game) public games;
    mapping(address => LastError) private _lastErrors;

    event GameCreated(uint256 indexed gameId, address indexed player1, address indexed player2);
    event MoveSubmitted(uint256 indexed gameId, address indexed player);
    // Event to notify about an error state change
    event ErrorChanged(address indexed user);

    /// @notice Constructor initializes the encrypted error codes
    /// @dev Sets up the three error states used throughout the contract
    constructor() {
        NO_ERROR = FHE.asEuint8(0);
        INVALID_MOVE_ERROR = FHE.asEuint8(1);
        ALREADY_SUBMITTED_ERROR = FHE.asEuint8(2);

        PENDING_GAME = FHE.asEuint8(0);
        PLAYER1_WINS = FHE.asEuint8(1);
        PLAYER2_WINS = FHE.asEuint8(2);
        TIE_GAME = FHE.asEuint8(3);
    }

    /**
     * @dev Set the last error for a specific address.
     * @param error Encrypted error code.
     * @param addr Address of the user.
     */
    function setLastErrorIf(euint8 error, ebool cond, address addr) private {
        LastError memory prevError = _lastErrors[addr];
        if (prevError.timestamp == 0) {
            // First error
            _lastErrors[addr] = LastError(FHE.select(cond, error, NO_ERROR), block.timestamp);
        } else {
            _lastErrors[addr] = LastError(
                FHE.select(cond, error, prevError.error),
                // TODO: doing it this way clobbers the previous timestamp, even when we leave the error as prevError
                // It might be better to always overwrite prevError to NO_ERROR if cond is false.
                block.timestamp
            );
        }

        FHE.allowThis(_lastErrors[addr].error);
        FHE.allow(_lastErrors[addr].error, addr);
        emit ErrorChanged(addr);
    }

    /**
     * @dev Get the last error for a specific address.
     * @param user Address of the user.
     * @return error Encrypted error code.
     * @return timestamp Timestamp of the error.
     */
    function getLastError(address user) external view returns (euint8 error, uint256 timestamp) {
        LastError memory lastError = _lastErrors[user];
        return (lastError.error, lastError.timestamp);
    }

    /// @notice Create a new Rock Paper Scissors game
    /// @dev Creates a game between msg.sender and opponent. Use address(0) for single-player mode against AI
    /// @param opponent The address of the second player, or address(0) for single-player mode
    /// @return gameId The unique identifier for the created game
    function createGame(address opponent) external returns (uint256 gameId) {
        require(opponent != msg.sender, "Cannot play against yourself");

        gameCounter++;
        gameId = gameCounter;

        Game storage game = games[gameId];
        game.player1 = msg.sender;
        game.player2 = opponent;
        game.move1 = FHE.asEuint8(NO_MOVE);
        game.outcome = PENDING_GAME;

        if (opponent == address(0)) {
            // Single-player mode: generate AI move immediately
            // TODO: AFAIC tell, we can't get a number in the range [1,3] since we HAVE to use a power-of-two as the upper bound
            euint8 randVal = FHE.randEuint8(2);
            FHE.allowThis(randVal);
            game.move2 = FHE.add(randVal, FHE.asEuint8(1));
            FHE.allowThis(game.move2);
        } else {
            // Two-player mode: initialize move2 to 0
            game.move2 = FHE.asEuint8(NO_MOVE);
            FHE.allow(game.outcome, game.player2);
        }

        FHE.allowThis(game.outcome);
        FHE.allow(game.outcome, game.player1);

        emit GameCreated(gameId, msg.sender, opponent);
    }

    /// @notice Submit an encrypted move for a specific game
    /// @dev Validates the move is 1-3 (Rock/Paper/Scissors) and that player hasn't already submitted
    /// @param gameId The unique identifier of the game
    /// @param encryptedMove The encrypted move (1=Rock, 2=Paper, 3=Scissors)
    /// @param inputProof Proof that the encrypted input is valid
    function submitMove(uint256 gameId, externalEuint8 encryptedMove, bytes calldata inputProof) external {
        Game storage game = games[gameId];
        require(game.player1 != address(0), "Game not found");
        require(msg.sender == game.player1 || msg.sender == game.player2, "Not authorized");

        euint8 move = FHE.fromExternal(encryptedMove, inputProof);

        // Validate move is 1, 2, or 3 (Rock, Paper, Scissors)
        // TODO: For reasons I don't understand, the contract breaks in the setLastErrorIf method if I use the constants ROCK / PAPER / SCISSORS here.
        // This is confusing, since I perform
        ebool invalidMove = FHE.and(
            FHE.and(FHE.ne(move, FHE.asEuint8(1)), FHE.ne(move, FHE.asEuint8(2))),
            FHE.ne(move, FHE.asEuint8(3))
        );

        // Update last error to INVALID_MOVE, if necessary
        setLastErrorIf(INVALID_MOVE_ERROR, invalidMove, msg.sender);

        if (msg.sender == game.player1) {
            ebool alreadySubmitted = FHE.ne(game.move1, NO_MOVE);
            // ALREADY_SUBMITTED_ERROR overwrites an INVALID_MOVE_ERROR, since no move needs to be submitted
            setLastErrorIf(ALREADY_SUBMITTED_ERROR, alreadySubmitted, msg.sender);

            // Only store move if valid, otherwise keep existing (uninitialized) value
            game.move1 = FHE.select(FHE.and(FHE.not(invalidMove), FHE.not(alreadySubmitted)), move, game.move1);
            FHE.allowThis(game.move1);
            FHE.allow(game.move1, game.player1);
        } else {
            ebool alreadySubmitted = FHE.ne(game.move2, NO_MOVE);
            // ALREADY_SUBMITTED_ERROR overwrites an INVALID_MOVE_ERROR, since no move needs to be submitted
            setLastErrorIf(ALREADY_SUBMITTED_ERROR, alreadySubmitted, msg.sender);

            // Only store move if valid, otherwise keep existing (uninitialized) value
            game.move2 = FHE.select(FHE.and(FHE.not(invalidMove), FHE.not(alreadySubmitted)), move, game.move2);
            FHE.allowThis(game.move2);
            FHE.allow(game.move2, game.player2);
        }

        emit MoveSubmitted(gameId, msg.sender);

        _determineWinner(game);
    }

    /// @dev Internal function to determine the winner when both players have submitted moves
    /// @param game Storage reference to the game being evaluated
    function _determineWinner(Game storage game) internal {
        euint8 move1 = game.move1;
        euint8 move2 = game.move2;

        // Still waiting for a move?
        ebool notPending = FHE.and(FHE.ne(game.move1, NO_MOVE), FHE.ne(game.move2, NO_MOVE));

        // Check for tie
        ebool tie = FHE.and(notPending, FHE.eq(move1, move2));

        // Player 1 wins conditions:
        // Rock (1) beats Scissors (3): move1 == 1 && move2 == 3
        // Paper (2) beats Rock (1): move1 == 2 && move2 == 1
        // Scissors (3) beats Paper (2): move1 == 3 && move2 == 2
        ebool player1Wins = FHE.or(
            FHE.or(
                FHE.and(FHE.eq(move1, ROCK), FHE.eq(move2, SCISSORS)),
                FHE.and(FHE.eq(move1, PAPER), FHE.eq(move2, ROCK))
            ),
            FHE.and(FHE.eq(move1, SCISSORS), FHE.eq(move2, PAPER))
        );

        ebool player2Wins = FHE.and(notPending, FHE.and(FHE.not(tie), FHE.not(player1Wins)));

        game.outcome = FHE.select(tie, TIE_GAME, game.outcome);

        game.outcome = FHE.select(player1Wins, PLAYER1_WINS, game.outcome);

        game.outcome = FHE.select(player2Wins, PLAYER2_WINS, game.outcome);

        FHE.allowThis(game.outcome);
        FHE.allow(game.outcome, game.player1);
        FHE.allow(game.outcome, game.player2);
    }

    /// @notice Get all game information including encrypted moves and outcome
    /// @dev Returns both plain addresses and encrypted game state
    /// @param gameId The unique identifier of the game
    /// @return player1 Address of the first player
    /// @return player2 Address of the second player (address(0) for single-player)
    /// @return move1 Encrypted move of player1
    /// @return move2 Encrypted move of player2 (or AI move)
    /// @return outcome Encrypted game outcome (0=Pending, 1=Player1 wins, 2=Player2 wins, 3=Tie)
    function getGame(
        uint256 gameId
    ) external view returns (address player1, address player2, euint8 move1, euint8 move2, euint8 outcome) {
        Game memory game = games[gameId];
        return (game.player1, game.player2, game.move1, game.move2, game.outcome);
    }
    /// @notice Get the encrypted move for the calling player
    /// @dev Only returns the move for the calling player, includes authorization check
    /// @param gameId The ID of the game
    /// @return The encrypted move (only accessible to the player who made it)
    function getPlayerMove(uint256 gameId) external view returns (euint8) {
        Game memory game = games[gameId];
        require(game.player1 != address(0), "Game not found");

        if (msg.sender == game.player1) {
            return game.move1;
        } else if (msg.sender == game.player2) {
            return game.move2;
        } else {
            revert("Not authorized");
        }
    }
}
