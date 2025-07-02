const mongoose = require('mongoose');

const partidaSchema = new mongoose.Schema({
  codigo: { type: String, required: true, unique: true },
  creador: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
  invitado: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', default: null },
  colorCreador: { type: String, enum: ['blanco', 'negro'], required: true },
  estado: { type: String, enum: ['esperando', 'en juego', 'finalizado'], default: 'esperando' },
  turno: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', default: null },
  tablero: { type: Array, default: [] },
  historial: [{
    from: { x: Number, y: Number },
    to: { x: Number, y: Number },
    pieza: String
  }],
  capturadasBlancas: [String],
  capturadasNegras: [String],
  fechaCreacion: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Partida', partidaSchema);
