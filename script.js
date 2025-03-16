document.addEventListener('DOMContentLoaded', () => {
  // Variables to keep track of the last cell and time for dwell control
  let lastCellIndex = null;
  let lastCellTime = 0;
  const dwellThreshold = 500; // Time in milliseconds to dwell on a cell

  //references to all the important elements
  const container = document.querySelector('.container');
  const board = document.getElementById('game-board');
  const resetButton = document.getElementById('reset-button');
  const difficultySelect = document.getElementById('difficulty');
  const gameOverMessage = document.getElementById('game-over-message');
  const cameraModeButton = document.getElementById('camera-mode-button');
  const videoElement = document.getElementById('video');
  const canvasElement = document.getElementById('outputCanvas');
  const canvasCtx = canvasElement.getContext('2d');

  // Game related variables
  const player = 'X';
  const computer = 'O';
  let cells = [];
  let gameActive = true;
  let cameraModeActive = false;

  // Winning combinations for Tic-Tac-Toe
  const winningCombinations = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ];

  // Set up MediaPipe Hands
  const hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
  });
  hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    minDetectionConfidence: 0.7,
    minTrackingConfidence: 0.7
  });
  hands.onResults(onResults);

  // Set up the camera
  const camera = new Camera(videoElement, {
    onFrame: async () => {
      await hands.send({ image: videoElement });
    },
    width: 640,
    height: 480
  });

  // Toggle camera mode on button click
  cameraModeButton.addEventListener("click", () => {
    cameraModeActive = !cameraModeActive;
    document.body.classList.toggle("camera-active", cameraModeActive);

    if (cameraModeActive) {
        videoElement.style.display = "block";
        videoElement.play();  // Start video feed
        canvasElement.style.display = "block";

        // Make video and canvas full screen
        videoElement.style.position = "fixed";
        videoElement.style.top = "0";
        videoElement.style.left = "0";
        videoElement.style.width = "100vw";
        videoElement.style.height = "100vh";
        videoElement.style.objectFit = "cover";
        videoElement.style.zIndex = "1"; // Behind everything

        canvasElement.style.position = "fixed";
        canvasElement.style.top = "0";
        canvasElement.style.left = "0";
        canvasElement.style.width = "100vw";
        canvasElement.style.height = "100vh";
        canvasElement.style.zIndex = "2"; // Above the video

        camera.start();
    } else {
        videoElement.style.display = "none";
        canvasElement.style.display = "none";
        videoElement.pause(); // Stop video feed
        camera.stop();
    }
  });

  // Create the game board
  function createBoard() {
    cells = [];
    board.innerHTML = '';

    for (let i = 0; i < 9; i++) {
        const cell = document.createElement('div');
        cell.classList.add('cell');
        cell.dataset.index = i;

        // Add click event listener to each cell
        cell.addEventListener('click', () => handleCellClick(i));

        board.appendChild(cell);
        cells.push(cell);
    }

    gameOverMessage.textContent = '';
    gameActive = true;

    // If "Hard (Computer First)" is selected, let the computer move first
    setTimeout(() => {
        if (difficultySelect.value === 'hard_computer_first' && gameActive) {
            computerMove();
        }
    }, 500);
  }

  // Handle cell click
  function handleCellClick(index) {
    if (!gameActive || cells[index].textContent) return;
    cells[index].textContent = player;

    if (checkWin(player)) {
      gameOverMessage.textContent = 'You win!';
      gameActive = false;
      return;
    }

    if (isBoardFull()) {
      gameOverMessage.textContent = "It's a tie!";
      gameActive = false;
      return;
    }

    setTimeout(computerMove, 500);
  }

  // Computer's move using MCTS
  function computerMove() {
    let move = mctsMove();
    if (move !== null) {
      cells[move].textContent = computer;
      if (checkWin(computer)) {
        gameOverMessage.textContent = 'Computer wins!';
        gameActive = false;
        return;
      }
      if (isBoardFull()) {
        gameOverMessage.textContent = "It's a tie!";
        gameActive = false;
        return;
      }
    }
  }

  // Monte Carlo Tree Search for the best move
  function mctsMove() {
    const simulations = 1000;  // Number of simulations per move
    let bestMove = null;
    let bestScore = -Infinity;

    for (let i = 0; i < 9; i++) {
      if (!cells[i].textContent) { // If cell is empty, simulate games from this move
        let wins = 0;
        let visits = 0;
        let raveScore = 0;

        for (let j = 0; j < simulations; j++) {
          const result = simulateRandomGame(i);
          if (result === computer) wins++;
          visits++;

          // RAVE heuristic: Reward good moves early
          raveScore += (result === computer ? 1 : 0.5);
        }

        // Calculate final move score using UCT and RAVE
        const winRate = wins / visits;
        const raveWeight = 0.2;
        const finalScore = winRate * (1 - raveWeight) + (raveScore / simulations) * raveWeight;

        if (finalScore > bestScore) {
          bestScore = finalScore;
          bestMove = i;
        }
      }
    }
    return bestMove;
  }

  // Simulate a random game from a given start index
  function simulateRandomGame(startIndex) {
    const boardCopy = cells.map(cell => ({ textContent: cell.textContent }));
    boardCopy[startIndex].textContent = computer;
    let currentPlayer = player;

    while (true) {
      if (checkWinForMCTS(boardCopy, computer)) return computer;
      if (checkWinForMCTS(boardCopy, player)) return player;
      if (isBoardFullForMCTS(boardCopy)) return 'tie';

      const emptyCells = boardCopy.filter(cell => !cell.textContent);
      if (emptyCells.length === 0) return 'tie';

      const randomCell = emptyCells[Math.floor(Math.random() * emptyCells.length)];
      randomCell.textContent = currentPlayer;
      currentPlayer = currentPlayer === player ? computer : player;
    }
  }

  // Check if a player has won
  function checkWin(currentPlayer) {
    return winningCombinations.some(combo =>
      combo.every(index => cells[index].textContent === currentPlayer)
    );
  }

  // Check win for MCTS simulation
  function checkWinForMCTS(board, currentPlayer) {
    return winningCombinations.some(combo =>
      combo.every(index => board[index].textContent === currentPlayer)
    );
  }

  // Check if the board is full
  function isBoardFull() {
    return cells.every(cell => cell.textContent);
  }

  // Check if the board is full for MCTS simulation
  function isBoardFullForMCTS(board) {
    return board.every(cell => cell.textContent);
  }

  // Handle results from MediaPipe Hands
  function onResults(results) {
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

    // Flip the video output before drawing it
    canvasCtx.translate(canvasElement.width, 0);
    canvasCtx.scale(-1, 1); // Mirror the video feed
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.restore(); // Restore context for correct hand tracking

    if (results.multiHandLandmarks) {
        for (const landmarks of results.multiHandLandmarks) {

            // Flip hand tracking points to match the flipped video
            const flippedLandmarks = landmarks.map(point => ({
                x: 1 - point.x, // Invert only X coordinate
                y: point.y,
                z: point.z
            }));

            drawConnectors(canvasCtx, flippedLandmarks, HAND_CONNECTIONS, { color: '#00FF00', lineWidth: 4 });
            drawLandmarks(canvasCtx, flippedLandmarks, { color: '#FF0000', lineWidth: 2 });

            // Use the flipped landmarks
            const indexTip = flippedLandmarks[8]; // Index finger tip landmark
            const x = indexTip.x * videoElement.clientWidth;
            const y = indexTip.y * videoElement.clientHeight;

            // Scale with the board size
            const boardRect = board.getBoundingClientRect();
            const boardWidth = boardRect.width;
            const boardHeight = boardRect.height;

            // Calculate column & row
            const col = Math.floor(((x - boardRect.left) / boardWidth) * 3);
            const row = Math.floor(((y - boardRect.top) / boardHeight) * 3);
            const cellIndex = row * 3 + col;

            if (cells[cellIndex] && !cells[cellIndex].textContent) {
                if (lastCellIndex === cellIndex) {
                    if (Date.now() - lastCellTime > 2000) { // 2 seconds dwell time
                        cells[cellIndex].click();
                        lastCellIndex = null;
                        lastCellTime = 0;
                    }
                } else {
                    lastCellIndex = cellIndex;
                    lastCellTime = Date.now();
                }
            } else {
                lastCellIndex = null; // Reset dwell time if finger moves away
                lastCellTime = 0;
            }
        }
    }
    canvasCtx.restore();
  }

  // Reset the game
  function resetGame() {
    createBoard();
  }

  // Add event listener to reset button
  resetButton.addEventListener('click', resetGame);
  createBoard();
});