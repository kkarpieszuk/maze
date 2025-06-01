document.addEventListener('DOMContentLoaded', () => {

	const unlockHerbs = 25 * 14,
		unlockBrain = 20 * 11,
		unlockPhone = 30 * 17;

	// Pobierz liczbę kolumn z URL jeśli jest podana
	function getColsFromUrl() {
		const params = new URLSearchParams(window.location.search);
		const cols = parseInt(params.get('cols'), 10);
		return isNaN(cols) ? null : cols;
	}

	const grid = document.querySelector('.maze-grid');
	let cols = getColsFromUrl() || parseInt(grid.getAttribute('data-cols'), 10);
	grid.setAttribute('data-cols', cols);
	const cellSizePx = window.innerWidth * 0.95 / cols;
	const rows = Math.floor(window.innerHeight / cellSizePx);

	// Ustaw zmienne CSS dla gridu
	grid.style.setProperty('--cols', cols);
	grid.style.setProperty('--rows', rows);
	grid.style.setProperty('--cell-size', `${cellSizePx}px`);

	// Maze generation helpers
	function index(x, y) {
		if (x < 0 || y < 0 || x >= cols || y >= rows) return -1;
		return y * cols + x;
	}

	// Maze cell structure
	function createMazeArray() {
		const maze = [];
		for (let y = 0; y < rows; y++) {
			for (let x = 0; x < cols; x++) {
				maze.push({
					x, y,
					walls: [true, true, true, true], // top, right, bottom, left
					visited: false
				});
			}
		}
		return maze;
	}

	// DFS maze generation
	function generateMaze() {
		const maze = createMazeArray();
		const stack = [];
		let current = maze[0];
		current.visited = true;
		let visitedCount = 1;
		const total = rows * cols;

		while (visitedCount < total) {
			// Find unvisited neighbors
			const neighbors = [];
			const dirs = [
				[0, -1, 0], // top
				[1, 0, 1],  // right
				[0, 1, 2],  // bottom
				[-1, 0, 3]  // left
			];
			dirs.forEach(([dx, dy, dir]) => {
				const nx = current.x + dx;
				const ny = current.y + dy;
				const ni = index(nx, ny);
				if (ni !== -1 && !maze[ni].visited) {
					neighbors.push({cell: maze[ni], dir});
				}
			});
			if (neighbors.length > 0) {
				// Choose random neighbor
				const {cell: next, dir} = neighbors[Math.floor(Math.random() * neighbors.length)];
				// Remove wall between current and next
				current.walls[dir] = false;
				next.walls[(dir + 2) % 4] = false;
				stack.push(current);
				current = next;
				current.visited = true;
				visitedCount++;
			} else if (stack.length > 0) {
				current = stack.pop();
			}
		}
		return maze;
	}

	// Wyczyść grid
	grid.innerHTML = '';
	// Wygeneruj labirynt
	const maze = generateMaze();
	// Dodaj komórki z odpowiednimi ścianami
	for (let i = 0; i < rows * cols; i++) {
		const cell = document.createElement('div');
		cell.className = 'cell';
		const [top, right, bottom, left] = maze[i].walls;
		if (top) cell.classList.add('wall-top');
		if (right) cell.classList.add('wall-right');
		if (bottom) cell.classList.add('wall-bottom');
		if (left) cell.classList.add('wall-left');
		// Dodaj ludzika na pierwszym polu
		if (i === 0) {
			const hero = document.createElement('div');
			hero.className = 'hero';
			cell.appendChild(hero);
		}
		grid.appendChild(cell);
	}

	// Ruch ludzika
	let heroX = 0;
	let heroY = 0;
	let heroMemory = [{x: 0, y: 0}]; // pamięć ostatnich 10 pól
	let visionRange = 2; // początkowy zasięg widzenia
	let endVisionRange = 0; // ile pól wokół końca jest widocznych (oprócz samego końca)

	// --- Pamięć mózgu ---
	let brainCollected = false;
	let allVisitedByHero = new Set([index(0, 0)]);
	let allVisitedByAmbulance = new Set();

	// Popraw isInMemory: pole jest widoczne jeśli odwiedziła je karetka, albo gracz (z mózgiem), albo jest w heroMemory
	function isInMemory(x, y) {
		const idx = index(x, y);
		if (allVisitedByAmbulance.has(idx)) return true;
		if (brainCollected && allVisitedByHero.has(idx)) return true;
		return heroMemory.some(pos => pos.x === x && pos.y === y);
	}

	// Wyznacz ścieżkę start-meta po wygenerowaniu labiryntu
	let solutionPath = [];
	function findSolutionPath() {
		// BFS od (0,0) do (cols-1,rows-1) po wygenerowanym labiryncie
		const prev = Array(rows * cols).fill(null);
		const queue = [0];
		const visited = Array(rows * cols).fill(false);
		visited[0] = true;
		while (queue.length) {
			const idx = queue.shift();
			const x = idx % cols;
			const y = Math.floor(idx / cols);
			if (x === cols - 1 && y === rows - 1) break;
			const cell = maze[idx];
			// top
			if (!cell.walls[0] && y > 0) {
				const ni = index(x, y - 1);
				if (!visited[ni]) { prev[ni] = idx; visited[ni] = true; queue.push(ni); }
			}
			// right
			if (!cell.walls[1] && x < cols - 1) {
				const ni = index(x + 1, y);
				if (!visited[ni]) { prev[ni] = idx; visited[ni] = true; queue.push(ni); }
			}
			// bottom
			if (!cell.walls[2] && y < rows - 1) {
				const ni = index(x, y + 1);
				if (!visited[ni]) { prev[ni] = idx; visited[ni] = true; queue.push(ni); }
			}
			// left
			if (!cell.walls[3] && x > 0) {
				const ni = index(x - 1, y);
				if (!visited[ni]) { prev[ni] = idx; visited[ni] = true; queue.push(ni); }
			}
		}
		// Odtwórz ścieżkę od mety do startu
		let path = [];
		let cur = index(cols - 1, rows - 1);
		while (cur !== null) {
			path.push(cur);
			cur = prev[cur];
		}
		solutionPath = path.reverse();
	}

	// Liczba widocznych pól ścieżki od końca (meta) po zjedzeniu liści
	let solutionRevealed = 1; // na początku tylko meta

	// Oryginalna logika widoczności jako baseIsVisible
	function baseIsVisible(x, y) {
		// Pole docelowe zawsze widoczne
		if (x === cols - 1 && y === rows - 1) return true;
		// Pola wokół końca widoczne jeśli zjedzono listki (już nieużywane, ale zostawiam dla kompatybilności)
		if (endVisionRange > 0) {
			const dx = Math.abs(x - (cols - 1));
			const dy = Math.abs(y - (rows - 1));
			if (Math.max(dx, dy) <= endVisionRange) return true;
		}
		// Pole jest widoczne jeśli jest w zasięgu wzroku lub w pamięci
		if (isInMemory(x, y)) return true;
		// Ludzik widzi na odległość visionRange, ale nie przez ściany
		if (Math.abs(x - heroX) + Math.abs(y - heroY) > visionRange) return false;
		// BFS do visionRange kroków, nie przez ściany
		const visited = Array(rows).fill(0).map(() => Array(cols).fill(false));
		const queue = [{x: heroX, y: heroY, d: 0}];
		visited[heroY][heroX] = true;
		while (queue.length) {
			const {x: cx, y: cy, d} = queue.shift();
			if (cx === x && cy === y) return true;
			if (d === visionRange) continue;
			const idx = index(cx, cy);
			const cell = maze[idx];
			// top
			if (!cell.walls[0] && cy > 0 && !visited[cy-1][cx]) {
				visited[cy-1][cx] = true;
				queue.push({x: cx, y: cy-1, d: d+1});
			}
			// right
			if (!cell.walls[1] && cx < cols-1 && !visited[cy][cx+1]) {
				visited[cy][cx+1] = true;
				queue.push({x: cx+1, y: cy, d: d+1});
			}
			// bottom
			if (!cell.walls[2] && cy < rows-1 && !visited[cy+1][cx]) {
				visited[cy+1][cx] = true;
				queue.push({x: cx, y: cy+1, d: d+1});
			}
			// left
			if (!cell.walls[3] && cx > 0 && !visited[cy][cx-1]) {
				visited[cy][cx-1] = true;
				queue.push({x: cx-1, y: cy, d: d+1});
			}
		}
		return false;
	}

	// Nowa funkcja widoczności z obsługą ścieżki
	function isVisibleWithSolution(x, y) {
		// Pole docelowe zawsze widoczne
		if (x === cols - 1 && y === rows - 1) return true;
		// Odsłanianie ścieżki: meta i kolejne pola po zjedzeniu liści
		if (solutionPath.length > 0) {
			const idx = index(x, y);
			const pos = solutionPath.indexOf(idx);
			if (pos !== -1 && pos >= solutionPath.length - solutionRevealed) return true;
		}
		// Reszta widoczności jak wcześniej
		return baseIsVisible(x, y);
	}

	// Zapamiętaj, które pola były widoczne poprzednio
	let prevVisible = null;
	let firstVisibilityUpdate = true;
	function updateVisibility() {
		const gridCells = grid.querySelectorAll('.cell');
		// Wyznacz aktualnie widoczne pola
		const nowVisible = [];
		for (let y = 0; y < rows; y++) {
			for (let x = 0; x < cols; x++) {
				if (isVisibleWithSolution(x, y)) nowVisible.push(index(x, y));
			}
		}
		// Animacja fade-in tylko dla pól, które właśnie się odsłoniły (nie było ich w prevVisible)
		for (let i = 0; i < gridCells.length; i++) {
			const cellDiv = gridCells[i];
			const wasHidden = cellDiv.classList.contains('cell-hidden');
			const shouldBeVisible = nowVisible.includes(i);
			if (shouldBeVisible) {
				if (wasHidden && prevVisible && !firstVisibilityUpdate) {
					cellDiv.classList.remove('cell-hidden', 'cell-fade-out');
					cellDiv.classList.add('cell-fade-in');
					setTimeout(() => {
						cellDiv.classList.remove('cell-fade-in');
					}, 500);
				} else {
					cellDiv.classList.remove('cell-hidden', 'cell-fade-out', 'cell-fade-in');
				}
			} else {
				if (!wasHidden && prevVisible && !firstVisibilityUpdate) {
					cellDiv.classList.add('cell-fade-out');
					setTimeout(() => {
						cellDiv.classList.add('cell-hidden');
						cellDiv.classList.remove('cell-fade-out');
					}, 500);
				} else {
					cellDiv.classList.add('cell-hidden');
					cellDiv.classList.remove('cell-fade-in', 'cell-fade-out');
				}
			}
		}
		prevVisible = nowVisible;
		firstVisibilityUpdate = false;
		updateHerbVisibility();
		updateBrainVisibility();
		updatePhoneVisibility();
	}

	// Listki są widoczne tylko jeśli pole jest widoczne, bez animacji
	function updateHerbVisibility() {
		const gridCells = grid.querySelectorAll('.cell');
		for (let i = 0; i < gridCells.length; i++) {
			const herb = gridCells[i].querySelector('.herb');
			if (herb) {
				const x = i % cols;
				const y = Math.floor(i / cols);
				const ambulanceHere = (ambulancePos && ambulancePos.x === x && ambulancePos.y === y);
				if (gridCells[i].classList.contains('cell-hidden') || ambulanceHere) {
					herb.style.display = 'none';
				} else {
					herb.style.display = '';
				}
			}
		}
	}

	// Mózg jest widoczny tylko jeśli pole jest widoczne, bez animacji
	function updateBrainVisibility() {
		const gridCells = grid.querySelectorAll('.cell');
		for (let i = 0; i < gridCells.length; i++) {
			const brain = gridCells[i].querySelector('.brain');
			if (brain) {
				const x = i % cols;
				const y = Math.floor(i / cols);
				const ambulanceHere = (ambulancePos && ambulancePos.x === x && ambulancePos.y === y);
				if (gridCells[i].classList.contains('cell-hidden') || ambulanceHere) {
					brain.style.display = 'none';
				} else {
					brain.style.display = '';
				}
			}
		}
	}

	// Dodaj telefon na losowym polu
	function placePhone() {
		if ( ( cols * rows ) < unlockPhone) return;

		const numberOfPhones = Math.floor( ( cols * rows ) / unlockPhone ) * 2;

		const gridCells = grid.querySelectorAll('.cell');
		// Zbierz indeksy pól, które nie są startem, metą, liściem, mózgiem, pucharem
		const possible = [];
		for (let y = 0; y < rows; y++) {
			for (let x = 0; x < cols; x++) {
				const idx = index(x, y);
				if ((x === 0 && y === 0) || (x === cols-1 && y === rows-1)) continue;
				if (gridCells[idx].querySelector('.herb')) continue;
				if (gridCells[idx].querySelector('.brain')) continue;
				if (gridCells[idx].querySelector('.cup')) continue;
				possible.push(idx);
			}
		}
		// Umieść numberOfPhones telefonów na losowych możliwych polach (bez powtórzeń)
		const shuffled = possible.sort(() => Math.random() - 0.5);
		for (let i = 0; i < Math.min(numberOfPhones, shuffled.length); i++) {
			const idx = shuffled[i];
			const phone = document.createElement('div');
			phone.className = 'phone';
			gridCells[idx].appendChild(phone);
		}
	}

	// Telefon widoczny tylko jeśli pole widoczne
	function updatePhoneVisibility() {
		const gridCells = grid.querySelectorAll('.cell');
		for (let i = 0; i < gridCells.length; i++) {
			const phone = gridCells[i].querySelector('.phone');
			if (phone) {
				if (gridCells[i].classList.contains('cell-hidden')) {
					phone.style.display = 'none';
				} else {
					phone.style.display = '';
				}
			}
		}
	}

	// Karetka
	let ambulanceActive = false;
	let ambulancePos = null;
	let ambulanceTimer = null;
	let ambulanceDir = null; // 0: góra, 1: prawo, 2: dół, 3: lewo
	let ambulanceWaiting = false;
	let ambulanceWaitCounter = 0;
	let ambulanceWaitDir = null;
	function startAmbulance() {
		if (ambulanceActive) return;
		ambulanceActive = true;
		ambulancePos = {x: cols-1, y: rows-1};
		// Losuj kierunek: 0 (góra) lub 3 (lewo)
		ambulanceDir = Math.random() < 0.5 ? 0 : 3;
		moveAmbulance();
	}
	function moveAmbulance() {
		if (!ambulanceActive) return;
		const gridCells = grid.querySelectorAll('.cell');
		// Usuń starą karetkę
		document.querySelectorAll('.ambulance').forEach(e => e.remove());
		// Dodaj nową karetkę
		const idx = index(ambulancePos.x, ambulancePos.y);
		const cell = gridCells[idx];
		// Obsługa pucharu
		if (ambulancePos.x === cols-1 && ambulancePos.y === rows-1) {
			removeCup();
			ambulanceWasOnCup = true;
		} else if (ambulanceWasOnCup) {
			restoreCup();
			ambulanceWasOnCup = false;
		}
		if (cell) {
			const amb = document.createElement('div');
			amb.className = 'ambulance';
			cell.appendChild(amb);
			// Odsłoń pole na zawsze przez karetkę
			allVisitedByAmbulance.add(idx);
			cell.classList.remove('cell-hidden');
			updateVisibility();
		}

		// Kierunki: 0: góra, 1: prawo, 2: dół, 3: lewo
		const dirs = [
			{dx: 0, dy: -1}, // góra
			{dx: 1, dy: 0},  // prawo
			{dx: 0, dy: 1},  // dół
			{dx: -1, dy: 0}  // lewo
		];
		const mazeCell = maze[idx];
		const forward = ambulanceDir;
		const leftDir = (ambulanceDir + 3) % 4;
		const rightDir = (ambulanceDir + 1) % 4;
		const backDir = (ambulanceDir + 2) % 4;
		const canForward = !mazeCell.walls[forward];
		const canLeft = !mazeCell.walls[leftDir];
		const canRight = !mazeCell.walls[rightDir];

		// --- NOWA LOGIKA: czekanie jeśli obok ludzika ---
		if (!ambulanceWaiting) {
			for (let dir = 0; dir < 4; dir++) {
				const nx = ambulancePos.x + dirs[dir].dx;
				const ny = ambulancePos.y + dirs[dir].dy;
				if (nx === heroX && ny === heroY && !mazeCell.walls[dir]) {
					ambulanceWaiting = true;
					ambulanceWaitCounter = 10; // 10 x 0.5s = 5s
					ambulanceWaitDir = dir;
					ambulanceTimer = setTimeout(moveAmbulance, 500);
					return;
				}
			}
		}
		if (ambulanceWaiting) {
			// Sprawdź czy ludzik nadal jest obok i nie ma ściany
			const nx = ambulancePos.x + dirs[ambulanceWaitDir].dx;
			const ny = ambulancePos.y + dirs[ambulanceWaitDir].dy;
			if (nx === heroX && ny === heroY && !mazeCell.walls[ambulanceWaitDir]) {
				ambulanceWaitCounter--;
				if (ambulanceWaitCounter > 0) {
					ambulanceTimer = setTimeout(moveAmbulance, 500);
					return;
				} else {
					// Zawracaj
					ambulanceDir = (ambulanceWaitDir + 2) % 4;
					ambulancePos.x += dirs[ambulanceDir].dx;
					ambulancePos.y += dirs[ambulanceDir].dy;
					ambulanceWaiting = false;
					ambulanceTimer = setTimeout(moveAmbulance, 500);
					return;
				}
			} else {
				// Ludzik odszedł, jedź normalnie
				ambulanceWaiting = false;
			}
		}
		// --- KONIEC NOWEJ LOGIKI ---

		// Zbierz możliwe opcje
		let options = [];
		if (canForward) options.push({dir: forward, type: 'forward'});
		if (canLeft) options.push({dir: leftDir, type: 'left'});
		if (canRight) options.push({dir: rightDir, type: 'right'});
		// Jeśli można prosto i w bok (co najmniej 2 opcje), losuj z dostępnych
		if (canForward && (canLeft || canRight)) {
			const available = [{dir: forward}];
			if (canLeft) available.push({dir: leftDir});
			if (canRight) available.push({dir: rightDir});
			const choice = available[Math.floor(Math.random() * available.length)];
			ambulanceDir = choice.dir;
			ambulancePos.x += dirs[ambulanceDir].dx;
			ambulancePos.y += dirs[ambulanceDir].dy;
			ambulanceTimer = setTimeout(moveAmbulance, 500);
			return;
		}
		// Jeśli nie można prosto, ale można w bok
		if (!canForward && (canLeft || canRight)) {
			const available = [];
			if (canLeft) available.push({dir: leftDir});
			if (canRight) available.push({dir: rightDir});
			const choice = available[Math.floor(Math.random() * available.length)];
			ambulanceDir = choice.dir;
			ambulancePos.x += dirs[ambulanceDir].dx;
			ambulancePos.y += dirs[ambulanceDir].dy;
			ambulanceTimer = setTimeout(moveAmbulance, 500);
			return;
		}
		// Jeśli można tylko prosto
		if (canForward) {
			ambulancePos.x += dirs[ambulanceDir].dx;
			ambulancePos.y += dirs[ambulanceDir].dy;
			ambulanceTimer = setTimeout(moveAmbulance, 500);
			return;
		}
		// Jeśli nie można prosto ani w bok, zawróć
		if (!mazeCell.walls[backDir]) {
			ambulanceDir = backDir;
			ambulancePos.x += dirs[ambulanceDir].dx;
			ambulancePos.y += dirs[ambulanceDir].dy;
			ambulanceTimer = setTimeout(moveAmbulance, 500);
			return;
		}
		// Jeśli nie ma gdzie iść, zatrzymaj karetkę
		ambulanceActive = false;
	}

	let currentCols = cols;

	function showWinOverlay() {
		const overlay = document.getElementById('win-overlay');
		if (overlay) overlay.style.display = 'flex';
	}
	function hideWinOverlay() {
		const overlay = document.getElementById('win-overlay');
		if (overlay) overlay.style.display = 'none';
	}

	function resetMaze(newCols) {
		// Ustaw nową liczbę kolumn
		const mazeGrid = document.querySelector('.maze-grid');
		mazeGrid.setAttribute('data-cols', newCols);
		// Wyczyść grid
		mazeGrid.innerHTML = '';
		// Przeładuj stronę (z nową liczbą kolumn)
		window.location.reload();
	}

	// --- Overlay startowy ---
	function showStartOverlay() {
		const overlay = document.getElementById('start-overlay');
		if (overlay) {
			overlay.classList.add('fade-in');
			overlay.style.display = 'flex';
			setTimeout(() => {
				overlay.classList.add('fade-in');
			}, 10);
		}
	}
	function hideStartOverlay() {
		const overlay = document.getElementById('start-overlay');
		if (overlay) {
			overlay.classList.add('fade-out');
			setTimeout(() => { overlay.style.display = 'none'; }, 800);
		}
	}
	// Pokazuj overlay tylko jeśli nie przechodzimy do kolejnego poziomu i nie ma ?nohelp=1
	function hasNoHelpParam() {
		return new URLSearchParams(window.location.search).get('nohelp') === '1';
	}
	let showStart = true;
	try {
		if (window.localStorage.getItem('maze-next-level') === '1') {
			showStart = false;
			window.localStorage.removeItem('maze-next-level');
		}
		if (hasNoHelpParam()) showStart = false;
	} catch(e) {}
	if (showStart) showStartOverlay();
	let heroMoves = 0;

	// --- ZIOŁO: znajdź końce ślepych uliczek i dodaj herb ---
	function placeHerbs( force = false ) {
		if ( ( cols * rows ) < unlockHerbs && !force ) return;
		const gridCells = grid.querySelectorAll('.cell');
		for (let y = 0; y < rows; y++) {
			for (let x = 0; x < cols; x++) {
				const idx = index(x, y);
				const cell = maze[idx];
				// Pomijamy start i finish
				if ((x === 0 && y === 0) || (x === cols-1 && y === rows-1)) continue;
				// Liczba ścian
				const wallCount = cell.walls.filter(Boolean).length;
				if (wallCount === 3) {
					// Dodaj listek jeśli nie ma już
					if (!gridCells[idx].querySelector('.herb')) {
						const herb = document.createElement('div');
						herb.className = 'herb';
						gridCells[idx].appendChild(herb);
					}
				}
			}
		}
	}

	// --- MÓZG: dodaj losowo na planszy po umieszczeniu liści ---
	function placeBrain() {
		if ( ( cols * rows ) < unlockBrain) return;

		const numberOfBrains = Math.floor( ( cols * rows ) / unlockBrain ) * 2;

		const gridCells = grid.querySelectorAll('.cell');
		// Zbierz indeksy pól, które nie są startem, metą ani nie mają liścia
		const possible = [];
		for (let y = 0; y < rows; y++) {
			for (let x = 0; x < cols; x++) {
				const idx = index(x, y);
				if ((x === 0 && y === 0) || (x === cols-1 && y === rows-1)) continue;
				if (gridCells[idx].querySelector('.herb')) continue;
				possible.push(idx);
			}
		}
		// Umieść numberOfBrains mózgów na losowych możliwych polach (bez powtórzeń)
		const shuffled = possible.sort(() => Math.random() - 0.5);
		for (let i = 0; i < Math.min(numberOfBrains, shuffled.length); i++) {
			const idx = shuffled[i];
			const brain = document.createElement('div');
			brain.className = 'brain';
			gridCells[idx].appendChild(brain);
		}
	}

	// Po każdym ruchu aktualizuj widoczność i pamięć
	function moveHero(dx, dy) {
		const newX = heroX + dx;
		const newY = heroY + dy;
		const fromIdx = index(heroX, heroY);
		const toIdx = index(newX, newY);
		if (toIdx === -1) return; // poza planszą
		const fromCell = maze[fromIdx];
		const toCell = maze[toIdx];
		// Sprawdź ściany
		if (dx === 1 && fromCell.walls[1]) return; // right
		if (dx === -1 && fromCell.walls[3]) return; // left
		if (dy === 1 && fromCell.walls[2]) return; // bottom
		if (dy === -1 && fromCell.walls[0]) return; // top
		// Przesuń ludzika
		const gridCells = grid.querySelectorAll('.cell');
		const heroDiv = gridCells[fromIdx].querySelector('.hero');
		if (heroDiv) {
			gridCells[toIdx].appendChild(heroDiv);
			heroX = newX;
			heroY = newY;
			heroMemory.push({x: heroX, y: heroY});
			if (heroMemory.length > 10) heroMemory.shift();
			// Zbieranie listka
			const herb = gridCells[toIdx].querySelector('.herb');
			if (herb) {
				herb.remove();
				endVisionRange++;
				solutionRevealed += 2;
			}
			// Zbieranie mózgu
			const brain = gridCells[toIdx].querySelector('.brain');
			if (brain) {
				// Usuń wszystkie mózgi z planszy
				document.querySelectorAll('.brain').forEach(b => b.remove());
				brainCollected = true;
			}
			// Zapamiętaj odwiedzone pole (do mózgu)
			allVisitedByHero.add(toIdx);
			updateVisibility();
			// Sprawdź czy doszedł do prawego dolnego rogu
			if (heroX === cols - 1 && heroY === rows - 1) {
				showWinOverlay();
				removeCup();
			}
			// NOWY WARUNEK: wejście na karetkę
			const ambulanceOnThisCell = (ambulancePos && heroX === ambulancePos.x && heroY === ambulancePos.y);
			if (ambulanceOnThisCell) {
				showWinOverlay();
			}
			// Ukryj overlay po 2 ruchach
			if (showStart) {
				heroMoves++;
				if (heroMoves === 2) {
					hideStartOverlay();
					showStart = false;
				}
			}
			// Zbieranie telefonu
			const phone = gridCells[toIdx].querySelector('.phone');
			if (phone) {
				// Usuń wszystkie telefony z planszy
				document.querySelectorAll('.phone').forEach(p => p.remove());
				startAmbulance();
			}
		}
	}

	updateVisibility();

	  // Obsługa panelu strzałek
		function setupArrowPanel() {
			const btnUp = document.getElementById('arrow-up');
			const btnDown = document.getElementById('arrow-down');
			const btnLeft = document.getElementById('arrow-left');
			const btnRight = document.getElementById('arrow-right');
			if (btnUp) btnUp.addEventListener('click', () => moveHero(0, -1));
			if (btnDown) btnDown.addEventListener('click', () => moveHero(0, 1));
			if (btnLeft) btnLeft.addEventListener('click', () => moveHero(-1, 0));
			if (btnRight) btnRight.addEventListener('click', () => moveHero(1, 0));
		}
		setupArrowPanel();

	// Obsługa klawiatury
	window.addEventListener('keydown', (e) => {
		switch (e.key) {
			case 'ArrowUp':
			case 'w':
			case 'W':
				moveHero(0, -1);
				e.preventDefault();
				break;
			case 'ArrowDown':
			case 's':
			case 'S':
				moveHero(0, 1);
				e.preventDefault();
				break;
			case 'ArrowLeft':
			case 'a':
			case 'A':
				moveHero(-1, 0);
				e.preventDefault();
				break;
			case 'ArrowRight':
			case 'd':
			case 'D':
				moveHero(1, 0);
				e.preventDefault();
				break;
		}
	});

	// Po ustawieniu liczby kolumn, ustaw numer poziomu
	function updateLevelButton() {
		const levelBtn = document.getElementById('level');
		if (levelBtn) {
			levelBtn.querySelector('#level-number').textContent = Math.floor(cols / 5);
		}
	}
	updateLevelButton();

	// Obsługa przycisku "Idź dalej"
	const nextBtn = document.getElementById('next-level-btn');
	if (nextBtn) {
		nextBtn.addEventListener('click', () => {
			hideWinOverlay();
			// Zwiększ liczbę kolumn o 5 i przeładuj labirynt
			let newCols = cols + 5;
			try { window.localStorage.setItem('maze-next-level', '1'); } catch(e){}
			window.location.search = '?cols=' + newCols + '&nohelp=1&v=' + Math.floor(Math.random()*1e8);
			// Po przejściu na nowy poziom zaktualizuj level
			// (w praktyce strona się przeładuje, ale dla spójności)
			updateLevelButton();
		});
	}

	// ENTER na overlayu = kliknij "Idź dalej"
	window.addEventListener('keydown', (e) => {
		if (e.key === 'Enter') {
			const overlay = document.getElementById('win-overlay');
			if (overlay && overlay.style.display !== 'none') {
				const btn = document.getElementById('next-level-btn');
				if (btn) btn.click();
			}
		}
	});

	// Dodaj puchar na polu końcowym
	function placeCup() {
		const gridCells = grid.querySelectorAll('.cell');
		const idx = index(cols - 1, rows - 1);
		if (gridCells[idx] && !gridCells[idx].querySelector('.cup')) {
			const cup = document.createElement('div');
			cup.className = 'cup';
			gridCells[idx].appendChild(cup);
		}
	}

	// Usuwanie/odtwarzanie pucharu na polu końcowym
	function removeCup() {
		const gridCells = grid.querySelectorAll('.cell');
		const idx = index(cols - 1, rows - 1);
		const cup = gridCells[idx].querySelector('.cup');
		if (cup) cup.remove();
	}
	function restoreCup() {
		const gridCells = grid.querySelectorAll('.cell');
		const idx = index(cols - 1, rows - 1);
		if (gridCells[idx] && !gridCells[idx].querySelector('.cup')) {
			const cup = document.createElement('div');
			cup.className = 'cup';
			gridCells[idx].appendChild(cup);
		}
	}

	// Karetka: usuwaj puchar gdy jest na polu końcowym, przywracaj gdy opuści
	let ambulanceWasOnCup = false;

	// --- Overlayy informacyjne o ziołach, mózgach, telefonach ---
	function showInfoOverlay(id) {
		const overlay = document.getElementById(id);
		if (overlay) {
			overlay.classList.add('fade-in');
			overlay.style.display = 'flex';
			setTimeout(() => {
				overlay.classList.add('fade-in');
			}, 10);
		}
	}
	function hideInfoOverlay(id) {
		const overlay = document.getElementById(id);
		if (overlay) {
			overlay.classList.add('fade-out');
			setTimeout(() => { overlay.style.display = 'none'; overlay.classList.remove('fade-in', 'fade-out'); }, 800);
		}
	}

	// Zwraca true jeśli na planszy są zioła, mózgi, telefony
	function hasHerbs() {
		return document.querySelector('.herb') !== null;
	}
	function hasBrains() {
		return document.querySelector('.brain') !== null;
	}
	function hasPhones() {
		return document.querySelector('.phone') !== null;
	}

	// --- POKAZYWANIE OVERLAYÓW PO GENERACJI PLANSZY ---
	let infoOverlayShown = false;
	let infoOverlayType = null;
	let infoOverlayMoves = 0;
	function showInfoOverlayIfNeeded() {
		try {
			if (!infoOverlayShown && hasHerbs() && !window.localStorage.getItem('herb-info-shown')) {
				showInfoOverlay('herb-overlay');
				infoOverlayShown = true;
				infoOverlayType = 'herb-overlay';
				window.localStorage.setItem('herb-info-shown', '1');
			} else if (!infoOverlayShown && hasBrains() && !window.localStorage.getItem('brain-info-shown')) {
				showInfoOverlay('brain-overlay');
				infoOverlayShown = true;
				infoOverlayType = 'brain-overlay';
				window.localStorage.setItem('brain-info-shown', '1');
			} else if (!infoOverlayShown && hasPhones() && !window.localStorage.getItem('phone-info-shown')) {
				showInfoOverlay('phone-overlay');
				infoOverlayShown = true;
				infoOverlayType = 'phone-overlay';
				window.localStorage.setItem('phone-info-shown', '1');
			}
		} catch(e) {}
	}

	// Po wygenerowaniu labiryntu umieść zioła, mózg, puchar, telefon
	placeHerbs();
	placeBrain();
	findSolutionPath();
	placeCup();
	placePhone();
	updateHerbVisibility();
	updateBrainVisibility();
	updatePhoneVisibility();
	showInfoOverlayIfNeeded();

	// W moveHero: jeśli overlay info jest pokazany, zlicz ruchy i schowaj po 2
	const origMoveHero = moveHero;
	moveHero = function(dx, dy) {
		origMoveHero(dx, dy);
		if (infoOverlayShown && infoOverlayType) {
			infoOverlayMoves++;
			if (infoOverlayMoves === 2) {
				hideInfoOverlay(infoOverlayType);
				infoOverlayShown = false;
				infoOverlayType = null;
				infoOverlayMoves = 0;
			}
		}
	};

	window.startAmbulance = startAmbulance;
	window.brainCollected = brainCollected;
	window.placeHerbs = placeHerbs;

	// --- Obsługa restartu gry ---
	const restartBtn = document.getElementById('restart');
	const restartOverlay = document.getElementById('restart-overlay');
	const restartLevelBtn = document.getElementById('restart-level-btn');
	const restartGameBtn = document.getElementById('restart-game-btn');
	const restartCancelBtn = document.getElementById('restart-cancel-btn');
	if (restartBtn && restartOverlay) {
		restartBtn.addEventListener('click', () => {
			restartOverlay.style.display = 'flex';
			restartOverlay.classList.add('fade-in');
		});
	}
	if (restartLevelBtn) {
		restartLevelBtn.addEventListener('click', () => {
			restartOverlay.classList.remove('fade-in');
			window.location.reload();
		});
	}
	if (restartGameBtn) {
		restartGameBtn.addEventListener('click', () => {
			restartOverlay.classList.remove('fade-in');
			try { window.localStorage.clear(); } catch(e){}
			window.location.search = '?cols=5';
		});
	}
	if (restartCancelBtn && restartOverlay) {
		restartCancelBtn.addEventListener('click', () => {
			restartOverlay.style.display = 'none';
			restartOverlay.classList.remove('fade-in');
		});
	}
	window.addEventListener('keydown', (e) => {
		if (restartOverlay && restartOverlay.style.display !== 'none' && e.key === 'Escape') {
			restartOverlay.style.display = 'none';
			restartOverlay.classList.remove('fade-in');
		}
	});

	window.hideInfoOverlay = hideInfoOverlay;
});