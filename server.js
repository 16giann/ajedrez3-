require('dotenv').config(); 
// ✅ Carga variables de entorno (p. ej. MONGO_URI)
//pm2 logs cit2008 para ver el link
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const path = require('path');
const mongoose = require('mongoose');
const { Types } = require('mongoose');
const multer = require('multer');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const Usuario = require('./models/usuario');
const Partida = require('./models/partida');

const app = express();
const PORT = process.env.PORT || 3000;
const MongoStore = require('connect-mongo');

// ===============================
// CONFIGURACIÓN SESIONES
// ===============================

app.use(session({
  secret: 'tu_secreto_mega_seguro',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: process.env.MONGO_URI }),
  cookie: { maxAge: 1000 * 60 * 60 }
}));
// ✅ 2.1.2 - Iniciar sesión → crea cookie de sesión
// ✅ 2.1.3 - Cierre de sesión → se invalida la cookie al destruir sesión

// ===============================
// CONEXIÓN A MONGO
// ===============================

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ Conectado a MongoDB'))
  .catch(err => console.error('❌ Error al conectar a MongoDB:', err));
// ✅ Base de datos MongoDB usada para usuarios y partidas

// ===============================
// SUBIDA DE ARCHIVOS (multer)
// ===============================

const uploadPath = path.join(__dirname, 'public/uploads');
if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
}
// Se asegura que exista carpeta para subir archivos (ej. avatares de usuario)

const upload = multer({
  dest: uploadPath,
  limits: { fileSize: 5 * 1024 * 1024 } // Máx. 5 MB
});
// Middleware para subir archivos

// ===============================
// CONFIGURACIÓN HANDLEBARS
// ===============================

const { engine } = require('express-handlebars');
app.engine('hbs', engine({
  extname: '.hbs',
  defaultLayout: 'main',
  layoutsDir: path.join(__dirname, 'views/layouts'),
  helpers: {
    json: context => JSON.stringify(context)
  }
}));
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));
// ✅ 2.2 - Interfaz basada en Handlebars para las páginas

// ===============================
// MIDDLEWARES GLOBALES
// ===============================

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
// Permite parsear formularios y servir archivos estáticos

app.use((req, res, next) => {
  res.locals.usuario = req.session.usuario;
  next();
});
// Hace disponible el usuario logueado en las vistas

// ===============================
// LÓGICA DE AJEDREZ
// ===============================

function movimientosCaballo(x, y) {
  const movs = [[2,1],[1,2],[-1,2],[-2,1],[-2,-1],[-1,-2],[1,-2],[2,-1]];
  return movs.map(([dx, dy]) => [x + dx, y + dy])
    .filter(([nx, ny]) => nx >= 0 && nx < 8 && ny >= 0 && ny < 8);
}
// Calcula movimientos válidos del caballo

function movimientosAlfil(x, y) {
  const movimientos = [];
  for (let i = 1; i < 8; i++) {
    if (x+i<8 && y+i<8) movimientos.push([x+i,y+i]);
    if (x-i>=0 && y+i<8) movimientos.push([x-i,y+i]);
    if (x+i<8 && y-i>=0) movimientos.push([x+i,y-i]);
    if (x-i>=0 && y-i>=0) movimientos.push([x-i,y-i]);
  }
  return movimientos;
}
// Movimientos válidos del alfil (diagonales)

function movimientosTorre(x, y) {
  const movimientos = [];
  for (let i = 0; i < 8; i++) {
    if (i !== x) movimientos.push([i, y]);
    if (i !== y) movimientos.push([x, i]);
  }
  return movimientos;
}
// Movimientos válidos de la torre (rectos)

function movimientosReina(x, y) {
  return [...movimientosTorre(x, y), ...movimientosAlfil(x, y)];
}
// Movimientos válidos de la reina (combinación torre + alfil)

function movimientosRey(x, y) {
  const movimientos = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < 8 && ny < 8) {
        movimientos.push([nx, ny]);
      }
    }
  }
  return movimientos;
}
// Movimientos válidos del rey (1 casilla en cualquier dirección)

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
// Movimientos válidos del peón (avance y capturas diagonales)

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
// Devuelve todos los movimientos válidos para cualquier pieza

