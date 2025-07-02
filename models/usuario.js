const mongoose = require('mongoose');

const usuarioSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  nombre: { type: String, required: true },
  apellido: { type: String, required: true },
  fechaNacimiento: { type: Date, required: true },
  avatarUrl: { type: String, default: '/default-avatar.png' } // ← Campo agregado
});

module.exports = mongoose.model('Usuario', usuarioSchema);
