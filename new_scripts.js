

(function (document) {
    'use strict';

    var SHIP = 0,
        MISS = 1,
        HIT = 2,
        hitsMade,
        hitsToWin,
        ships = [4, 3, 2],
        // TODO: look into Int8Array on these big matrices for performance
        infinispan_positions = [],
        infinispan_probabilities = [],
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
        volleyButton.onclick = (monteCarlo ? runMonteCarlo : gameServer);
        setupBoard();
    }

    function matprint(mat) {
        let shape = [mat.length, mat[0].length];
        for(var x=0; x<shape[0]; x++) {
            for(var y=0; y<shape[1]; y++) {
                if (mat[x][y] ==null){
                    mat[x][y] = -1;
                }
            }
        }
        function col(mat, i) {
            return mat.map(row => row[i]);
        }
        let colMaxes = [];
        for (let i = 0; i < shape[1]; i++) {
            colMaxes.push(Math.max.apply(null, col(mat, i).map(n => n.toString().length)));
        }

        mat.forEach(row => {
            console.log.apply(null, row.map((val, j) => {
                return new Array(colMaxes[j]-val.toString().length+1).join(" ") + val.toString() + "  ";
            }));
        });
    }

    function setupBoard() {


        // determine hits to win given the set of ships
        hitsMade = hitsToWin = 0;
        for (var i = 0, l = ships.length; i < l; i++) {
            hitsToWin += ships[i];
        }

        infinispan_positions = distributeShips();
        //recalculateProbabilities();
        redrawBoard(false, infinispan_positions, null);
    }

    function distributeShips() {
        var initialPositions = [];
        // initialize positions matrix
        for (var y = 0; y < boardSize; y++) {
            initialPositions[y] = [];
            for (var x = 0; x < boardSize; x++) {
                initialPositions[y][x] = null;
            }
        }
        infinispan_positions = initialPositions;

        var pos, shipPlaced, vertical;
        for (var i = 0, l = ships.length; i < l; i++) {
            shipPlaced = false;
            vertical = randomBoolean();
            while (!shipPlaced) {
                pos = getRandomPosition();
                shipPlaced = placeShip(pos, ships[i], vertical);
            }
        }
        return infinispan_positions;
    }

    function placeShip(pos, shipSize, vertical) {
        // "pos" is ship origin
        var x = pos[0],
            y = pos[1],
            z = (vertical ? y : x),
            end = z + shipSize - 1;

        if (shipCanOccupyPosition(SHIP, pos, shipSize, vertical)) {
            for (var i = z; i <= end; i++) {
                if (vertical) infinispan_positions[x][i] = SHIP;
                else infinispan_positions[i][y] = SHIP;
            }
            return true;
        }

        return false;
    }

    function redrawBoard(displayProbability, boardState, boardProbabilities) {
        if (monteCarlo) return; // no need to draw when testing thousands of boards
        if (!boardProbabilities) return;
        var boardHTML = '';
        for (var x = 0; x < boardSize; x++) {
            boardHTML += '<tr>';
            for (var y = 0; y < boardSize; y++) {
                var thisPos = boardState[x][y];
                boardHTML += '<td class="';
                if (thisPos !== null) boardHTML += classMapping[thisPos];
                boardHTML += '">';
                if (displayProbability && thisPos != MISS && thisPos !== HIT) boardHTML += boardProbabilities[x][y];
                boardHTML += '</td>';
            }
            boardHTML += '</tr>';
        }
        board.innerHTML = boardHTML;
    }

    function recalculateProbabilities(boardState, boardProbabilities) {
        var hits = [];

        // reset probabilities
        for (var y = 0; y < boardSize; y++) {
            boardProbabilities[y] = [];
            for (var x = 0; x < boardSize; x++) {
                boardProbabilities[y][x] = 0;
                // we remember hits as we find them for skewing
                if (hitsSkewProbabilities && boardState[x][y] === HIT) {
                    hits.push([x, y]);
                }
            }
        }

        // calculate probabilities for each type of ship
        for (var i = 0, l = ships.length; i < l; i++) {
            for (var y = 0; y < boardSize; y++) {
                for (var x = 0; x < boardSize; x++) {
                    // horizontal check
                    if (shipCanOccupyPosition(MISS, [x, y], ships[i], false, boardState)) {
                        boardProbabilities = increaseProbability([x, y], ships[i], false, boardProbabilities);
                    }
                    // vertical check
                    if (shipCanOccupyPosition(MISS, [x, y], ships[i], true, boardState)) {
                        boardProbabilities = increaseProbability([x, y], ships[i], true, boardProbabilities);
                    }
                }
            }
        }

        // skew probabilities for positions adjacent to hits
        if (hitsSkewProbabilities) {
            boardProbabilities = skewProbabilityAroundHits(hits, boardProbabilities);
        }
        return boardProbabilities;
    }

    function increaseProbability(pos, shipSize, vertical, boardProbabilities) {
        // "pos" is ship origin
        var x = pos[0],
            y = pos[1],
            z = (vertical ? y : x),
            end = z + shipSize - 1;

        for (var i = z; i <= end; i++) {
            if (vertical) boardProbabilities[x][i]++;
            else boardProbabilities[i][y]++;
        }
        return boardProbabilities;
    }

    function skewProbabilityAroundHits(toSkew, boardProbabilities) {
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
                boardProbabilities[x][y] *= skewFactor;
            }
        }
        return boardProbabilities;
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
            var thisPos = (vertical ? infinispan_positions[x][i] : infinispan_positions[i][y]);
            if (thisPos === criteriaForRejection) return false;
        }

        return true;
    }

    function gameServer() {
        if (hitsMade > 0) setupBoard();
        resultMsg.innerHTML = '';
        volleyButton.disabled = true;
        var moves = 0,
            volley = setInterval(function () {
                //
                // #1 GET Su
                //
                //TODO: move to state json
                var currentUserBoardState = infinispan_positions;
                //matprint(currentUserBoardState);
                //
                // #2 call AI User Service with Su
                //
                var ai_user_response = ai_user_service(currentUserBoardState);
                var x = ai_user_response[0],
                    y = ai_user_response[1],
                    newboardProbabilities = ai_user_response[2];

                var newUserBoardState = currentUserBoardState;
                //
                // #3 Check if HIT/MISS with (x,y)
                //
                if(isPositionHit(currentUserBoardState, x, y)){
                    newUserBoardState[x][y] = HIT;
                    //TODO: move to state json
                    hitsMade++;
                    console.log("  hit!!!");
                } else {
                    newUserBoardState[x][y] = MISS
                    console.log("  miss");
                }

                //var newUserBoardState = updateBoardState(currentUserBoardState, x, y);
                //
                // #4 Update Su
                //
                infinispan_positions = newUserBoardState;
                redrawBoard(true, newUserBoardState, newboardProbabilities);
                sleepThenAct();
                moves++;
                if (hitsMade === hitsToWin) {
                    resultMsg.innerHTML = 'All ships sunk in ' + moves + ' moves.';
                    clearInterval(volley);
                    volleyButton.disabled = false;
                }
            }, 50);
    }
    
    function ai_user_service(boardState) {
        // get from AI probability service
        // TODO probabilities comes from infinispan.
        var boardProbabilities = infinispan_probabilities;
        var newboardProbabilities = recalculateProbabilities(boardState, boardProbabilities);
        infinispan_probabilities = newboardProbabilities;
        matprint(infinispan_probabilities);
        var pos = getNextPosition(boardState, newboardProbabilities),
            x = pos[0],
            y = pos[1];
        console.log("  x=",x,"  y=",y);
        return [x, y, newboardProbabilities];
    }
    
    function updateBoardState(boardState, x, y){
        if(isPositionHit(boardState, x, y)){
            boardState[x][y] = HIT;
            //TODO: move to state json
            hitsMade++;
        } else {
            boardState[x][y] = MISS
        }
        return boardState;
    }
    function isPositionHit(boardState, x, y) {
        if (boardState[x][y] === SHIP) {
            return true;
        } else return false;
    }

    function isPositionUnPlayed(boardState, x, y) {
        // if null then not played.
        //TODO define what is unplayed state
        if(boardState[x][y])
            return false;
        else
            return true;
    }
    function fireAtBestPosition() {
        var currentUserBoardState = infinispan_positions;
        var boardProbabilities = infinispan_probabilities;
        var newboardProbabilities = recalculateProbabilities(currentUserBoardState, boardProbabilities);
        infinispan_probabilities = newboardProbabilities;
        var pos = getNextPosition(currentUserBoardState, boardProbabilities),
            x = pos[0],
            y = pos[1];

        if (currentUserBoardState[x][y] === SHIP) {
            currentUserBoardState[x][y] = HIT;
            hitsMade++;
        } else currentUserBoardState[x][y] = MISS;
        infinispan_positions = currentUserBoardState;
        //setTimeout(() => {  console.log("x , y"); }, 20000);
        //await sleep(2000);
        //recalculateProbabilities();

        //redrawBoard(true);
    }

    function getNextPosition(boardState, boardProbabilities) {
        var bestProbability = 0,
            bestPosition;
        // so far there is no tie-breaker -- first position
        // with highest probability on board is returned
        for (var x = 0; x < boardSize; x++) {
            for (var y = 0; y < boardSize; y++) {
                if (isPositionUnPlayed(boardState, x, y) && boardProbabilities[x][y] > bestProbability) {
                    bestProbability = boardProbabilities[x][y];
                    bestPosition = [x, y];
                }
            }
        }
        return bestPosition;
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
            runs = (hitsSkewProbabilities ? 500 : 100000);

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
        console.log("---------------");
    }

}(document));