function esMovimientoValido(tablero, from, to, piezaColor) {
  const pieza = tablero[from.y][from.x];
  if (!pieza || pieza.color !== piezaColor) return false;

  const piezaDestino = tablero[to.y][to.x];

  if (pieza.tipo === 'peon') {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dir = pieza.color === 'blanco' ? -1 : 1;

    if (dx === 0) {
      if (dy !== dir && dy !== 2 * dir) return false;
      if (piezaDestino) return false;
    } else if (Math.abs(dx) === 1) {
      if (dy !== dir) return false;
      if (!piezaDestino || piezaDestino.color === pieza.color) {
        return false;
      }
    } else {
      return false;
    }
  } else {
    const movimientosPosibles = obtenerMovimientosValidos(
      pieza.tipo,
      from.x,
      from.y,
      piezaColor,
      tablero
    );

    const existeMovimiento = movimientosPosibles.some(
      ([x, y]) => x === to.x && y === to.y
    );

    if (!existeMovimiento) return false;

    if (piezaDestino && piezaDestino.color === piezaColor) return false;

    if (['torre', 'alfil', 'reina'].includes(pieza.tipo)) {
      if (hayBloqueoEnCamino(tablero, from, to)) return false;
    }
  }

  return true;
}
// ✅ 2.1.8 - Jugar → Valida si el movimiento solicitado es legal según reglas del ajedrez

function hayBloqueoEnCamino(tablero, from, to) {
  const dx = Math.sign(to.x - from.x);
  const dy = Math.sign(to.y - from.y);
  let x = from.x + dx;
  let y = from.y + dy;

  while (x !== to.x || y !== to.y) {
    if (tablero[y][x] !== null) return true;
    x += dx;
    y += dy;
  }
  return false;
}
// Comprueba si hay piezas bloqueando el camino entre from → to (para torre, alfil, reina)

function crearTablero() {
  const piezas = ['torre', 'caballo', 'alfil', 'reina', 'rey', 'alfil', 'caballo', 'torre'];
  const tablero = Array.from({ length: 8 }, () => Array(8).fill(null));

  for (let x = 0; x < 8; x++) {
    tablero[7][x] = { tipo: piezas[x], color: 'blanco' };
    tablero[6][x] = { tipo: 'peon', color: 'blanco' };
    tablero[0][x] = { tipo: piezas[x], color: 'negro' };
    tablero[1][x] = { tipo: 'peon', color: 'negro' };
  }
  return tablero;
}
// ✅ 2.1.4 - Crear partida → Genera tablero inicial con piezas en posiciones correctas

function obtenerEmojiPieza(tipo, color) {
  const mapa = {
    torre: color === 'blanco' ? "♖" : "♜",
    caballo: color === 'blanco' ? "♘" : "♞",
    alfil: color === 'blanco' ? "♗" : "♝",
    reina: color === 'blanco' ? "♕" : "♛",
    rey: color === 'blanco' ? "♔" : "♚",
    peon: color === 'blanco' ? "♙" : "♟"
  };
  return mapa[tipo] || tipo;
}
// Devuelve el emoji correspondiente para renderizar las piezas en el frontend

// ===============================
// RUTAS
// ===============================

// ✅ HOME
app.get('/', (req, res) => {
  res.render('home', {
    title: 'Bienvenido a Ajedrez En Línea',
    estadisticas: {
      victorias: 0,
      empates: 4,
      derrotas: 6,
      rango: 'Noob',
      puntaje: -1216
    },
    partidasEnCurso: [
      { oponente: 'Elon Musk' },
      { oponente: 'Steve Jobs' }
    ],
    historial: [
      { resultado: 'Empate', oponente: 'Manuel Rodriguez' },
      { resultado: 'Derrota', oponente: 'Sofia Riquelme' }
    ],
    partidasPublicas: [
      { oponente: 'ElrubiusOMG', codigo: 'abc123' },
      { oponente: 'Vegetta777', codigo: 'xyz789' }
    ]
  });
});
// Página principal con estadísticas ficticias

