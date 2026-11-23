// Formulario de contacto/demo de la web pública (punto 3.7 del plan).
import { Router } from 'express';
import { insert, get } from '../db.js';
import { bad } from '../utils.js';

export const router = Router();

router.post('/', (req, res) => {
  const { name, email, venue_name = '', phone = '', city = '', tables = 0, plan_interest = '', message = '' } = req.body || {};
  if (!name || !email) return bad(res, 'Necesitamos al menos tu nombre y tu email.');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(email))) return bad(res, 'Email no válido.');
  const id = insert('leads', {
    name: String(name).slice(0, 80), email: String(email).toLowerCase().slice(0, 120),
    venue_name: String(venue_name).slice(0, 80), phone: String(phone).slice(0, 30),
    city: String(city).slice(0, 60), tables: Number(tables) || 0,
    plan_interest: String(plan_interest).slice(0, 20), message: String(message).slice(0, 600),
  });
  res.status(201).json({ ok: true, id, message: 'Gracias. Te escribimos en menos de 24 h laborables.' });
});
