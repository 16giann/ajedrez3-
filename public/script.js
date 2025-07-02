// 🎯 Diccionario de EMOJIS para cada tipo de pieza y color
const iconoPieza = {
  torre: { blanco: '♖', negro: '♜' },
  caballo: { blanco: '♘', negro: '♞' },
  alfil: { blanco: '♗', negro: '♝' },
  reina: { blanco: '♕', negro: '♛' },
  rey: { blanco: '♔', negro: '♚' },
  peon: { blanco: '♙', negro: '♟' }
};

// Variables globales de estado de juego
let turno = 'blanco';             // Color que tiene el turno actual
let piezaArrastrada = null;       // Pieza que el usuario está arrastrando (drag & drop)
let tableroActual = window.tableroInicial; // Tablero actual cargado desde el backend
let saltarProximoPolling = false; // Flag para evitar actualización doble tras mover pieza

// Contenedor HTML donde se dibuja el tablero
const contenedor = document.getElementById("tablero");

/**
 * Redibuja completamente el tablero y la interfaz
 * tras recibir datos nuevos desde el servidor.
 * ✅ 2.1.8 - Jugar / Actualizar tablero en tiempo real
 */
function actualizarVista(tablero, nuevoTurno, historial = [], capturadasBlancas = [], capturadasNegras = []) {
  contenedor.innerHTML = "";        // Limpia el tablero anterior

  tableroActual = tablero;          // Guarda nuevo tablero en memoria

  // Recorre cada casilla para crearla dinámicamente
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const colorCasilla = (x + y) % 2 === 0 ? 'blanca' : 'negra';
      const div = document.createElement("div");
      div.className = `casilla ${colorCasilla}`;
      div.dataset.x = x;
      div.dataset.y = y;

      const pieza = tablero[y][x];
      if (pieza) {
        const span = document.createElement("span");
        span.textContent = iconoPieza[pieza.tipo][pieza.color];
        span.classList.add("pieza", pieza.color);
        span.setAttribute("draggable", "true");
        span.dataset.tipo = pieza.tipo;
        span.dataset.color = pieza.color;
        span.dataset.x = x;
        span.dataset.y = y;
        div.appendChild(span);
      }
      contenedor.appendChild(div);
    }
  }

  turno = nuevoTurno; // Actualiza variable global del turno

  console.log("Turno actual en frontend:", turno);

  // Muestra quién tiene el turno en texto
  const turnoElem = document.getElementById("turno-jugador");
  if (turnoElem) {
    turnoElem.textContent = `Turno del equipo ${turno}`;
  }

  // Redibuja historial de movimientos en lista (SOLO últimos 3)
  const lista = document.getElementById("lista-de-movimientos");
  if (lista) {
    lista.innerHTML = "";

    // ✅ Tomar solo los últimos 3 movimientos
    const ultimos = historial.slice(-3);

    ultimos.forEach(mov => {
      const li = document.createElement("li");
      li.textContent = `${mov.pieza} de (${mov.from.x}, ${mov.from.y}) a (${mov.to.x}, ${mov.to.y})`;
      lista.appendChild(li);
    });
  }

  // Muestra piezas capturadas
  const captBlancas = document.querySelector("#capturadas-blancas .contenedor-piezas");
  const captNegras = document.querySelector("#capturadas-negras .contenedor-piezas");
  if (captBlancas && captNegras) {
    captBlancas.innerHTML = "";
    captNegras.innerHTML = "";

    capturadasBlancas.forEach(tipo => {
      const span = document.createElement("span");
      span.textContent = iconoPieza[tipo].negro;
      span.classList.add("pieza", "negro");
      captBlancas.appendChild(span);
    });

    capturadasNegras.forEach(tipo => {
      const span = document.createElement("span");
      span.textContent = iconoPieza[tipo].blanco;
      span.classList.add("pieza", "blanco");
      captNegras.appendChild(span);
    });
  }

  activarEventosDragAndDrop(); // Vuelve a enganchar listeners de drag & drop
}