// ✅ 2.1.1 - Registrarse
app.get('/registro', (req, res) => 
  res.render('registro', { title: 'Registro – Ajedrez Online' }));

app.post('/registro', async (req, res) => {
  const { nombre, apellido, username, password, confirmPassword, naci } = req.body;
  
  if (!username || !password || !confirmPassword)
    return res.send("Completa todos los campos obligatorios.");
  
  if (password !== confirmPassword)
    return res.send("Las contraseñas no coinciden.");
  
  if (await Usuario.findOne({ username }))
    return res.send("El usuario ya existe");
  
  const hash = await bcrypt.hash(password, 10); //2.2.1 encripta la contraseña con bcrypt
  await Usuario.create({ username, password: hash, nombre, apellido, fechaNacimiento: naci });
  res.redirect('/login');
});
// ✅ Crea cuenta nueva y guarda contraseña cifrada en MongoDB

// ✅ 2.1.2 - Iniciar sesión
app.get('/login', (req, res) => 
  res.render('login', { title: 'Iniciar Sesión – Ajedrez Online' }));

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const usuario = await Usuario.findOne({ username });
  
  if (!usuario)
    return res.send("Usuario no encontrado");
  
  if (!await bcrypt.compare(password, usuario.password))
    return res.send("Contraseña incorrecta");
  
  req.session.usuario = {
    _id: usuario._id,
    username: usuario.username
  };

  if (req.session.invitacionPendiente) {
    const codigo = req.session.invitacionPendiente;
    delete req.session.invitacionPendiente;
    return res.redirect(`/invitacion/${codigo}`);
  }

  res.redirect('/');
});
// ✅ Autentica usuario y crea cookie de sesión

// ✅ 2.1.3 - Cerrar sesión
app.get('/logout', (req, res) => 
  req.session.destroy(() => res.redirect('/'))
);
// ✅ Cierra sesión eliminando la cookie y redirige al inicio

// ✅ 2.1.4 - Crear partida
app.post('/crear-partida-home', async (req, res) => {
  if (!req.session.usuario) return res.redirect('/login');

  const { color } = req.body;
  if (!['blanco', 'negro'].includes(color))
    return res.send('Color inválido');

  const codigo = uuidv4().slice(0, 6);
  // ✅ Genera código único para la partida

  const partida = await Partida.create({
    codigo,
    creador: req.session.usuario._id,
    colorCreador: color,
    turno: color === 'blanco' ? req.session.usuario._id : null,
    invitado: null,
    estado: 'esperando',
    tablero: crearTablero(), // crea posiciones iniciales
    historial: [],
    capturadasBlancas: [],
    capturadasNegras: []
  });

  res.redirect(`/play?codigo=${partida.codigo}`);
});
// ✅ Crea una partida nueva y redirige al tablero

// ✅ 2.1.5 - Invitar a un jugador
app.get('/invitacion/:codigo', async (req, res) => {
  if (!req.session.usuario) {
    // si no está logueado, guarda invitación pendiente
    req.session.invitacionPendiente = req.params.codigo;
    return res.redirect('/login');
  }

  const partida = await Partida.findOne({ codigo: req.params.codigo });
  if (!partida)
    return res.render('mensaje', { mensaje: 'La partida no existe o el código es incorrecto' });

  if (partida.creador.equals(req.session.usuario._id)) {
    return res.render('mensaje', { mensaje: 'No puedes unirte a tu propia partida como oponente.' });
  }

  if (partida.invitado) {
    return res.render('mensaje', { mensaje: 'La partida ya tiene dos jugadores.' });
  }

  // ✅ se une como invitado
  partida.invitado = req.session.usuario._id;
  partida.estado = 'en juego';

  if (!partida.turno) {
    partida.turno = partida.colorCreador === 'blanco'
      ? partida.creador
      : partida.invitado;
  }

  await partida.save();

  res.redirect(`/play?codigo=${partida.codigo}`);
});
// ✅ Permite a otro jugador unirse a la partida mediante enlace

