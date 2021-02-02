

(function (document) {
    'use strict';

    var SHIP = 0,
        MISS = 1,
        HIT = 2,
        hitsMade,
        hitsToWin,
        ships = [4, 3, 2, 1],
        // TODO: look into Int8Array on these big matrices for performance
        positions = [],
        probabilities = [],
        hitsSkewProbabilities = true,
        skewFactor = 2,
        boardSize = 5,
        classMapping = ['ship', 'miss', 'hit'],
        board,
        resultMsg,
        volleyButton,
        monteCarlo = false;

    // run immediately
    initialize();

    function initialize() {
        board = document.getElementById('board');
        resultMsg = document.getElementById('result');
        volleyButton = document.getElementById('volley');
        volleyButton.onclick = (monteCarlo ? runMonteCarlo : beginVolley);
        setupBoard();
    }

    function setupBoard() {
        // initialize positions matrix
        for (var y = 0; y < boardSize; y++) {
            positions[y] = [];
            for (var x = 0; x < boardSize; x++) {
                positions[y][x] = null;
            }
        }

        // determine hits to win given the set of ships
        hitsMade = hitsToWin = 0;
        for (var i = 0, l = ships.length; i < l; i++) {
            hitsToWin += ships[i];
        }

        distributeShips();
        recalculateProbabilities();
        redrawBoard(true);
    }

    function distributeShips() {
        var pos, shipPlaced, vertical;
        for (var i = 0, l = ships.length; i < l; i++) {
            shipPlaced = false;
            vertical = randomBoolean();
            while (!shipPlaced) {
                pos = getRandomPosition();
                shipPlaced = placeShip(pos, ships[i], vertical);
            }
        }
    }

    function placeShip(pos, shipSize, vertical) {
        // "pos" is ship origin
        var x = pos[0],
            y = pos[1],
            z = (vertical ? y : x),
            end = z + shipSize - 1;

        if (shipCanOccupyPosition(SHIP, pos, shipSize, vertical)) {
            for (var i = z; i <= end; i++) {
                if (vertical) positions[x][i] = SHIP;
                else positions[i][y] = SHIP;
            }
            return true;
        }

        return false;
    }

    function redrawBoard(displayProbability) {
        if (monteCarlo) return; // no need to draw when testing thousands of boards
        var boardHTML = '';
        for (var y = 0; y < boardSize; y++) {
            boardHTML += '<tr>';
            for (var x = 0; x < boardSize; x++) {
                var thisPos = positions[x][y];
                boardHTML += '<td class="';
                if (thisPos !== null) boardHTML += classMapping[thisPos];
                boardHTML += '">';
                if (displayProbability && thisPos != MISS && thisPos !== HIT) boardHTML += probabilities[x][y];
                boardHTML += '</td>';
            }
            boardHTML += '</tr>';
        }
        board.innerHTML = boardHTML;
    }

    function recalculateProbabilities() {
        var hits = [];

        // reset probabilities
        for (var y = 0; y < boardSize; y++) {
            probabilities[y] = [];
            for (var x = 0; x < boardSize; x++) {
                probabilities[y][x] = 0;
                // we remember hits as we find them for skewing
                if (hitsSkewProbabilities && positions[x][y] === HIT) {
                    hits.push([x, y]);
                }
            }
        }

        // calculate probabilities for each type of ship
        for (var i = 0, l = ships.length; i < l; i++) {
            for (var y = 0; y < boardSize; y++) {
                for (var x = 0; x < boardSize; x++) {
                    // horizontal check
                    if (shipCanOccupyPosition(MISS, [x, y], ships[i], false)) {
                        increaseProbability([x, y], ships[i], false);
                    }
                    // vertical check
                    if (shipCanOccupyPosition(MISS, [x, y], ships[i], true)) {
                        increaseProbability([x, y], ships[i], true);
                    }
                }
            }
        }

        // skew probabilities for positions adjacent to hits
        if (hitsSkewProbabilities) {
            skewProbabilityAroundHits(hits);
        }
    }

    function increaseProbability(pos, shipSize, vertical) {
        // "pos" is ship origin
        var x = pos[0],
            y = pos[1],
            z = (vertical ? y : x),
            end = z + shipSize - 1;

        for (var i = z; i <= end; i++) {
            if (vertical) probabilities[x][i]++;
            else probabilities[i][y]++;
        }
    }

    function skewProbabilityAroundHits(toSkew) {
        var uniques = [];

        // add adjacent positions to the positions to be skewed
        for (var i = 0, l = toSkew.length; i < l; i++) {
            toSkew = toSkew.concat(getAdjacentPositions(toSkew[i]));
        }

        // store uniques to avoid skewing positions multiple times
        // TODO: do A/B testing to see if doing this with strings is efficient
        for (var i = 0, l = toSkew.length; i < l; i++) {
            var uniquesStr = uniques.join('|').toString();
            if (uniquesStr.indexOf(toSkew[i].toString()) === -1) {
                uniques.push(toSkew[i]);

                // skew probability
                var x = toSkew[i][0],
                    y = toSkew[i][1];
                probabilities[x][y] *= skewFactor;
            }
        }
    }

    function getAdjacentPositions(pos) {
        var x = pos[0],
            y = pos[1],
            adj = [];

        if (y + 1 < boardSize) adj.push([x, y + 1]);
        if (y - 1 >= 0) adj.push([x, y - 1]);
        if (x + 1 < boardSize) adj.push([x + 1, y]);
        if (x - 1 >= 0) adj.push([x - 1, y]);

        return adj;
    }

    function shipCanOccupyPosition(criteriaForRejection, pos, shipSize, vertical) { // TODO: criteriaForRejection is an awkward concept, improve
        // "pos" is ship origin
        var x = pos[0],
            y = pos[1],
            z = (vertical ? y : x),
            end = z + shipSize - 1;

        // board border is too close
        if (end > boardSize - 1) return false;

        // check if there's an obstacle
        for (var i = z; i <= end; i++) {
            var thisPos = (vertical ? positions[x][i] : positions[i][y]);
            if (thisPos === criteriaForRejection) return false;
        }

        return true;
    }

    function beginVolley() {
        if (hitsMade > 0) setupBoard();
        resultMsg.innerHTML = '';
        volleyButton.disabled = true;
        var moves = 0,
            volley = setInterval(function () {
                fireAtBestPosition();
                sleepThenAct();
                moves++;
                if (hitsMade === hitsToWin) {
                    resultMsg.innerHTML = 'All ships sunk in ' + moves + ' moves.';
                    clearInterval(volley);
                    volleyButton.disabled = false;
                }
            }, 50);
    }

    function fireAtBestPosition() {
        var pos = getBestUnplayedPosition(),
            x = pos[0],
            y = pos[1];

        if (positions[x][y] === SHIP) {
            positions[x][y] = HIT;
            hitsMade++;
        } else positions[x][y] = MISS;
        //setTimeout(() => {  console.log("x , y"); }, 20000);
        //await sleep(2000);
        recalculateProbabilities();
        redrawBoard(true);
    }

    function getBestUnplayedPosition() {
        var bestProb = 0,
            bestPos;

        // so far there is no tie-breaker -- first position
        // with highest probability on board is returned
        for (var y = 0; y < boardSize; y++) {
            for (var x = 0; x < boardSize; x++) {
                if (!positions[x][y] && probabilities[x][y] > bestProb) {
                    bestProb = probabilities[x][y];
                    bestPos = [x, y];
                }
            }
        }

        return bestPos;
    }

    function getRandomPosition() {
        var x = Math.floor(Math.random() * 10)%boardSize,
            y = Math.floor(Math.random() * 10)%boardSize;

        return [x, y];
    }

    function randomBoolean() {
        return (Math.round(Math.random()) == 1);
    }

    function runMonteCarlo() {
        var elapsed, sum = 0,
            runs = (hitsSkewProbabilities ? 50 : 1000);

        elapsed = (new Date()).getTime();

        for (var i = 0; i < runs; i++) {
            var moves = 0;
            setupBoard();
            while (hitsMade < hitsToWin) {
                fireAtBestPosition();
                moves++;
            }
            sum += moves;
        }

        elapsed = (new Date()).getTime() - elapsed;
        console.log('test duration: ' + elapsed + 'ms');

        resultMsg.innerHTML = 'Average moves: ' + (sum / runs);
    }
    function sleepFor( sleepDuration ){
        var now = new Date().getTime();
        while(new Date().getTime() < now + sleepDuration){ /* do nothing */ } 
    }
    function sleepThenAct(){
        sleepFor(2000);
        console.log("hello js sleep !");
    }

}(document));