/**
 * Activa drag and drop sobre las casillas del tablero
 * ✅ 2.1.8 - Jugar
 */
function activarEventosDragAndDrop() {
  document.querySelectorAll(".casilla").forEach(casilla => {
    casilla.addEventListener("dragover", e => e.preventDefault());
    casilla.addEventListener("drop", e => {
      e.preventDefault();
      if (!piezaArrastrada) return;

      const destinoX = parseInt(casilla.dataset.x);
      const destinoY = parseInt(casilla.dataset.y);
      const origenX = parseInt(piezaArrastrada.dataset.x);
      const origenY = parseInt(piezaArrastrada.dataset.y);
      const tipo = piezaArrastrada.dataset.tipo;
      const color = piezaArrastrada.dataset.color;

      // Obtenemos movimientos válidos localmente
      const movimientos = obtenerMovimientosValidos(tipo, origenX, origenY, color, tableroActual);
      const esValido = movimientos.some(([x, y]) => x === destinoX && y === destinoY);

      if (esValido) {
        moverPiezaBackend(origenX, origenY, destinoX, destinoY);
      } else {
        alert("Movimiento no válido según reglas locales");
      }

      piezaArrastrada = null;
    });
  });
}

/**
 * Listener global que detecta el inicio de arrastre de piezas
 */
document.addEventListener("dragstart", (e) => {
  if (e.target.classList.contains("pieza")) {
    const color = e.target.dataset.color;
    if (color !== turno) {
      e.preventDefault(); // Solo se pueden arrastrar piezas si es tu turno
      return;
    }
    piezaArrastrada = e.target;
  }
});

/**
 * Envía un movimiento al servidor (API) y actualiza el tablero
 * ✅ 2.1.8 - Jugar
 */
async function moverPiezaBackend(origenX, origenY, destinoX, destinoY) {
  const movimiento = {
    from: { x: origenX, y: origenY },
    to: { x: destinoX, y: destinoY },
    color: piezaArrastrada.dataset.color
  };

  try {
    const response = await fetch('/api/mover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        codigo: window.codigoPartida,
        movimiento
      })
    });

    const data = await response.json();

    if (data.success) {
      // Si el movimiento fue exitoso, actualizamos la vista
      actualizarVista(
        data.tablero,
        data.turno,
        data.historial,
        data.capturadasBlancas,
        data.capturadasNegras
      );
      tableroActual = data.tablero;
      saltarProximoPolling = true;
    } else {
      alert(data.error || 'Movimiento inválido.');
    }
  } catch (error) {
    console.error("Error al enviar movimiento:", error);
  }
}

/**
 * Devuelve lista de movimientos válidos locales para cada pieza
 * (solo usado para ver si se permite arrastrar una pieza)
 */
function obtenerMovimientosValidos(tipo, x, y, color, tablero) {
  switch (tipo) {
    case 'caballo': return movimientosCaballo(x, y);
    case 'alfil': return movimientosAlfil(x, y);
    case 'torre': return movimientosTorre(x, y);
    case 'reina': return movimientosReina(x, y);
    case 'rey': return movimientosRey(x, y);
    case 'peon': return movimientosPeon(x, y, color, tablero);
    default: return [];
  }
}

// ===========================
// Lógica de movimientos locales (reglas de ajedrez)
// ===========================

function movimientosCaballo(x, y) {
  const movs = [[2,1],[1,2],[-1,2],[-2,1],[-2,-1],[-1,-2],[1,-2],[2,-1]];
  return movs.map(([dx, dy]) => [x + dx, y + dy])
    .filter(([nx, ny]) => nx >= 0 && nx < 8 && ny >= 0 && ny < 8);
}