// ✅ 2.1.6 - Acceder a partida //api exclusivamente para el tablero y la logica
app.get('/api/estado', async (req, res) => {
  const partida = await Partida.findOne({ codigo: req.query.codigo });
  if (!partida) {
    return res.status(404).json({ error: 'Partida no encontrada' });
  }

  let turnoColor;
  if (partida.turno) {
    turnoColor = partida.creador.equals(partida.turno)
      ? partida.colorCreador
      : partida.colorCreador === 'blanco' ? 'negro' : 'blanco';
  } else {
    turnoColor = partida.colorCreador;
  }

  res.json({
    tablero: partida.tablero,
    turno: turnoColor,
    historial: partida.historial,
    capturadasBlancas: partida.capturadasBlancas,
    capturadasNegras: partida.capturadasNegras
  });
});
// ✅ Devuelve el estado actual de la partida (tablero, turno, historial) → usado para actualizar el frontend
// ✅ 2.1.8 - Actualizar estado → se llama cada 5 seg. en el frontend

// ✅ 2.1.8 - Jugar 
app.post('/api/mover', async (req, res) => {
  try {
    if (!req.session.usuario) {
      return res.status(401).json({ error: 'No autenticado' });
    }

    const userId = new Types.ObjectId(req.session.usuario._id);
    const { codigo, movimiento } = req.body;

    const partida = await Partida.findOne({ codigo });
    if (!partida) {
      return res.status(404).json({ error: 'Partida no encontrada' });
    }

    if (!partida.invitado) {
      return res.status(400).json({
        error: 'No puedes mover piezas hasta que se una un segundo jugador.'
      });
    }

    if (!partida.turno) {
      return res.status(400).json({
        error: 'No es posible mover todavía. El turno no está definido.'
      });
    }

    if (!partida.turno.equals(userId)) {
      return res.status(403).json({ error: 'No es tu turno' });
    }

    // ✅ Determinar color del jugador actual
    const userColor = partida.creador.equals(userId)
      ? partida.colorCreador
      : partida.colorCreador === 'blanco'
        ? 'negro'
        : 'blanco';

    // ✅ clonamos tablero para evitar mutaciones directas
    const tablero = JSON.parse(JSON.stringify(partida.tablero));

    const { from, to } = movimiento;
    const pieza = tablero[from.y][from.x];
    const piezaDestino = tablero[to.y][to.x];

    if (!pieza) {
      return res.status(400).json({ error: 'No hay pieza en la casilla origen' });
    }

    if (!esMovimientoValido(tablero, from, to, userColor)) {
      return res.status(400).json({ error: 'Movimiento inválido según reglas locales' });
    }

    // ✅ Captura pieza enemiga
    if (piezaDestino && piezaDestino.color !== pieza.color) {
      if (pieza.color === 'blanco') {
        partida.capturadasBlancas.push(piezaDestino.tipo);
      } else {
        partida.capturadasNegras.push(piezaDestino.tipo);
      }
    }

    // ✅ Mueve pieza en el tablero
    tablero[to.y][to.x] = pieza;
    tablero[from.y][from.x] = null;

    // ✅ guarda el historial con el emoji de la pieza
    const emojiPieza = obtenerEmojiPieza(pieza.tipo, pieza.color);
    partida.historial.push({
      from,
      to,
      pieza: emojiPieza
    });

    // ✅ alterna el turno
    partida.turno = partida.creador.equals(userId)
      ? partida.invitado
      : partida.creador;

    partida.tablero = tablero;
    await partida.save();

    let turnoColor;
    if (partida.turno) {
      turnoColor = partida.creador.equals(partida.turno)
        ? partida.colorCreador
        : partida.colorCreador === 'blanco' ? 'negro' : 'blanco';
    } else {
      turnoColor = partida.colorCreador;
    }

    res.json({
      success: true,
      tablero: partida.tablero,
      turno: turnoColor,
      historial: partida.historial,
      capturadasBlancas: partida.capturadasBlancas,
      capturadasNegras: partida.capturadasNegras,
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno en el servidor.' });
  }
});
// ✅ Ejecuta un movimiento → se guarda en Mongo y se actualiza el tablero

// ✅ Vista principal del tablero
app.get('/play', async (req, res) => {
  const codigo = req.query.codigo;
  if (!codigo) {
    return res.render('mensaje', { mensaje: 'Código de partida no especificado' });
  }
  const partida = await Partida.findOne({ codigo });
  if (!partida) {
    return res.render('mensaje', { mensaje: 'Partida no encontrada' });
  }

  res.render('play', {
    title: 'Partida de Ajedrez',
    codigo: partida.codigo,
    baseUrl: req.protocol + '://' + req.get('host'),
    tableroJSON: JSON.stringify(partida.tablero),
    turno: partida.turno
      ? (partida.creador.equals(partida.turno)
          ? partida.colorCreador
          : partida.colorCreador === 'blanco'
              ? 'negro'
              : 'blanco')
      : partida.colorCreador,
    historialJSON: JSON.stringify(partida.historial || []),
    capturadasBlancasJSON: JSON.stringify(partida.capturadasBlancas || []),
    capturadasNegrasJSON: JSON.stringify(partida.capturadasNegras || []),
    esCreador: partida.creador.equals(req.session.usuario._id),
    esEsperando: partida.estado === 'esperando',
    modo: partida.estado
  });
});
// ✅ Renderiza la página del tablero de juego

// ✅ 2.1.7 - Eliminar partida
app.get('/eliminar-partida/:codigo', async (req, res) => {
  if (!req.session.usuario) return res.redirect('/login');

  const partida = await Partida.findOne({ codigo: req.params.codigo });
  if (!partida)
    return res.render('mensaje', { mensaje: 'Partida no encontrada' });

  if (!partida.creador.equals(req.session.usuario._id)) {
    return res.render('mensaje', { mensaje: 'No tienes permiso para eliminar esta partida' });
  }

  res.render('eliminar-partida', {
    codigo: partida.codigo,
    titulo: 'Confirmar eliminación de partida'
  });
});
// ✅ Muestra confirmación antes de borrar partida

app.post('/eliminar-partida/:codigo', async (req, res) => {
  if (!req.session.usuario) return res.redirect('/login');

  const partida = await Partida.findOne({ codigo: req.params.codigo });
  if (!partida)
    return res.render('mensaje', { mensaje: 'Partida no encontrada' });

  if (!partida.creador.equals(req.session.usuario._id)) {
    return res.render('mensaje', { mensaje: 'No tienes permiso para eliminar esta partida' });
  }

  await Partida.deleteOne({ codigo: req.params.codigo });
  res.redirect('/');
});
// ✅ Elimina la partida de MongoDB solo si la pidió su creador

// Perfil (edición y avatar)
app.get('/perfil', async (req, res) => {
  if (!req.session.usuario) return res.redirect('/login');

  const usuario = await Usuario.findOne({ username: req.session.usuario.username });
  res.render('perfil', {
    title: 'Perfil – Ajedrez Online',
    usuario: {
      username: usuario.username,
      nombre: usuario.nombre,
      avatarUrl: usuario.avatarUrl || '/default-avatar.png'
    }
  });
});
// ✅ Muestra perfil del usuario

app.post('/perfil', async (req, res) => {
  const { nombre, correo } = req.body;
  await Usuario.updateOne(
    { username: req.session.usuario.username },
    { nombre, username: correo }
  );
  req.session.usuario.username = correo;
  res.redirect('/perfil');
});
// ✅ Actualiza datos del perfil

app.post('/perfil/avatar', upload.single('archivo-avatar'), async (req, res) => {
  const avatarPath = `/uploads/${req.file.filename}`;
  await Usuario.updateOne(
    { username: req.session.usuario.username },
    { avatarUrl: avatarPath }
  );
  res.redirect('/perfil');
});
// ✅ Guarda foto de avatar subida por el usuario

// Otras páginas informativas
app.get('/historia', (req, res) => 
  res.render('historia', { title: 'Historia del Ajedrez – Ajedrez Online' }));

app.get('/desarrollador', (req, res) => 
  res.render('desarrollador', { title: 'Desarrollador – Ajedrez Online' }));

app.listen(PORT, () => {
  console.log(`✅ Servidor corriendo en http://localhost:${PORT}`);
});
// ✅ Arranca servidor en puerto definido

