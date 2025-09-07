// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Simple Rock Paper Scissors Game
/// @notice Two players can play rock paper scissors
contract RPS {
    enum Move {
        Rock,
        Paper,
        Scissors
    }
    enum GameOutcome {
        Pending,
        Player1Wins,
        Player2Wins,
        Tie
    }

    struct Game {
        address player1;
        address player2;
        Move move1;
        Move move2;
        bool move1Submitted;
        bool move2Submitted;
        GameOutcome outcome;
    }

    uint256 public gameCounter;
    mapping(uint256 => Game) public games;

    event GameCreated(uint256 indexed gameId, address indexed player1, address indexed player2);
    event MoveSubmitted(uint256 indexed gameId, address indexed player);
    event GameComplete(uint256 indexed gameId, GameOutcome outcome);

    function createGame(address opponent) external returns (uint256 gameId) {
        require(opponent != msg.sender, "Cannot play against yourself");
        require(opponent != address(0), "Invalid opponent address");

        gameCounter++;
        gameId = gameCounter;

        Game storage game = games[gameId];
        game.player1 = msg.sender;
        game.player2 = opponent;
        game.outcome = GameOutcome.Pending;

        emit GameCreated(gameId, msg.sender, opponent);
    }

    function submitMove(uint256 gameId, Move move) external {
        Game storage game = games[gameId];
        require(game.player1 != address(0), "Game not found");
        require(msg.sender == game.player1 || msg.sender == game.player2, "Not authorized");
        require(game.outcome == GameOutcome.Pending, "Game already complete");

        if (msg.sender == game.player1) {
            require(!game.move1Submitted, "Move already submitted");
            game.move1 = move;
            game.move1Submitted = true;
        } else {
            require(!game.move2Submitted, "Move already submitted");
            game.move2 = move;
            game.move2Submitted = true;
        }

        emit MoveSubmitted(gameId, msg.sender);

        if (game.move1Submitted && game.move2Submitted) {
            _determineWinner(gameId);
        }
    }

    function _determineWinner(uint256 gameId) internal {
        Game storage game = games[gameId];

        Move move1 = game.move1;
        Move move2 = game.move2;

        GameOutcome outcome;

        if (move1 == move2) {
            outcome = GameOutcome.Tie;
        } else if (
            (move1 == Move.Rock && move2 == Move.Scissors) ||
            (move1 == Move.Paper && move2 == Move.Rock) ||
            (move1 == Move.Scissors && move2 == Move.Paper)
        ) {
            outcome = GameOutcome.Player1Wins;
        } else {
            outcome = GameOutcome.Player2Wins;
        }

        game.outcome = outcome;

        emit GameComplete(gameId, outcome);
    }

    function getGame(uint256 gameId) external view returns (Game memory) {
        return games[gameId];
    }
}