function movimientosAlfil(x, y) {
  const movimientos = [];
  for (let i = 1; i < 8; i++) {
    if (x + i < 8 && y + i < 8) movimientos.push([x + i, y + i]);
    if (x - i >= 0 && y + i < 8) movimientos.push([x - i, y + i]);
    if (x + i < 8 && y - i >= 0) movimientos.push([x + i, y - i]);
    if (x - i >= 0 && y - i >= 0) movimientos.push([x - i, y - i]);
  }
  return movimientos;
}

function movimientosTorre(x, y) {
  const movimientos = [];
  for (let i = 0; i < 8; i++) {
    if (i !== x) movimientos.push([i, y]);
    if (i !== y) movimientos.push([x, i]);
  }
  return movimientos;
}

function movimientosReina(x, y) {
  return [...movimientosTorre(x, y), ...movimientosAlfil(x, y)];
}

function movimientosRey(x, y) {
  const movimientos = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < 8 && ny < 8) {
        movimientos.push([nx, ny]);
      }
    }
  }
  return movimientos;
}

function movimientosPeon(x, y, color, tablero) {
  const dir = color === 'blanco' ? -1 : 1;
  const inicioFila = color === 'blanco' ? 6 : 1;
  const movimientos = [];
  const ny = y + dir;

  if (ny >= 0 && ny < 8 && tablero[ny][x] === null) {
    movimientos.push([x, ny]);
    if (y === inicioFila && tablero[ny + dir] && tablero[ny + dir][x] === null) {
      movimientos.push([x, ny + dir]);
    }
  }

  if (x > 0 && ny >= 0 && ny < 8) {
    const piezaIzq = tablero[ny][x - 1];
    if (piezaIzq && piezaIzq.color !== color) {
      movimientos.push([x - 1, ny]);
    }
  }

  if (x < 7 && ny >= 0 && ny < 8) {
    const piezaDer = tablero[ny][x + 1];
    if (piezaDer && piezaDer.color !== color) {
      movimientos.push([x + 1, ny]);
    }
  }
  return movimientos;
}

/**
 * Código que se ejecuta una sola vez al cargar la página
 * ✅ 2.1.8 - Acceder a partidas
 */
document.addEventListener("DOMContentLoaded", () => {
  if (window.codigoPartida) {
    fetch(`/api/estado?codigo=${window.codigoPartida}`) //fetch para obtener el estado inicial del tablero
      .then(res => res.json())
      .then(data => {
        if (data.tablero) {
          actualizarVista(
            data.tablero,
            data.turno,
            data.historial,
            data.capturadasBlancas,
            data.capturadasNegras
          );
        }
      })
      .catch(err => console.error("Error al cargar tablero inicial:", err));
  }

  const btnNuevo = document.getElementById("nuevojuego");
  const btnRendirse = document.getElementById("rendirse");

  if (btnNuevo) {
    btnNuevo.addEventListener("click", () => {
      location.reload();
    });
  }

  if (btnRendirse) {
    btnRendirse.addEventListener("click", () => {
      alert(`¡${turno === 'blanco' ? 'Negras' : 'Blancas'} ganan por rendición!`);
      location.reload();
    });
  }
});

/**
 * Polling cada 5 segundos para actualizar el tablero automáticamente
 * ✅ 2.1.9 - Actualizar estado periódicamente
 */
setInterval(() => {
  if (saltarProximoPolling) {
    console.log("⏭ Saltando polling tras mover pieza.");
    saltarProximoPolling = false;
    return;
  }
  if (!window.codigoPartida) return;
  fetch(`/api/estado?codigo=${window.codigoPartida}`)
    .then(res => res.json())
    .then(data => {
      if (data.tablero) {
        actualizarVista(
          data.tablero,
          data.turno,
          data.historial,
          data.capturadasBlancas,
          data.capturadasNegras
        );
        tableroActual = data.tablero;
      }
    })
    .catch(err => console.error("Error al actualizar tablero:", err));
}, 5000);
